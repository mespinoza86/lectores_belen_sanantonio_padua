require('dotenv').config();
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const { MongoClient } = require('mongodb');

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC = path.join(__dirname, 'public');
const PRIVATE = path.join(__dirname, 'private');
const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_HOSTS = process.env.MONGODB_HOSTS;
const DB_NAME = process.env.MONGODB_DB || 'lectores_parroquia';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const TEMPORARY_PASSWORD_LENGTH = 12;
const TEMPORARY_PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
const SESSION_TTL = 8 * 60 * 60 * 1000;
const PASSWORD_FAILURE_LIMIT = 10;
const PASSWORD_BLOCK_MS = 10 * 60 * 1000;
const APP_TIME_ZONE = 'America/Costa_Rica';
// Todas las paginas del planificador comparten public/app.html; solo cambia la vista inicial.
const PAGE_VIEWS = {
  '/index.html': 'dashboard',
  '/lectores.html': 'readers',
  '/misas.html': 'masses',
  '/asignar.html': 'assign',
  '/cobertura.html': 'coverage',
  '/reporte.html': 'report'
};
const loginAttempts = new Map();
let client;
let database;

function mongoConnectionUri() {
  if (!MONGODB_URI?.startsWith('mongodb+srv://') || !MONGODB_HOSTS) return MONGODB_URI;

  const srvUri = new URL(MONGODB_URI);
  const options = new URLSearchParams(srvUri.search);
  options.set('tls', 'true');
  options.set('authSource', options.get('authSource') || 'admin');
  options.set('replicaSet', options.get('replicaSet') || 'atlas-13r116-shard-0');
  const credentials = srvUri.username
    ? `${srvUri.username}${srvUri.password ? `:${srvUri.password}` : ''}@`
    : '';
  return `mongodb://${credentials}${MONGODB_HOSTS}${srvUri.pathname}?${options}`;
}

function passwordBlockedError(blockedUntil) {
  const error = new Error('Demasiados intentos incorrectos. Inténtalo nuevamente en 10 minutos.');
  error.statusCode = 429;
  error.retryAfter = Math.max(1, Math.ceil((blockedUntil.getTime() - Date.now()) / 1000));
  return error;
}
async function ensurePasswordAttemptAllowed(action, targetId) {
  const attempt = await database.collection('auth_rate_limits').findOne({ action, targetId });
  if (attempt?.blockedUntil && attempt.blockedUntil > new Date()) {
    throw passwordBlockedError(attempt.blockedUntil);
  }
}
async function registerPasswordFailure(action, targetId) {
  const collection = database.collection('auth_rate_limits');
  const now = new Date();
  await collection.updateOne(
    { action, targetId, blockedUntil: { $lte: now } },
    { $set: { failures: 0 }, $unset: { blockedUntil: '' } }
  );
  const attempt = await collection.findOneAndUpdate(
    { action, targetId },
    {
      $inc: { failures: 1 },
      $set: {
        lastFailedAt: now,
        expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000)
      },
      $setOnInsert: { createdAt: now }
    },
    { upsert: true, returnDocument: 'after' }
  );
  if (attempt.failures >= PASSWORD_FAILURE_LIMIT) {
    const blockedUntil = new Date(now.getTime() + PASSWORD_BLOCK_MS);
    await collection.updateOne(
      { action, targetId },
      {
        $set: {
          failures: 0,
          blockedUntil,
          expiresAt: new Date(blockedUntil.getTime() + 24 * 60 * 60 * 1000)
        }
      }
    );
    throw passwordBlockedError(blockedUntil);
  }
}
async function clearPasswordFailures(action, targetId) {
  await database.collection('auth_rate_limits').deleteOne({ action, targetId });
}
function passwordRouteError(res, error) {
  if (error.statusCode === 429) {
    res.setHeader('Retry-After', String(error.retryAfter));
    return json(res, 429, { error: error.message });
  }
  return json(res, 400, { error: error.message });
}

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
    .filter(parts => parts.length === 2).map(([key, value]) => {
      // Una cookie con codificación inválida no debe interrumpir la petición.
      try { return [key, decodeURIComponent(value)]; } catch { return [key, value]; }
    }));
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
function setSessionCookie(res, token, maxAge = null) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  const lifetime = maxAge === null ? '' : `; Max-Age=${maxAge}`;
  res.setHeader('Set-Cookie', `admin_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/${lifetime}${secure}`);
}
function passwordMatches(value) {
  const expected = crypto.createHash('sha256').update(ADMIN_PASSWORD || '').digest();
  const received = crypto.createHash('sha256').update(String(value || '')).digest();
  return Boolean(ADMIN_PASSWORD) && crypto.timingSafeEqual(expected, received);
}
function legacyReaderPasswordHash(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}
async function readerPasswordHash(value) {
  return bcrypt.hash(String(value), 12);
}
function temporaryReaderPassword() {
  return Array.from({ length: TEMPORARY_PASSWORD_LENGTH }, () =>
    TEMPORARY_PASSWORD_ALPHABET[crypto.randomInt(TEMPORARY_PASSWORD_ALPHABET.length)]).join('');
}
async function readerPasswordMatches(reader, value) {
  // Sin hash almacenado no hay contraseña válida: nunca se acepta un valor por defecto.
  const stored = reader?.passwordHash;
  if (!stored) return false;
  if (stored.startsWith('$2')) return bcrypt.compare(String(value || ''), stored);
  const expected = Buffer.from(stored, 'hex');
  const received = Buffer.from(legacyReaderPasswordHash(String(value || '')), 'hex');
  return expected.length === received.length && crypto.timingSafeEqual(expected, received);
}
function requireAdmin(req, res) {
  if (adminSession(req)) return true;
  json(res, 401, { error: 'Debes iniciar sesión como administrador' });
  return false;
}
function validateReader(input) {
  const name = cleanText(input.name);
  if (!name) throw new Error('El nombre es obligatorio');
  const legacyAvailability = Array.isArray(input.availability)
    ? [...new Set(input.availability.map(id => cleanText(id, 80)).filter(Boolean))] : [];
  const hasPreferenceModel = Array.isArray(input.preferredMassIds) || Array.isArray(input.unavailableMassIds);
  const preferredMassIds = Array.isArray(input.preferredMassIds)
    ? [...new Set(input.preferredMassIds.map(id => cleanText(id, 80)).filter(Boolean))]
    : legacyAvailability;
  const unavailableMassIds = Array.isArray(input.unavailableMassIds)
    ? [...new Set(input.unavailableMassIds.map(id => cleanText(id, 80)).filter(Boolean))]
    : [];
  if (preferredMassIds.some(id => unavailableMassIds.includes(id))) {
    throw new Error('Una misa no puede ser preferida y no disponible al mismo tiempo');
  }
  return {
    name,
    phone: cleanText(input.phone, 40),
    notes: cleanText(input.notes, 300),
    availability: preferredMassIds,
    preferredMassIds,
    unavailableMassIds,
    preferenceModel: hasPreferenceModel ? 1 : 0,
    active: input.active !== false,
    substituteOnly: input.substituteOnly === true
  };
}
function readerPrefersMass(reader, massId) {
  const preferred = Array.isArray(reader.preferredMassIds) ? reader.preferredMassIds : (reader.availability || []);
  return preferred.includes(massId);
}
function readerCanServeMass(reader, massId) {
  if (Array.isArray(reader.unavailableMassIds) || reader.preferenceModel === 1) {
    return !(reader.unavailableMassIds || []).includes(massId);
  }
  return (reader.availability || []).includes(massId);
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
function validateNews(input) {
  const title = cleanText(input.title, 140);
  const message = cleanText(input.message, 2000);
  const validDateTime = value => {
    const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value || '');
    if (!match) return false;
    const [, year, month, day, hour, minute] = match.map(Number);
    const date = new Date(Date.UTC(year, month - 1, day, hour, minute));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day && date.getUTCHours() === hour && date.getUTCMinutes() === minute;
  };
  const startsAt = validDateTime(input.startsAt) ? input.startsAt : costaRicaDateTime();
  const expiresAt = validDateTime(input.expiresAt) ? input.expiresAt : '';
  if (!title || !message) throw new Error('El título y el mensaje son obligatorios');
  if (!expiresAt) throw new Error('La fecha y hora de expiración son obligatorias');
  if (expiresAt <= startsAt) throw new Error('La expiración debe ser posterior al inicio de la noticia');
  return { title, message, startsAt, expiresAt, active: input.active !== false };
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
  if (!mass || !reader?.active || reader.substituteOnly || !readerCanServeMass(reader, massId) || !month || !mass.roles.includes(role)) {
    throw new Error(reader?.substituteOnly ? 'Este lector está configurado únicamente como suplente' : !readerCanServeMass(reader || {}, massId) ? 'Este lector indicó que no puede asistir a esta misa' : 'Asignación inválida');
  }
  return { massId, readerId, role, month, date, substituteIds };
}

