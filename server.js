require('dotenv').config();
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const dns = require('dns');
const bcrypt = require('bcrypt');
const { MongoClient } = require('mongodb');

const DNS_SERVERS = process.env.DNS_SERVERS?.split(',').map(server => server.trim()).filter(Boolean);
if (DNS_SERVERS?.length) dns.setServers(DNS_SERVERS);

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC = path.join(__dirname, 'public');
const PRIVATE = path.join(__dirname, 'private');
const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.MONGODB_DB || 'lectores_parroquia';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const DEFAULT_READER_PASSWORD = '11111111';
const SESSION_TTL = 8 * 60 * 60 * 1000;
const APP_TIME_ZONE = 'America/Costa_Rica';
const loginAttempts = new Map();
let client;
let database;

function securityHeaders() {
  return {
    'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    ...(process.env.NODE_ENV === 'production' ? { 'Strict-Transport-Security': 'max-age=31536000; includeSubDomains' } : {})
  };
}
function json(res, status, value) {
  res.writeHead(status, { ...securityHeaders(), 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(value));
}
function body(req) {
  return new Promise((resolve, reject) => {
    let raw = '', tooLarge = false;
    req.on('data', chunk => {
      if (tooLarge) return;
      raw += chunk;
      if (raw.length > 1e6) { tooLarge = true; raw = ''; reject(new Error('Solicitud demasiado grande')); }
    });
    req.on('end', () => { if (tooLarge) return; try { resolve(raw ? JSON.parse(raw) : {}); } catch { reject(new Error('JSON inválido')); } });
    req.on('error', reject);
  });
}
function cleanText(value, max = 120) { return String(value || '').trim().slice(0, max); }
function costaRicaDateTime(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(date);
  const value = type => parts.find(part => part.type === type)?.value;
  return `${value('year')}-${value('month')}-${value('day')}T${value('hour')}:${value('minute')}`;
}
function cookies(req) {
  return Object.fromEntries((req.headers.cookie || '').split(';').map(value => value.trim().split('='))
    .filter(parts => parts.length === 2).map(([key, value]) => [key, decodeURIComponent(value)]));
}
function sessionSignature(payload) {
  return crypto.createHmac('sha256', ADMIN_PASSWORD || '').update(payload).digest('base64url');
}
function createAdminToken(now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ expiresAt: now + SESSION_TTL, nonce: crypto.randomBytes(16).toString('hex') })).toString('base64url');
  return `${payload}.${sessionSignature(payload)}`;
}
function adminSession(req) {
  const token = cookies(req).admin_session;
  if (!token || !ADMIN_PASSWORD) return false;
  const [payload, signature, extra] = token.split('.');
  if (!payload || !signature || extra) return false;
  const expected = Buffer.from(sessionSignature(payload));
  const received = Buffer.from(signature);
  if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) return false;
  try { return JSON.parse(Buffer.from(payload, 'base64url').toString()).expiresAt > Date.now(); } catch { return false; }
}
function setSessionCookie(res, token, maxAge = SESSION_TTL / 1000) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `admin_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${secure}`);
}
function passwordMatches(value) {
  const expected = crypto.createHash('sha256').update(ADMIN_PASSWORD || '').digest();
  const received = crypto.createHash('sha256').update(String(value || '')).digest();
  return Boolean(ADMIN_PASSWORD) && crypto.timingSafeEqual(expected, received);
}
function legacyReaderPasswordHash(value = DEFAULT_READER_PASSWORD) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}
async function readerPasswordHash(value = DEFAULT_READER_PASSWORD) {
  return bcrypt.hash(String(value), 12);
}
async function readerPasswordMatches(reader, value) {
  const stored = reader.passwordHash || legacyReaderPasswordHash();
  if (stored.startsWith('$2')) return bcrypt.compare(String(value || ''), stored);
  const expected = Buffer.from(stored, 'hex');
  const received = Buffer.from(legacyReaderPasswordHash(String(value || '')), 'hex');
  return expected.length === received.length && crypto.timingSafeEqual(expected, received);
}
function requireAdmin(req, res) {
  if (adminSession(req)) return true;
  json(res, 401, { error: 'Debes iniciar sesiÃ³n como administrador' });
  return false;
}
function validateReader(input) {
  const name = cleanText(input.name);
  if (!name) throw new Error('El nombre es obligatorio');
  const availability = Array.isArray(input.availability)
    ? [...new Set(input.availability.map(id => cleanText(id, 80)).filter(Boolean))]
    : [];
  return { name, phone: cleanText(input.phone, 40), notes: cleanText(input.notes, 300), availability, active: input.active !== false };
}
function validateMass(input) {
  const name = cleanText(input.name);
  const time = /^\d{2}:\d{2}$/.test(input.time || '') ? input.time : '';
  const roles = Array.isArray(input.roles) ? [...new Set(input.roles.map(x => cleanText(x, 60)).filter(Boolean))] : [];
  const type = input.type === 'once' ? 'once' : 'weekly';
  if (!name || !time || !roles.length) throw new Error('Nombre, hora y al menos una función son obligatorios');
  if (type === 'weekly' && (!Number.isInteger(+input.weekday) || +input.weekday < 0 || +input.weekday > 6)) throw new Error('Día semanal inválido');
  if (type === 'once' && !/^\d{4}-\d{2}-\d{2}$/.test(input.date || '')) throw new Error('Fecha inválida');
  return { name, time, roles, type, weekday: type === 'weekly' ? +input.weekday : null, date: type === 'once' ? input.date : null, active: input.active !== false };
}
async function validateAssignment(input) {
  const massId = cleanText(input.massId, 80), readerId = cleanText(input.readerId, 80), role = cleanText(input.role, 60);
  const substituteIds = Array.isArray(input.substituteIds)
    ? [...new Set(input.substituteIds.map(id => cleanText(id, 80)).filter(id => id && id !== readerId))]
    : [];
  const month = /^\d{4}-\d{2}$/.test(input.month || '') ? input.month : '';
  const date = input.date && /^\d{4}-\d{2}-\d{2}$/.test(input.date) ? input.date : null;
  const [mass, reader] = await Promise.all([
    database.collection('masses').findOne({ id: massId }),
    database.collection('readers').findOne({ id: readerId })
  ]);
  if (!mass || !reader || !month || !mass.roles.includes(role)) throw new Error('Asignación inválida');
  if (!(reader.availability || []).includes(massId)) throw new Error('El lector no está disponible para esta misa');
  const [readerAssignments, substituteInOtherMass] = await Promise.all([
    database.collection('assignments').find({ month, readerId }).toArray(),
    database.collection('assignments').findOne({ month, massId: { $ne: massId }, substituteIds: readerId })
  ]);
  const hasOtherAssignment = readerAssignments.some(item => {
    const itemDate = item.date || null;
    if (item.massId !== massId) return true;
    if (!date || !itemDate) return item.role !== role || itemDate !== date;
    return itemDate === date && item.role !== role;
  });
  if (hasOtherAssignment || substituteInOtherMass) throw new Error('Este lector ya pertenece a otra misa durante este mes');
  return { massId, readerId, role, month, date, substituteIds };
}
function publicDoc(document, hidePrivateReaderData = false) {
  if (!document) return document;
  const { _id, passwordHash, ...value } = document;
  if (hidePrivateReaderData) delete value.phone;
  return value;
}

function shuffled(values) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index--) {
    const other = Math.floor(Math.random() * (index + 1));
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

function massOccurrences(mass, month) {
  if (mass.type === 'once') return mass.date?.startsWith(month) ? [mass.date] : [];
  const [year, monthNumber] = month.split('-').map(Number);
  const dates = [], lastDay = new Date(year, monthNumber, 0).getDate();
  for (let day = 1; day <= lastDay; day++) {
    const date = new Date(year, monthNumber - 1, day);
    if (date.getDay() === mass.weekday) dates.push(`${month}-${String(day).padStart(2, '0')}`);
  }
  return dates;
}

function rotationRoles(roles) {
  const normalized = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const priority = value => {
    const role = normalized(value);
    if (role.includes('primera')) return 0;
    if (role.includes('salmo')) return 1;
    if (role.includes('segunda')) return 2;
    if (role.includes('monicion')) return 3;
    return 4 + roles.indexOf(value);
  };
  return [...roles].sort((a, b) => priority(a) - priority(b));
}

async function randomAssignments(month) {
  if (!/^\d{4}-\d{2}$/.test(month || '')) throw new Error('Mes inválido');
  const [masses, readers, history] = await Promise.all([
    database.collection('masses').find({ active: true }).sort({ weekday: 1, time: 1 }).toArray(),
    database.collection('readers').find({ active: true }).toArray(),
    database.collection('assignments').find({ month: { $lt: month } }).sort({ month: 1, date: 1 }).toArray()
  ]);
  const readerById = new Map(readers.map(reader => [reader.id, reader]));
  const slots = masses.flatMap(mass => mass.roles.map(role => ({ id: `${mass.id}:${role}`, mass, role })));
  const [year, monthNumber] = month.split('-').map(Number);
  const previousMonth = `${monthNumber === 1 ? year - 1 : year}-${String(monthNumber === 1 ? 12 : monthNumber - 1).padStart(2, '0')}`;
  const previousTitulars = new Set(history.filter(item => item.month === previousMonth).map(item => item.readerId));
  const previousSubstitutes = new Set(history.filter(item => item.month === previousMonth).flatMap(item => item.substituteIds || []));
  const titleHistory = new Map(readers.map(reader => [reader.id, history.filter(item => item.readerId === reader.id)]));
  const lastTitle = new Map([...titleHistory].map(([id, items]) => [id, items.at(-1)]));

  // Emparejamiento de costo mínimo: llena el máximo de puestos y luego elige
  // la solución que mejor rota titulares, suplentes y horarios anteriores.
  const source = 0, readerOffset = 1, slotOffset = readerOffset + readers.length, sink = slotOffset + slots.length;
  const graph = Array.from({ length: sink + 1 }, () => []);
  function addEdge(from, to, capacity, cost, assignmentEdge = false) {
    const forward = { to, capacity, cost, reverse: graph[to].length, assignmentEdge };
    const backward = { to: from, capacity: 0, cost: -cost, reverse: graph[from].length, assignmentEdge: false };
    graph[from].push(forward);
    graph[to].push(backward);
  }
  readers.forEach((reader, index) => addEdge(source, readerOffset + index, 1, 0));
  slots.forEach((slot, index) => addEdge(slotOffset + index, sink, 1, 0));
  readers.forEach((reader, readerIndex) => slots.forEach((slot, slotIndex) => {
    if (!(reader.availability || []).includes(slot.mass.id)) return;
    const past = titleHistory.get(reader.id);
    const sameMassCount = past.filter(item => item.massId === slot.mass.id).length;
    const cost =
      (previousTitulars.has(reader.id) ? 1_000_000 : 0) +
      (previousSubstitutes.has(reader.id) ? -100_000 : 0) +
      (lastTitle.get(reader.id)?.massId === slot.mass.id ? 10_000 : 0) +
      past.length * 100 + sameMassCount * 25 + Math.floor(Math.random() * 10);
    addEdge(readerOffset + readerIndex, slotOffset + slotIndex, 1, cost, true);
  }));

  while (true) {
    const distance = Array(graph.length).fill(Infinity);
    const parentNode = Array(graph.length), parentEdge = Array(graph.length);
    distance[source] = 0;
    for (let pass = 0; pass < graph.length - 1; pass++) {
      let changed = false;
      for (let node = 0; node < graph.length; node++) {
        if (!Number.isFinite(distance[node])) continue;
        graph[node].forEach((candidate, index) => {
          if (candidate.capacity && distance[node] + candidate.cost < distance[candidate.to]) {
            distance[candidate.to] = distance[node] + candidate.cost;
            parentNode[candidate.to] = node;
            parentEdge[candidate.to] = index;
            changed = true;
          }
        });
      }
      if (!changed) break;
    }
    if (!Number.isFinite(distance[sink])) break;
    for (let node = sink; node !== source; node = parentNode[node]) {
      const selected = graph[parentNode[node]][parentEdge[node]];
      selected.capacity -= 1;
      graph[node][selected.reverse].capacity += 1;
    }
  }

  const slotReader = new Map();
  readers.forEach((reader, readerIndex) => graph[readerOffset + readerIndex].forEach(candidate => {
    if (candidate.assignmentEdge && candidate.capacity === 0) {
      slotReader.set(slots[candidate.to - slotOffset].id, reader.id);
    }
  }));

  const plans = new Map(masses.map(mass => [mass.id, { mass, substituteIds: [] }]));
  const used = new Set(slotReader.values());
  // Los titulares del mes anterior pasan primero a una banca de suplentes.
  const benchReaders = shuffled(readers.filter(reader => !used.has(reader.id))).sort((a, b) =>
    Number(previousTitulars.has(b.id)) - Number(previousTitulars.has(a.id)) ||
    titleHistory.get(a.id).length - titleHistory.get(b.id).length);
  for (const reader of benchReaders) {
    const compatible = shuffled(masses.filter(mass => (reader.availability || []).includes(mass.id)))
      .sort((a, b) => plans.get(a.id).substituteIds.length - plans.get(b.id).substituteIds.length ||
        Number(lastTitle.get(reader.id)?.massId === a.id) - Number(lastTitle.get(reader.id)?.massId === b.id));
    if (!compatible.length) continue;
    plans.get(compatible[0].id).substituteIds.push(reader.id);
    used.add(reader.id);
  }

  const generated = [];
  for (const mass of masses) {
    const roles = rotationRoles(mass.roles);
    const baseReaders = roles.map(role => slotReader.get(`${mass.id}:${role}`));
    for (const [dateIndex, date] of massOccurrences(mass, month).entries()) {
      baseReaders.forEach((readerId, baseIndex) => {
        if (!readerId || !readerById.has(readerId)) return;
        generated.push({
          id: crypto.randomUUID(), massId: mass.id, readerId,
          role: roles[(baseIndex + dateIndex) % roles.length],
          month, date, substituteIds: plans.get(mass.id).substituteIds,
          confirmationStatus: 'pending', createdAt: new Date()
        });
      });
    }
  }

  const mongoSession = client.startSession();
  try {
    await mongoSession.withTransaction(async () => {
      await database.collection('assignments').deleteMany({ month }, { session: mongoSession });
      if (generated.length) await database.collection('assignments').insertMany(generated, { session: mongoSession });
    });
  } finally { await mongoSession.endSession(); }
  return generated.map(publicDoc);
}

async function api(req, res, url) {
  const parts = url.pathname.split('/').filter(Boolean);
  const resource = parts[1], id = parts[2], action = parts[3];
  if (resource === 'auth') {
    if (id === 'status' && req.method === 'GET') return json(res, 200, { authenticated: adminSession(req) });
    if (id === 'login' && req.method === 'POST') {
      const key = req.socket.remoteAddress || 'local';
      const attempt = loginAttempts.get(key) || { count: 0, blockedUntil: 0 };
      if (attempt.blockedUntil > Date.now()) return json(res, 429, { error: 'Demasiados intentos. Espera un minuto.' });
      try {
        const input = await body(req);
        if (!passwordMatches(input.password)) {
          attempt.count += 1;
          if (attempt.count >= 5) { attempt.count = 0; attempt.blockedUntil = Date.now() + 60_000; }
          loginAttempts.set(key, attempt);
          return json(res, 401, { error: 'ContraseÃ±a incorrecta' });
        }
        loginAttempts.delete(key);
        const token = createAdminToken();
        setSessionCookie(res, token);
        return json(res, 200, { ok: true });
      } catch (error) { return json(res, 400, { error: error.message }); }
    }
    if (id === 'logout' && req.method === 'POST') {
      setSessionCookie(res, '', 0);
      return json(res, 200, { ok: true });
    }
    return json(res, 404, { error: 'Ruta no encontrada' });
  }
  if (resource === 'confirmations' && id && req.method === 'POST') {
    try {
      const input = await body(req);
      const assignment = await database.collection('assignments').findOne({ id });
      if (!assignment || !assignment.readerId) throw new Error('Esta asignación ya no tiene un lector pendiente');
      if (assignment.confirmationStatus && assignment.confirmationStatus !== 'pending') throw new Error('Esta decisión ya fue registrada y no se puede revertir');
      const [reader, mass] = await Promise.all([
        database.collection('readers').findOne({ id: assignment.readerId, active: true }),
        database.collection('masses').findOne({ id: assignment.massId })
      ]);
      if (!mass || !assignment.date || `${assignment.date}T${mass.time}` <= costaRicaDateTime()) {
        throw new Error('Esta misa ya comenzó o finalizó; ya no se puede cambiar la confirmación');
      }
      if (!reader || !await readerPasswordMatches(reader, input.password)) throw new Error('Contraseña incorrecta');
      if (input.action === 'confirm') {
        const updated = await database.collection('assignments').findOneAndUpdate(
          { id, readerId: reader.id, confirmationStatus: { $in: ['pending', null] } },
          { $set: { confirmationStatus: 'confirmed', confirmedAt: new Date() } },
          { returnDocument: 'after' }
        );
        if (!updated) throw new Error('Esta decisión ya fue registrada y no se puede revertir');
        return json(res, 200, publicDoc(updated));
      }
      if (input.action !== 'decline') throw new Error('Acción inválida');
      const sameCelebration = await database.collection('assignments').find({
        massId: assignment.massId, month: assignment.month, date: assignment.date
      }).toArray();
      const titularIds = new Set(sameCelebration.map(item => item.readerId).filter(Boolean));
      const otherMassAssignments = await database.collection('assignments').find({
        month: assignment.month, massId: { $ne: assignment.massId }
      }).toArray();
      const occupiedElsewhere = new Set(otherMassAssignments.flatMap(item => [item.readerId, ...(item.substituteIds || [])]).filter(Boolean));
      const substitutes = await database.collection('readers').find({
        id: { $in: assignment.substituteIds || [] }, active: true
      }).toArray();
      const substituteById = new Map(substitutes.map(item => [item.id, item]));
      const replacementId = (assignment.substituteIds || []).find(readerId =>
        substituteById.has(readerId) && !titularIds.has(readerId) && !occupiedElsewhere.has(readerId));
      const replacementLog = { readerId: reader.id, action: 'declined', at: new Date() };
      const mongoSession = client.startSession();
      let updated;
      try {
        await mongoSession.withTransaction(async () => {
          updated = await database.collection('assignments').findOneAndUpdate(
            { id, readerId: reader.id, confirmationStatus: { $in: ['pending', null] } },
            {
              $set: {
                readerId: replacementId || null,
                confirmationStatus: replacementId ? 'pending' : 'needs_replacement',
                originalReaderId: assignment.originalReaderId || reader.id
              },
              $unset: { confirmedAt: '' },
              $push: { confirmationHistory: replacementLog }
            },
            { returnDocument: 'after', session: mongoSession }
          );
          if (!updated) throw new Error('Esta decisión ya fue registrada y no se puede revertir');
          if (replacementId) {
            await database.collection('assignments').updateMany(
              { massId: assignment.massId, month: assignment.month, date: assignment.date },
              { $pull: { substituteIds: replacementId } },
              { session: mongoSession }
            );
          }
        });
      } finally { await mongoSession.endSession(); }
      return json(res, 200, publicDoc(updated));
    } catch (error) { return json(res, 400, { error: error.message }); }
  }
  if (resource === 'readers' && id && action === 'password' && req.method === 'POST') {
    try {
      const input = await body(req);
      const reader = await database.collection('readers').findOne({ id, active: true });
      if (!reader || !await readerPasswordMatches(reader, input.currentPassword)) throw new Error('La contraseña actual es incorrecta');
      const newPassword = String(input.newPassword || '');
      if (newPassword.length < 8 || newPassword.length > 72) throw new Error('La nueva contraseña debe tener entre 8 y 72 caracteres');
      if (newPassword !== String(input.confirmPassword || '')) throw new Error('Las contraseñas nuevas no coinciden');
      if (await readerPasswordMatches(reader, newPassword)) throw new Error('La nueva contraseña debe ser diferente de la actual');
      await database.collection('readers').updateOne(
        { id: reader.id },
        { $set: { passwordHash: await readerPasswordHash(newPassword), passwordChangedAt: new Date() } }
      );
      return json(res, 200, { ok: true });
    } catch (error) { return json(res, 400, { error: error.message }); }
  }
  if (req.method !== 'GET' && !requireAdmin(req, res)) return;
  if (resource === 'random-assignments' && req.method === 'POST') {
    try {
      const input = await body(req);
      return json(res, 201, await randomAssignments(input.month));
    } catch (error) {
      console.error('Error de asignación aleatoria:', error.message);
      return json(res, 400, { error: error.message });
    }
  }
  if (resource === 'replacement' && id && req.method === 'POST') {
    try {
      const input = await body(req);
      const [assignment, reader, mass] = await Promise.all([
        id === 'new' ? null : database.collection('assignments').findOne({ id }),
        database.collection('readers').findOne({ id: cleanText(input.readerId, 80), active: true }),
        database.collection('masses').findOne({ id: cleanText(input.massId, 80), active: true })
      ]);
      if (!reader) throw new Error('Lector inválido');
      const replacementMonth = cleanText(input.month, 7) || cleanText(input.date, 10).slice(0, 7);
      const otherMass = await database.collection('assignments').findOne({
        month: replacementMonth,
        massId: { $ne: cleanText(input.massId, 80) },
        $or: [{ readerId: reader.id }, { substituteIds: reader.id }]
      });
      if (otherMass) throw new Error('Este lector ya pertenece a otra misa durante este mes');
      const duplicate = await database.collection('assignments').findOne({
        massId: cleanText(input.massId, 80), date: cleanText(input.date, 10), readerId: reader.id,
        ...(id === 'new' ? {} : { id: { $ne: id } })
      });
      if (duplicate) throw new Error('Este lector ya está asignado en esta celebración');
      if (id === 'new') {
        const role = cleanText(input.role, 60), date = cleanText(input.date, 10), month = cleanText(input.month, 7);
        if (!mass || !mass.roles.includes(role) || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !date.startsWith(month)) throw new Error('Asignación inválida');
        const document = { id: crypto.randomUUID(), massId: mass.id, readerId: reader.id, role, date, month,
          substituteIds: [], confirmationStatus: 'pending', createdAt: new Date() };
        await database.collection('assignments').insertOne(document);
        return json(res, 201, publicDoc(document));
      }
      if (!assignment) throw new Error('Asignación inválida');
      const updated = await database.collection('assignments').findOneAndUpdate(
        { id },
        { $set: { readerId: reader.id, confirmationStatus: 'pending' }, $unset: { confirmedAt: '' } },
        { returnDocument: 'after' }
      );
      await database.collection('assignments').updateMany(
        { massId: assignment.massId, month: assignment.month, date: assignment.date },
        { $pull: { substituteIds: reader.id } }
      );
      return json(res, 200, publicDoc(updated));
    } catch (error) { return json(res, 400, { error: error.message }); }
  }
  if (resource === 'substitutes' && req.method === 'POST') {
    try {
      const input = await body(req);
      const massId = cleanText(input.massId, 80), date = cleanText(input.date, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Fecha inválida');
      const celebrationAssignments = await database.collection('assignments').find({ massId, date }).toArray();
      if (!celebrationAssignments.length) throw new Error('Primero debes asignar los titulares de esta misa');
      const month = date.slice(0, 7);
      const monthAssignments = await database.collection('assignments').find({ month }).toArray();
      const titularIds = new Set(monthAssignments.map(item => item.readerId).filter(Boolean));
      const requestedIds = Array.isArray(input.substituteIds)
        ? [...new Set(input.substituteIds.map(value => cleanText(value, 80)).filter(Boolean))]
        : [];
      const validReaders = requestedIds.length ? await database.collection('readers').find({
        id: { $in: requestedIds }, active: true
      }).toArray() : [];
      const validIds = new Set(validReaders.map(reader => reader.id));
      const substituteIds = requestedIds.filter(readerId => validIds.has(readerId) && !titularIds.has(readerId));
      const usedInOtherMass = monthAssignments.some(item => item.massId !== massId &&
        (item.substituteIds || []).some(readerId => substituteIds.includes(readerId)));
      if (usedInOtherMass) throw new Error('Un suplente solo puede pertenecer a una misa durante el mes');
      await database.collection('assignments').updateMany({ massId, date }, { $set: { substituteIds } });
      return json(res, 200, { substituteIds });
    } catch (error) { return json(res, 400, { error: error.message }); }
  }
  if (!['readers', 'masses', 'assignments'].includes(resource)) return json(res, 404, { error: 'Ruta no encontrada' });
  const collection = database.collection(resource);
  try {
    if (req.method === 'GET') {
      const values = await collection.find({}).sort({ createdAt: 1, name: 1 }).toArray();
      const hidePrivateReaderData = resource === 'readers' && !adminSession(req);
      return json(res, 200, values.map(value => publicDoc(value, hidePrivateReaderData)));
    }
    if (req.method === 'POST') {
      const input = await body(req);
      const value = resource === 'readers' ? validateReader(input) : resource === 'masses' ? validateMass(input) : await validateAssignment(input);
      if (resource === 'assignments') {
        value.confirmationStatus = 'pending';
        await collection.updateMany({ month: value.month, substituteIds: value.readerId }, { $pull: { substituteIds: value.readerId } });
        await collection.updateOne(
          { massId: value.massId, role: value.role, month: value.month, date: value.date },
          { $set: value, $setOnInsert: { id: crypto.randomUUID(), createdAt: new Date() } },
          { upsert: true }
        );
        const values = await collection.find({}).toArray();
        return json(res, 201, values.map(publicDoc));
      }
      const document = { id: crypto.randomUUID(), ...value,
        ...(resource === 'readers' ? { passwordHash: await readerPasswordHash(input.password || DEFAULT_READER_PASSWORD) } : {}),
        createdAt: new Date() };
      await collection.insertOne(document);
      return json(res, 201, publicDoc(document));
    }
    if (req.method === 'PUT' && id) {
      const input = await body(req);
      const value = resource === 'readers' ? validateReader(input) : resource === 'masses' ? validateMass(input) : await validateAssignment(input);
      if (resource === 'readers' && input.password) value.passwordHash = await readerPasswordHash(input.password);
      const result = await collection.findOneAndUpdate({ id }, { $set: value }, { returnDocument: 'after' });
      if (!result) return json(res, 404, { error: 'Registro no encontrado' });
      const today = costaRicaDateTime().slice(0, 10);
      if (resource === 'readers') {
        const allowedMassIds = value.active ? value.availability : [];
        await Promise.all([
          database.collection('assignments').deleteMany({ readerId: id, date: { $gte: today }, massId: { $nin: allowedMassIds } }),
          database.collection('assignments').updateMany({ date: { $gte: today }, massId: { $nin: allowedMassIds }, substituteIds: id }, { $pull: { substituteIds: id } })
        ]);
      }
      if (resource === 'masses') {
        await database.collection('assignments').deleteMany({ massId: id, date: { $gte: today }, role: { $nin: value.roles } });
      }
      return json(res, 200, publicDoc(result));
    }
    if (req.method === 'DELETE' && id) {
      const result = await collection.deleteOne({ id });
      if (!result.deletedCount) return json(res, 404, { error: 'Registro no encontrado' });
      if (resource === 'readers') await Promise.all([
        database.collection('assignments').deleteMany({ readerId: id }),
        database.collection('assignments').updateMany({ substituteIds: id }, { $pull: { substituteIds: id } })
      ]);
      if (resource === 'masses') await database.collection('assignments').deleteMany({ massId: id });
      return json(res, 200, { ok: true });
    }
    return json(res, 405, { error: 'Método no permitido' });
  } catch (error) {
    console.error('Error de API:', error.message);
    return json(res, 400, { error: error.code === 11000 ? 'Ya existe una asignación para esa función' : error.message });
  }
}

function serve(req, res, url) {
  let requested = url.pathname === '/' ? '/index.html' : url.pathname;
  const adminPage = requested === '/adminmode.html' || requested.startsWith('/admin/');
  if (adminPage && !adminSession(req)) {
    res.writeHead(302, { ...securityHeaders(), Location: '/login.html', 'Cache-Control': 'no-store' });
    return res.end();
  }
  if (requested === '/adminmode.html') requested = '/index.html';
  if (requested.startsWith('/admin/')) requested = requested.slice('/admin'.length);
  try { requested = decodeURIComponent(requested); } catch { res.writeHead(400, securityHeaders()); return res.end(); }
  const privateAsset = requested.startsWith('/private/');
  const root = privateAsset ? PRIVATE : PUBLIC;
  const relative = privateAsset ? requested.slice('/private'.length) : requested;
  const file = path.resolve(root, `.${relative}`);
  const relativeToRoot = path.relative(path.resolve(root), file);
  if (relativeToRoot.startsWith('..') || path.isAbsolute(relativeToRoot) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404, securityHeaders()); return res.end('No encontrado'); }
  const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml' };
  if (path.extname(file) === '.html') {
    const html = fs.readFileSync(file, 'utf8').replace(/<body([^>]*)>/, `<body$1 data-mode="${adminPage ? 'admin' : 'user'}">`);
    res.writeHead(200, { ...securityHeaders(), 'Content-Type': types['.html'], 'Cache-Control': 'no-store' });
    return res.end(html);
  }
  res.writeHead(200, { ...securityHeaders(), 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (url.pathname.startsWith('/api/')) api(req, res, url);
  else serve(req, res, url);
});

async function start() {
  if (!MONGODB_URI) throw new Error('Falta MONGODB_URI en el archivo .env');
  if (!ADMIN_PASSWORD) throw new Error('Falta ADMIN_PASSWORD en el archivo .env');
  client = new MongoClient(MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  await client.connect();
  database = client.db(DB_NAME);
  await Promise.all([
    database.collection('readers').createIndex({ id: 1 }, { unique: true }),
    database.collection('masses').createIndex({ id: 1 }, { unique: true }),
    database.collection('assignments').createIndex({ id: 1 }, { unique: true }),
    database.collection('assignments').createIndex({ massId: 1, role: 1, month: 1, date: 1 }, { unique: true })
  ]);
  server.listen(PORT, () => console.log(`Lectores conectado a MongoDB en http://localhost:${PORT}`));
}
if (require.main === module) start().catch(error => { console.error(`No se pudo iniciar: ${error.message}`); process.exitCode = 1; });
async function shutdown() { server.close(); if (client) await client.close(); }
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

module.exports = {
  server, start, body, securityHeaders, createAdminToken, adminSession,
  legacyReaderPasswordHash, readerPasswordHash, readerPasswordMatches,
  publicDoc, costaRicaDateTime
};