async function changeManualAssignment(input) {
  const massId = cleanText(input.massId, 80);
  const role = cleanText(input.role, 60);
  const month = /^\d{4}-\d{2}$/.test(input.month || '') ? input.month : '';
  const date = /^\d{4}-\d{2}-\d{2}$/.test(input.date || '') ? input.date : '';
  const readerId = cleanText(input.readerId, 80);
  const previousReaderId = cleanText(input.previousReaderId, 80);
  const scope = input.scope === 'remaining' ? 'remaining' : input.scope === 'single' ? 'single' : '';
  if (!massId || !role || !month || !date || !scope || !date.startsWith(`${month}-`)) {
    throw new Error('Cambio de asignación inválido');
  }

  const mass = await database.collection('masses').findOne({ id: massId, active: true });
  if (!mass || !mass.roles.includes(role) || !massOccurrences(mass, month).includes(date)) {
    throw new Error('La misa, fecha o función ya no está disponible');
  }
  let reader = null;
  if (readerId) {
    reader = await database.collection('readers').findOne({ id: readerId, active: true });
    if (!reader || reader.substituteOnly || !readerCanServeMass(reader, massId)) {
      throw new Error(reader?.substituteOnly ? 'Este lector está configurado únicamente como suplente' : reader && !readerCanServeMass(reader, massId) ? 'Este lector indicó que no puede asistir a esta misa' : 'Lector inválido');
    }
  }

  const collection = database.collection('assignments');
  const mongoSession = client.startSession();
  let changed = 0;
  try {
    await mongoSession.withTransaction(async () => {
      const currentFilter = { massId, role, month, date };
      const current = await collection.findOne(currentFilter, { session: mongoSession });
      if ((current?.readerId || '') !== previousReaderId) {
        throw new Error('La asignación cambió mientras estaba abierta. Inténtalo nuevamente');
      }

      if (!readerId) {
        if (!current) return;
        const removalFilter = scope === 'remaining'
          ? { massId, month, readerId: current.readerId, date: { $gte: date } }
          : currentFilter;
        const result = await collection.deleteMany(removalFilter, { session: mongoSession });
        changed = result.deletedCount;
        return;
      }

      await collection.deleteMany(
        { month, readerId, massId: { $ne: massId } },
        { session: mongoSession }
      );
      await collection.deleteMany(
        {
          month,
          massId,
          readerId,
          date: scope === 'remaining' ? { $gte: date } : date,
          ...(scope === 'single' ? { role: { $ne: role } } : {})
        },
        { session: mongoSession }
      );
      await collection.updateMany(
        { month, substituteIds: readerId },
        { $pull: { substituteIds: readerId } },
        { session: mongoSession }
      );

      const dates = scope === 'remaining'
        ? massOccurrences(mass, month).filter(value => value >= date)
        : [date];
      for (const targetDate of dates) {
        let targetRole = role;
        let existing = await collection.findOne(
          { massId, role: targetRole, month, date: targetDate },
          { session: mongoSession }
        );
        if (targetDate !== date) {
          targetRole = '';
          if (previousReaderId) {
            const previousAssignment = await collection.findOne(
              { massId, month, date: targetDate, readerId: previousReaderId },
              { session: mongoSession }
            );
            if (previousAssignment) {
              targetRole = previousAssignment.role;
              existing = previousAssignment;
            }
          }
          if (!targetRole) {
            for (const candidateRole of mass.roles) {
              const candidate = await collection.findOne(
                { massId, role: candidateRole, month, date: targetDate },
                { session: mongoSession }
              );
              if (!candidate?.readerId) {
                targetRole = candidateRole;
                existing = candidate;
                break;
              }
            }
          }
          if (!targetRole) continue;
        }
        const celebration = await collection.findOne(
          { massId, month, date: targetDate, substituteIds: { $exists: true } },
          { session: mongoSession }
        );
        const value = {
          massId,
          role: targetRole,
          month,
          date: targetDate,
          readerId,
          substituteIds: celebration?.substituteIds || [],
          confirmationStatus: 'pending'
        };
        await collection.updateOne(
          { massId, role: targetRole, month, date: targetDate },
          {
            $set: value,
            $unset: { confirmedAt: '', originalReaderId: '', replacementLog: '' },
            $setOnInsert: { id: crypto.randomUUID(), createdAt: new Date() }
          },
          { upsert: true, session: mongoSession }
        );
        changed += 1;
      }
    });
  } finally {
    await mongoSession.endSession();
  }
  return { changed, scope };
}
function publicDoc(document, hidePrivateReaderData = false) {
  if (!document) return document;
  const { _id, passwordHash, ...value } = document;
  if (hidePrivateReaderData) {
    delete value.phone;
    delete value.mustChangePassword;
    delete value.passwordChangedAt;
    delete value.passwordResetAt;
  }
  return value;
}

// El público recibe una ventana reciente en lugar de toda la planificación histórica.
function previousMonth(month) {
  const [year, number] = month.split('-').map(Number);
  return `${number === 1 ? year - 1 : year}-${String(number === 1 ? 12 : number - 1).padStart(2, '0')}`;
}
function assignmentQuery(url, isAdmin) {
  const requested = [...new Set((url.searchParams.get('months') || url.searchParams.get('month') || '')
    .split(',').map(value => value.trim()).filter(value => /^\d{4}-\d{2}$/.test(value)))].slice(0, 12);
  if (requested.length) return { month: { $in: requested } };
  if (isAdmin) return {};
  const current = costaRicaDateTime().slice(0, 7);
  return { month: { $in: [previousMonth(current), current] } };
}
// El historial de confirmaciones y el titular original solo se entregan al administrador.
function publicAssignment(document, hideHistory) {
  const value = publicDoc(document);
  if (hideHistory) {
    delete value.confirmationHistory;
    delete value.originalReaderId;
  }
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

function assertReadersBelongToSingleMass(assignments) {
  const titularMassByReader = new Map();
  const substituteMassByReader = new Map();
  for (const assignment of assignments) {
    if (assignment.readerId) {
      const titularMass = titularMassByReader.get(assignment.readerId);
      const substituteMass = substituteMassByReader.get(assignment.readerId);
      if ((titularMass && titularMass !== assignment.massId) ||
          (substituteMass && substituteMass !== assignment.massId)) {
        throw new Error('La planificación intentó usar un titular en otra misa');
      }
      titularMassByReader.set(assignment.readerId, assignment.massId);
    }
    for (const readerId of assignment.substituteIds || []) {
      const titularMass = titularMassByReader.get(readerId);
      if (titularMass && titularMass !== assignment.massId) {
        throw new Error('La planificación intentó usar a un titular como suplente de otra misa');
      }
      const assignedMass = substituteMassByReader.get(readerId);
      if (assignedMass && assignedMass !== assignment.massId) {
        throw new Error('La planificación intentó colocar a un suplente en más de una misa');
      }
      substituteMassByReader.set(readerId, assignment.massId);
    }
  }
}

async function randomAssignments(month) {
  if (!/^\d{4}-\d{2}$/.test(month || '')) throw new Error('Mes inválido');
  const [masses, readers, history] = await Promise.all([
    database.collection('masses').find({ active: true }).sort({ weekday: 1, time: 1 }).toArray(),
    database.collection('readers').find({ active: true }).toArray(),
    database.collection('assignments').find({ month: { $lt: month } }).sort({ month: 1, date: 1 }).toArray()
  ]);
  const readerById = new Map(readers.map(reader => [reader.id, reader]));
  const roleSlots = masses.flatMap(mass => rotationRoles(mass.roles).map(role => ({
    id: `${mass.id}:${role}`, mass, role
  })));
  const substituteSlots = masses.map(mass => ({
    id: `${mass.id}:__substitute__`, mass, role: null, isSubstitute: true
  }));
  const slots = [...roleSlots, ...substituteSlots];
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
    if (!readerCanServeMass(reader, slot.mass.id)) return;
    if (reader.substituteOnly && !slot.isSubstitute) return;
    const past = titleHistory.get(reader.id);
    const sameMassCount = past.filter(item => item.massId === slot.mass.id).length;
    const preferenceCost = readerPrefersMass(reader, slot.mass.id) ? 0 : 10_000_000;
    const cost = preferenceCost + (slot.isSubstitute
      ? (previousTitulars.has(reader.id) ? -100_000 : 0) +
        (previousSubstitutes.has(reader.id) ? 10_000 : 0) +
        past.length * 10 + Math.floor(Math.random() * 10)
      : (previousTitulars.has(reader.id) ? 1_000_000 : 0) +
        (previousSubstitutes.has(reader.id) ? -100_000 : 0) +
        (lastTitle.get(reader.id)?.massId === slot.mass.id ? 10_000 : 0) +
        past.length * 100 + sameMassCount * 25 + Math.floor(Math.random() * 10));
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

  const plans = new Map(masses.map(mass => {
    const substituteId = slotReader.get(`${mass.id}:__substitute__`);
    return [mass.id, { mass, substituteIds: substituteId ? [substituteId] : [] }];
  }));

  const missingRoles = slots.filter(slot => !slotReader.get(slot.id));
  if (missingRoles.length) {
    throw new Error('No hay suficientes lectores disponibles para llenar todas las funciones y un suplente por misa');
  }

  const usedReaders = new Set(slotReader.values());
  const additionalSubstitutes = shuffled(readers.filter(reader => !usedReaders.has(reader.id)));
  for (const reader of additionalSubstitutes) {
    const compatibleMasses = shuffled(masses.filter(mass => readerCanServeMass(reader, mass.id)))
      .sort((a, b) =>
        Number(readerPrefersMass(reader, b.id)) - Number(readerPrefersMass(reader, a.id)) ||
        plans.get(a.id).substituteIds.length - plans.get(b.id).substituteIds.length);
    if (!compatibleMasses.length) continue;
    const selectedMass = compatibleMasses[0];
    plans.get(selectedMass.id).substituteIds.push(reader.id);
    usedReaders.add(reader.id);
  }

  const generated = [];
  for (const mass of masses) {
    const roles = rotationRoles(mass.roles);
    for (const [dateIndex, date] of massOccurrences(mass, month).entries()) {
      roles.forEach((baseRole, baseIndex) => {
        const readerId = slotReader.get(`${mass.id}:${baseRole}`);
        if (!readerId || !readerById.has(readerId)) return;
        generated.push({
          id: crypto.randomUUID(), massId: mass.id, readerId,
          role: roles[(baseIndex + dateIndex) % roles.length],
          month, date, substituteIds: [...plans.get(mass.id).substituteIds],
          confirmationStatus: 'pending', createdAt: new Date()
        });
      });
    }
  }

  assertReadersBelongToSingleMass(generated);
  const mongoSession = client.startSession();
  try {
    await mongoSession.withTransaction(async () => {
      await database.collection('assignments').deleteMany({ month }, { session: mongoSession });
      if (generated.length) await database.collection('assignments').insertMany(generated, { session: mongoSession });
    });
  } finally { await mongoSession.endSession(); }
  return generated.map(publicDoc);
}

async function fillUnassigned(month) {
  if (!/^\d{4}-\d{2}$/.test(month || '')) throw new Error('Mes inválido');
  const mongoSession = client.startSession();
  let summary;
  try {
    await mongoSession.withTransaction(async () => {
      const [masses, readers, existingAssignments] = await Promise.all([
        database.collection('masses').find({ active: true }, { session: mongoSession }).sort({ weekday: 1, time: 1 }).toArray(),
        database.collection('readers').find({ active: true }, { session: mongoSession }).toArray(),
        database.collection('assignments').find({ month }, { session: mongoSession }).toArray()
      ]);
      const titularMassByReader = new Map();
      const celebrationSubstitutes = new Map();
      const substituteCelebrationsByReader = new Map();
      const celebrationKey = (massId, date) => `${massId}:${date}`;

      for (const assignment of existingAssignments) {
        if (assignment.readerId) titularMassByReader.set(assignment.readerId, assignment.massId);
        const key = celebrationKey(assignment.massId, assignment.date);
        if (!celebrationSubstitutes.has(key)) {
          celebrationSubstitutes.set(key, {
            massId: assignment.massId,
            date: assignment.date,
            ids: [...(assignment.substituteIds || [])]
          });
        }
      }
      for (const [key, celebration] of celebrationSubstitutes) {
        for (const readerId of celebration.ids) {
          if (!substituteCelebrationsByReader.has(readerId)) {
            substituteCelebrationsByReader.set(readerId, new Set());
          }
          substituteCelebrationsByReader.get(readerId).add(key);
        }
      }

      const occupiedSlots = new Set(existingAssignments.map(item => `${item.massId}:${item.date}:${item.role}`));
      const generated = [];
      const touchedCelebrations = new Set();
      let movedSubstitutes = 0;
      let replacedSubstitutes = 0;

      const readerUsedOnDate = (readerId, massId, date) =>
        [...existingAssignments, ...generated].some(item =>
          item.readerId === readerId && item.massId === massId && item.date === date);
      const canBeTitular = (reader, mass, date) =>
        reader?.active && !reader.substituteOnly &&
        readerCanServeMass(reader, mass.id) &&
        !readerUsedOnDate(reader.id, mass.id, date);
      const substituteCelebrations = readerId =>
        [...(substituteCelebrationsByReader.get(readerId) || [])]
          .map(key => celebrationSubstitutes.get(key))
          .filter(Boolean);
      const belongsOnlyToMassAsSubstitute = (readerId, massId) => {
        const celebrations = substituteCelebrations(readerId);
        return celebrations.length > 0 && celebrations.every(item => item.massId === massId);
      };
      const unownedReaders = () => readers.filter(reader =>
        !titularMassByReader.has(reader.id) && !substituteCelebrationsByReader.has(reader.id));

      function replaceMovedSubstitute(sourceCelebration, removedIndex, movedReaderId) {
        const replacement = shuffled(unownedReaders())
          .filter(reader => reader.id !== movedReaderId && readerCanServeMass(reader, sourceCelebration.massId))
          .sort((a,b) => Number(readerPrefersMass(b,sourceCelebration.massId)) - Number(readerPrefersMass(a,sourceCelebration.massId)))[0];
        if (!replacement) return;
        sourceCelebration.ids.splice(removedIndex, 0, replacement.id);
        substituteCelebrationsByReader.set(
          replacement.id,
          new Set([celebrationKey(sourceCelebration.massId, sourceCelebration.date)])
        );
        replacedSubstitutes += 1;
      }

      const missingSlots = masses.flatMap(mass =>
        massOccurrences(mass, month).flatMap(date =>
          rotationRoles(mass.roles)
            .filter(role => !occupiedSlots.has(`${mass.id}:${date}:${role}`))
            .map(role => ({ mass, date, role }))));

      for (const { mass, date, role } of missingSlots) {
        const candidates = shuffled(readers).sort((a,b) =>
          Number(readerPrefersMass(b,mass.id)) - Number(readerPrefersMass(a,mass.id)));
        const targetKey = celebrationKey(mass.id, date);
        const targetCelebration = celebrationSubstitutes.get(targetKey) || {
          massId: mass.id, date, ids: []
        };
        if (!celebrationSubstitutes.has(targetKey)) {
          celebrationSubstitutes.set(targetKey, targetCelebration);
        }
        const chooseCandidate = preferred => {
          const pool=candidates.filter(candidate=>readerPrefersMass(candidate,mass.id)===preferred);
          let selected = pool.find(candidate =>
            targetCelebration.ids.includes(candidate.id) &&
            belongsOnlyToMassAsSubstitute(candidate.id, mass.id) &&
            canBeTitular(candidate, mass, date));
          if (!selected) selected = pool.find(candidate =>
            !titularMassByReader.has(candidate.id) &&
            !substituteCelebrationsByReader.has(candidate.id) &&
            canBeTitular(candidate, mass, date));
          if (!selected) selected = pool.find(candidate => {
            const celebrations = substituteCelebrations(candidate.id);
            return !titularMassByReader.has(candidate.id) &&
              celebrations.length === 1 &&
              celebrations[0].massId !== mass.id &&
              canBeTitular(candidate, mass, date);
          });
          if (!selected) selected = pool.find(candidate =>
            titularMassByReader.get(candidate.id) === mass.id &&
            (!substituteCelebrationsByReader.has(candidate.id) ||
              belongsOnlyToMassAsSubstitute(candidate.id, mass.id)) &&
            canBeTitular(candidate, mass, date));
          return selected;
        };
        const reader = chooseCandidate(true) || chooseCandidate(false);
        if (!reader) continue;

        const sourceCelebrations = substituteCelebrations(reader.id);
        const sourceCelebration = sourceCelebrations.find(item =>
          item.massId !== mass.id || (item.massId === mass.id && item.date === date));
        if (sourceCelebration) {
          const sourceKey = celebrationKey(sourceCelebration.massId, sourceCelebration.date);
          const removedIndex = sourceCelebration.ids.indexOf(reader.id);
          if (removedIndex >= 0) sourceCelebration.ids.splice(removedIndex, 1);
          const readerCelebrations = substituteCelebrationsByReader.get(reader.id);
          readerCelebrations?.delete(sourceKey);
          if (!readerCelebrations?.size) substituteCelebrationsByReader.delete(reader.id);
          touchedCelebrations.add(sourceKey);
          if (sourceCelebration.massId !== mass.id) {
            movedSubstitutes += 1;
            replaceMovedSubstitute(sourceCelebration, removedIndex, reader.id);
          }
        }

        titularMassByReader.set(reader.id, mass.id);
        generated.push({
          id: crypto.randomUUID(),
          massId: mass.id,
          readerId: reader.id,
          role,
          month,
          date,
          substituteIds: [...targetCelebration.ids],
          confirmationStatus: 'pending',
          createdAt: new Date()
        });
        occupiedSlots.add(`${mass.id}:${date}:${role}`);
      }

      for (const assignment of generated) {
        assignment.substituteIds = [
          ...(celebrationSubstitutes.get(celebrationKey(assignment.massId, assignment.date))?.ids || [])
        ];
      }
      const finalAssignments = [...existingAssignments, ...generated].map(assignment =>
        touchedCelebrations.has(celebrationKey(assignment.massId, assignment.date))
          ? {
              ...assignment,
              substituteIds: [
                ...(celebrationSubstitutes.get(celebrationKey(assignment.massId, assignment.date))?.ids || [])
              ]
            }
          : assignment);
      assertReadersBelongToSingleMass(finalAssignments);

      for (const key of touchedCelebrations) {
        const celebration = celebrationSubstitutes.get(key);
        await database.collection('assignments').updateMany(
          { month, massId: celebration.massId, date: celebration.date },
          { $set: { substituteIds: [...celebration.ids] } },
          { session: mongoSession }
        );
      }
      if (generated.length) {
        await database.collection('assignments').insertMany(generated, { session: mongoSession });
      }
      summary = {
        filled: generated.length,
        remaining: missingSlots.length - generated.length,
        movedSubstitutes,
        replacedSubstitutes
      };
    });
  } finally {
    await mongoSession.endSession();
  }
  return summary;
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
          return json(res, 401, { error: 'Contraseña incorrecta' });
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
      await ensurePasswordAttemptAllowed('confirmation', id);
      if (!reader || !await readerPasswordMatches(reader, input.password)) {
        await registerPasswordFailure('confirmation', id);
        throw new Error('Contraseña incorrecta');
      }
      await clearPasswordFailures('confirmation', id);
      if (reader.mustChangePassword) {
        throw new Error('Debes cambiar la contraseña temporal antes de confirmar una asignación');
      }
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
    } catch (error) { return passwordRouteError(res, error); }
  }
  if (resource === 'readers' && id && action === 'password' && req.method === 'POST') {
    try {
      const input = await body(req);
      const reader = await database.collection('readers').findOne({ id, active: true });
      await ensurePasswordAttemptAllowed('password-change', id);
      if (!reader || !await readerPasswordMatches(reader, input.currentPassword)) {
        await registerPasswordFailure('password-change', id);
        throw new Error('La contraseña actual es incorrecta');
      }
      await clearPasswordFailures('password-change', id);
      const newPassword = String(input.newPassword || '');
      if (newPassword.length < 8 || newPassword.length > 72) throw new Error('La nueva contraseña debe tener entre 8 y 72 caracteres');
      if (newPassword !== String(input.confirmPassword || '')) throw new Error('Las contraseñas nuevas no coinciden');
      if (await readerPasswordMatches(reader, newPassword)) throw new Error('La nueva contraseña debe ser diferente de la actual');
      await database.collection('readers').updateOne(
        { id: reader.id },
        {
          $set: {
            passwordHash: await readerPasswordHash(newPassword),
            mustChangePassword: false,
            passwordChangedAt: new Date()
          }
        }
      );
      return json(res, 200, { ok: true });
    } catch (error) { return passwordRouteError(res, error); }
  }
  if (resource === 'readers' && id && action === 'profile' && req.method === 'POST') {
    try {
      const input = await body(req);
      const reader = await database.collection('readers').findOne({ id, active: true });
      await ensurePasswordAttemptAllowed('profile-edit', id);
      if (!reader || !await readerPasswordMatches(reader, input.password)) {
        await registerPasswordFailure('profile-edit', id);
        throw new Error('Contraseña incorrecta');
      }
      await clearPasswordFailures('profile-edit', id);
      if (reader.mustChangePassword) throw new Error('Debes cambiar la contraseña temporal antes de editar tus datos');
      if (!input.profile) return json(res, 200, publicDoc(reader));

      const value = validateReader({ ...input.profile, active: true });
      const updated = await database.collection('readers').findOneAndUpdate(
        { id: reader.id, active: true },
        { $set: {
          name: value.name,
          phone: value.phone,
          notes: value.notes,
          availability: value.availability,
          preferredMassIds: value.preferredMassIds,
          unavailableMassIds: value.unavailableMassIds,
          preferenceModel: value.preferenceModel,
          substituteOnly: value.substituteOnly
        } },
        { returnDocument: 'after' }
      );
      const today = costaRicaDateTime().slice(0, 10);
      const allowedMassIds = await database.collection('masses').find({ active: true }).project({ id: 1 }).toArray();
      const serviceableMassIds = value.active ? allowedMassIds.map(item => item.id).filter(massId => !value.unavailableMassIds.includes(massId)) : [];
      const titularFilter = value.substituteOnly
        ? { readerId: id, date: { $gte: today } }
        : { readerId: id, date: { $gte: today }, massId: { $nin: serviceableMassIds } };
      await Promise.all([
        database.collection('assignments').deleteMany(titularFilter),
        database.collection('assignments').updateMany(
          { date: { $gte: today }, massId: { $nin: serviceableMassIds }, substituteIds: id },
          { $pull: { substituteIds: id } }
        )
      ]);
      return json(res, 200, publicDoc(updated));
    } catch (error) { return passwordRouteError(res, error); }
  }
  if (req.method !== 'GET' && !requireAdmin(req, res)) return;
  if (resource === 'news') {
    const collection = database.collection('news');
    try {
      if (req.method === 'GET') {
        const query = adminSession(req) ? {} : { active: true, startsAt: { $lte: costaRicaDateTime() }, expiresAt: { $gt: costaRicaDateTime() } };
        const values = await collection.find(query).sort({ startsAt: -1, createdAt: -1 }).toArray();
        return json(res, 200, values.map(publicDoc));
      }
      if (req.method === 'POST') {
        const value = validateNews(await body(req));
        const document = { id: crypto.randomUUID(), ...value, createdAt: new Date(), updatedAt: new Date() };
        await collection.insertOne(document);
        return json(res, 201, publicDoc(document));
      }
      if (req.method === 'PUT' && id) {
        const value = validateNews(await body(req));
        const updated = await collection.findOneAndUpdate({ id }, { $set: { ...value, updatedAt: new Date() } }, { returnDocument: 'after' });
        if (!updated) return json(res, 404, { error: 'Noticia no encontrada' });
        return json(res, 200, publicDoc(updated));
      }
      if (req.method === 'DELETE' && id) {
        const result = await collection.deleteOne({ id });
        if (!result.deletedCount) return json(res, 404, { error: 'Noticia no encontrada' });
        return json(res, 200, { ok: true });
      }
      return json(res, 405, { error: 'Método no permitido' });
    } catch (error) {
      console.error('Error de noticias:', error.message);
      return json(res, 400, { error: error.message });
    }
  }
  if (resource === 'readers' && id && action === 'reset-password' && req.method === 'POST') {
    try {
      const temporaryPassword = temporaryReaderPassword();
      const updated = await database.collection('readers').findOneAndUpdate(
        { id },
        {
          $set: {
            passwordHash: await readerPasswordHash(temporaryPassword),
            mustChangePassword: true,
            passwordResetAt: new Date()
          },
          $unset: { passwordChangedAt: '' }
        },
        { returnDocument: 'after' }
      );
      if (!updated) return json(res, 404, { error: 'Lector no encontrado' });
      await clearPasswordFailures('password-change', id);
      return json(res, 200, {
        reader: publicDoc(updated),
        temporaryPassword
      });
    } catch (error) {
      return json(res, 400, { error: error.message });
    }
  }
  if (resource === 'random-assignments' && req.method === 'POST') {
    try {
      const input = await body(req);
      return json(res, 201, await randomAssignments(input.month));
    } catch (error) {
      console.error('Error de asignación aleatoria:', error.message);
      return json(res, 400, { error: error.message });
    }
  }
  if (resource === 'fill-unassigned' && req.method === 'POST') {
    try {
      const input = await body(req);
      return json(res, 200, await fillUnassigned(input.month));
    } catch (error) {
      console.error('Error al asignar puestos pendientes:', error.message);
      return json(res, 400, { error: error.message });
    }
  }
  if (resource === 'assignment-change' && req.method === 'POST') {
    try {
      const input = await body(req);
      return json(res, 200, await changeManualAssignment(input));
    } catch (error) {
      console.error('Error cambiando asignación manual:', error.message);
      return json(res, 400, { error: error.code === 11000 ? 'Ya existe una asignación para esa función' : error.message });
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
      if (!reader || reader.substituteOnly) throw new Error(reader?.substituteOnly ? 'Este lector está configurado únicamente como suplente' : 'Lector inválido');
      if (!mass || !readerCanServeMass(reader, mass.id)) throw new Error('Este lector indicó que no puede asistir a esta misa');
      const replacementMonth = cleanText(input.month, 7) || cleanText(input.date, 10).slice(0, 7);
      const otherUse = await database.collection('assignments').findOne({
        month: replacementMonth,
        ...(assignment ? { id: { $ne: assignment.id } } : {}),
        $or: [{ readerId: reader.id }, { substituteIds: reader.id }]
      });
      if (otherUse) throw new Error('Cada persona solo puede pertenecer a una misa durante el mes, como titular o suplente');
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
      const validIds = new Set(validReaders
        .filter(reader => readerCanServeMass(reader, massId))
        .map(reader => reader.id));
      const substituteIds = requestedIds.filter(readerId => validIds.has(readerId) && !titularIds.has(readerId));
      if (!substituteIds.length) throw new Error('Cada misa debe conservar al menos un suplente');
      const mongoSession = client.startSession();
      try {
        await mongoSession.withTransaction(async () => {
          await database.collection('assignments').updateMany(
            { month, massId: { $ne: massId }, substituteIds: { $in: substituteIds } },
            { $pull: { substituteIds: { $in: substituteIds } } },
            { session: mongoSession }
          );
          await database.collection('assignments').updateMany(
            { massId, month },
            { $set: { substituteIds } },
            { session: mongoSession }
          );
        });
      } finally {
        await mongoSession.endSession();
      }
      return json(res, 200, { substituteIds });
    } catch (error) { return json(res, 400, { error: error.message }); }
  }
  if (!['readers', 'masses', 'assignments'].includes(resource)) return json(res, 404, { error: 'Ruta no encontrada' });
  const collection = database.collection(resource);
  try {
    if (req.method === 'GET') {
      const isAdminRequest = adminSession(req);
      const query = resource === 'assignments' ? assignmentQuery(url, isAdminRequest) : {};
      const values = await collection.find(query).sort({ createdAt: 1, name: 1 }).toArray();
      if (resource === 'assignments') return json(res, 200, values.map(value => publicAssignment(value, !isAdminRequest)));
      return json(res, 200, values.map(value => publicDoc(value, resource === 'readers' && !isAdminRequest)));
    }
    if (req.method === 'POST') {
      const input = await body(req);
      const value = resource === 'readers' ? validateReader(input) : resource === 'masses' ? validateMass(input) : await validateAssignment(input);
      if (resource === 'assignments') {
        value.confirmationStatus = 'pending';
        const mongoSession = client.startSession();
        try {
          await mongoSession.withTransaction(async () => {
            await collection.deleteMany(
              {
                month: value.month,
                readerId: value.readerId,
                $or: [
                  { massId: { $ne: value.massId } },
                  { role: { $ne: value.role } }
                ]
              },
              { session: mongoSession }
            );
            await collection.updateMany(
              { month: value.month, substituteIds: value.readerId },
              { $pull: { substituteIds: value.readerId } },
              { session: mongoSession }
            );
            await collection.updateOne(
              { massId: value.massId, role: value.role, month: value.month, date: value.date },
              { $set: value, $setOnInsert: { id: crypto.randomUUID(), createdAt: new Date() } },
              { upsert: true, session: mongoSession }
            );
          });
        } finally {
          await mongoSession.endSession();
        }
        const values = await collection.find({}).toArray();
        return json(res, 201, values.map(publicDoc));
      }
      let temporaryPassword;
      if (resource === 'readers') temporaryPassword = temporaryReaderPassword();
      const document = { id: crypto.randomUUID(), ...value,
        ...(resource === 'readers' ? {
          passwordHash: await readerPasswordHash(temporaryPassword),
          mustChangePassword: true,
          passwordResetAt: new Date()
        } : {}),
        createdAt: new Date() };
      await collection.insertOne(document);
      if (resource === 'readers') {
        return json(res, 201, { reader: publicDoc(document), temporaryPassword });
      }
      return json(res, 201, publicDoc(document));
    }
    if (req.method === 'PUT' && id) {
      const input = await body(req);
      const value = resource === 'readers' ? validateReader(input) : resource === 'masses' ? validateMass(input) : await validateAssignment(input);
      const result = await collection.findOneAndUpdate({ id }, { $set: value }, { returnDocument: 'after' });
      if (!result) return json(res, 404, { error: 'Registro no encontrado' });
      const today = costaRicaDateTime().slice(0, 10);
      if (resource === 'readers') {
        const masses = await database.collection('masses').find({ active: true }).project({ id: 1 }).toArray();
        const allowedMassIds = value.active ? masses.map(item => item.id).filter(massId => !value.unavailableMassIds.includes(massId)) : [];
        const titularFilter = value.active && !value.substituteOnly
          ? { readerId: id, date: { $gte: today }, massId: { $nin: allowedMassIds } }
          : { readerId: id, date: { $gte: today } };
        await Promise.all([
          database.collection('assignments').deleteMany(titularFilter),
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
  if (requested === '/estadisticas.html') {
    res.writeHead(302, { ...securityHeaders(), Location: '/login.html', 'Cache-Control': 'no-store' });
    return res.end();
  }
  const adminPage = requested === '/adminmode.html' || requested.startsWith('/admin/');
  if (adminPage && !adminSession(req)) {
    res.writeHead(302, { ...securityHeaders(), Location: '/login.html', 'Cache-Control': 'no-store' });
    return res.end();
  }
  if (requested === '/adminmode.html') requested = '/index.html';
  if (requested.startsWith('/admin/')) requested = requested.slice('/admin'.length);
  const pageView = PAGE_VIEWS[requested];
  if (pageView) requested = '/app.html';
  try { requested = decodeURIComponent(requested); } catch { res.writeHead(400, securityHeaders()); return res.end(); }
  const privateAsset = requested.startsWith('/private/');
  const root = privateAsset ? PRIVATE : PUBLIC;
  const relative = privateAsset ? requested.slice('/private'.length) : requested;
  const file = path.resolve(root, `.${relative}`);
  const relativeToRoot = path.relative(path.resolve(root), file);
  if (relativeToRoot.startsWith('..') || path.isAbsolute(relativeToRoot) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404, securityHeaders()); return res.end('No encontrado'); }
  const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml' };
  if (path.extname(file) === '.html') {
    const attributes = `data-mode="${adminPage ? 'admin' : 'user'}"${pageView ? ` data-page="${pageView}"` : ''}`;
    const html = fs.readFileSync(file, 'utf8').replace(/<body([^>]*)>/, `<body$1 ${attributes}>`);
    res.writeHead(200, { ...securityHeaders(), 'Content-Type': types['.html'], 'Cache-Control': 'no-store' });
    return res.end(html);
  }
  res.writeHead(200, { ...securityHeaders(), 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}

const server = http.createServer((req, res) => {
  let url;
  try {
    url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  } catch {
    // Una cabecera Host malformada no debe derribar el proceso.
    res.writeHead(400, { ...securityHeaders(), 'Content-Type': 'text/plain; charset=utf-8', Connection: 'close' });
    return res.end('Solicitud inválida');
  }
  const failed = error => {
    console.error('Error no controlado:', error?.message || error);
    if (res.headersSent) return res.destroy();
    json(res, 500, { error: 'Error interno del servidor' });
  };
  if (url.pathname.startsWith('/api/')) api(req, res, url).catch(failed);
  else { try { serve(req, res, url); } catch (error) { failed(error); } }
});

async function start() {
  if (!MONGODB_URI) throw new Error('Falta MONGODB_URI en el archivo .env');
  if (!ADMIN_PASSWORD) throw new Error('Falta ADMIN_PASSWORD en el archivo .env');
  client = new MongoClient(mongoConnectionUri(), { serverSelectionTimeoutMS: 30000 });
  await client.connect();
  database = client.db(DB_NAME);
  await Promise.all([
    database.collection('readers').createIndex({ id: 1 }, { unique: true }),
    database.collection('masses').createIndex({ id: 1 }, { unique: true }),
    database.collection('assignments').createIndex({ id: 1 }, { unique: true }),
    database.collection('assignments').createIndex({ massId: 1, role: 1, month: 1, date: 1 }, { unique: true }),
    database.collection('news').createIndex({ id: 1 }, { unique: true }),
    database.collection('news').createIndex({ active: 1, startsAt: 1, expiresAt: 1 }),
    database.collection('auth_rate_limits').createIndex({ action: 1, targetId: 1 }, { unique: true }),
    database.collection('auth_rate_limits').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })
  ]);
  server.listen(PORT, () => console.log(`Lectores conectado a MongoDB en http://localhost:${PORT}`));
}
if (require.main === module) start().catch(error => {
  console.error(`No se pudo iniciar: ${error.message}`);
  if (error.cause) console.error('Causa:', error.cause);
  if (error.reason?.servers) {
    for (const [host, status] of error.reason.servers) {
      console.error(`${host}: ${status.error?.message || status.type}`);
    }
  }
  process.exitCode = 1;
});
// Última red de seguridad: registrar el fallo y seguir sirviendo en lugar de terminar el proceso.
process.on('uncaughtException', error => console.error('Excepción no controlada:', error));
process.on('unhandledRejection', reason => console.error('Rechazo no controlado:', reason));
async function shutdown() { server.close(); if (client) await client.close(); }
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

module.exports = {
  server, start, body, securityHeaders, createAdminToken, adminSession,
  legacyReaderPasswordHash, readerPasswordHash, readerPasswordMatches,
  publicDoc, publicAssignment, assignmentQuery, previousMonth, costaRicaDateTime, validateNews
};
