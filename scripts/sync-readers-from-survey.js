require('dotenv').config({ quiet: true });
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const { MongoClient } = require('mongodb');

// Sincroniza los lectores con las respuestas de la encuesta de agosto de 2026.
//   --check    muestra todos los cambios sin escribir nada (modo por defecto)
//   --apply    aplica los cambios dentro de una transaccion, con respaldo previo
//   --verify   vuelve a leer la base y comprueba el resultado
const APPLY = process.argv.includes('--apply');
const VERIFY = process.argv.includes('--verify');
const CSV_PATH =
  (process.argv.find(a => a.startsWith('--csv=')) || '').slice(6) ||
  path.resolve(__dirname, '..', 'data', 'private', 'encuesta-lectores-2026-08.csv');
const PRIVATE_DIR = path.resolve(__dirname, '..', 'data', 'private');
const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

// Correccion de nombre acordada con el usuario que el CSV no refleja.
const NAME_OVERRIDES = {
  'auxiliadora rodriguez venegas': 'María Auxiliadora Rodríguez Venegas',
};

// Personas que no respondieron la encuesta pero que el usuario quiere mantener
// activas. Conservan las preferencias que ya tienen en la base, porque el
// formulario no aporta datos nuevos sobre ellas.
const KEEP_ACTIVE = ['ligia zumbado', 'ana', 'elvira ortiz'];

// Equivalencias confirmadas por el usuario que el emparejamiento automatico no
// puede deducir, porque el nombre del formulario y el de la base solo comparten
// un apellido. La clave es el nombre del CSV normalizado; el valor, el nombre
// exacto que tiene hoy la base.
const KNOWN_MATCHES = {
  'maria victoria murillo guzman': 'Vicky Murillo',
};

if (!process.env.MONGODB_URI) throw new Error('Falta MONGODB_URI en .env');

// ---------- utilidades de texto ----------
const stripAccents = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const norm = s =>
  stripAccents(String(s || ''))
    .toLowerCase()
    .replace(/[.,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
const PARTICLES = new Set(['de', 'del', 'la', 'las', 'los', 'y']);

// Limpia el nombre como se acordo: sin espacios sobrantes ni punto final, y con
// las palabras capitalizadas salvo las particulas.
function cleanName(raw) {
  return raw
    .trim()
    .replace(/\.+$/, '')
    .replace(/\s+/g, ' ')
    .split(' ')
    .map(word =>
      /^[a-záéíóúüñ]/.test(word) && !PARTICLES.has(word) ? word[0].toUpperCase() + word.slice(1) : word,
    )
    .join(' ');
}

// El formulario se llena en el telefono y suele perder tildes: si la base ya
// tenia esa misma palabra acentuada, se conserva la version de la base.
function keepKnownAccents(csvName, dbName) {
  if (!dbName) return csvName;
  const dbWords = dbName.split(/\s+/);
  return csvName
    .split(' ')
    .map(word => {
      if (word !== stripAccents(word)) return word;
      const match = dbWords.find(
        w => stripAccents(w).toLowerCase() === word.toLowerCase() && w !== stripAccents(w),
      );
      return match || word;
    })
    .join(' ');
}

function finalName(csvRaw, dbName) {
  const cleaned = cleanName(csvRaw);
  return NAME_OVERRIDES[norm(cleaned)] || keepKnownAccents(cleaned, dbName);
}

// ---------- CSV ----------
function parseCsvLine(line) {
  const values = [];
  for (const match of line.matchAll(/"((?:[^"]|"")*)"(?:,|$)/g)) values.push(match[1].replace(/""/g, '"'));
  return values;
}

function readSurvey() {
  const lines = fs
    .readFileSync(CSV_PATH, 'utf8')
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter(Boolean);
  const headers = parseCsvLine(lines.shift());
  const at = re => headers.findIndex(h => re.test(h));
  const iName = at(/nombre/i);
  const iYes = at(/SI le funcionan/i);
  const iNo = at(/NO le funcionan/i);
  if (iName < 0 || iYes < 0 || iNo < 0) throw new Error('El CSV no tiene las columnas esperadas');

  const seen = new Set();
  const people = [];
  const duplicates = [];
  for (const line of lines) {
    const cells = parseCsvLine(line);
    const raw = (cells[iName] || '').trim();
    if (!raw) continue;
    if (seen.has(norm(raw))) {
      duplicates.push(raw);
      continue;
    }
    seen.add(norm(raw));
    const split = value =>
      (value || '')
        .split(';')
        .map(v => v.trim())
        .filter(Boolean);
    const yes = split(cells[iYes]);
    const no = split(cells[iNo]);
    // Si un horario aparece en ambas columnas gana el NO, como se resolvio el
    // caso de Jose Francisco Zumbado el 2 de agosto de 2026.
    people.push({ raw, yes: yes.filter(m => !no.includes(m)), no });
  }
  return { people, duplicates };
}

// ---------- coincidencia de nombres ----------
function editDistance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
const sameWord = (a, b) => a === b || (Math.min(a.length, b.length) >= 4 && editDistance(a, b) <= 1);
const words = s => norm(s).split(' ').filter(Boolean);

function matchReader(csvName, readers, used) {
  const free = r => !used.has(r.id);
  const known = KNOWN_MATCHES[norm(csvName)];
  if (known) {
    const target = readers.find(r => free(r) && norm(r.name) === norm(known));
    if (!target)
      throw new Error(`La equivalencia confirmada "${csvName}" -> "${known}" ya no existe en la base`);
    return target;
  }
  const exact = readers.find(r => free(r) && norm(r.name) === norm(csvName));
  if (exact) return exact;
  const collapsed = readers.find(
    r => free(r) && norm(r.name).replace(/ /g, '') === norm(csvName).replace(/ /g, ''),
  );
  if (collapsed) return collapsed;
  const t = words(csvName);
  const candidates = readers.filter(r => {
    if (!free(r)) return false;
    const u = words(r.name);
    const shared = t.filter(x => u.some(y => sameWord(x, y))).length;
    return shared >= 2 || (shared >= 1 && Math.min(t.length, u.length) === 1);
  });
  return candidates.length === 1 ? candidates[0] : null;
}

// ---------- conexion ----------
function seedUri() {
  const source = new URL(process.env.MONGODB_URI);
  const hosts = [
    'ac-1ucorrm-shard-00-00.5uov4sm.mongodb.net:27017',
    'ac-1ucorrm-shard-00-01.5uov4sm.mongodb.net:27017',
    'ac-1ucorrm-shard-00-02.5uov4sm.mongodb.net:27017',
  ];
  return `mongodb://${source.username}:${source.password}@${hosts.join(',')}${source.pathname}?tls=true&authSource=admin&retryWrites=true&w=majority`;
}
async function connect() {
  let lastError;
  for (const uri of [process.env.MONGODB_URI, seedUri()]) {
    const client = new MongoClient(uri, { serverSelectionTimeoutMS: 15000 });
    try {
      await client.connect();
      return client;
    } catch (error) {
      lastError = error;
      await client.close();
    }
  }
  throw lastError;
}

function massLabel(mass) {
  if (!mass) return '(desconocida)';
  const day = mass.weekday === 6 ? 'Sábado' : mass.weekday === 0 ? 'Domingo' : '';
  const [hour, minute] = mass.time.split(':').map(Number);
  return `${day} ${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${hour >= 12 ? 'pm' : 'am'}`;
}
const temporaryPassword = () =>
  Array.from({ length: 12 }, () => PASSWORD_ALPHABET[crypto.randomInt(PASSWORD_ALPHABET.length)]).join('');

// ---------- plan ----------
function buildPlan(survey, readers, masses) {
  const weekly = masses.filter(m => m.type !== 'once');
  const byLabel = new Map(weekly.map(m => [massLabel(m), m]));
  const specials = masses.filter(m => m.type === 'once' && m.active);

  const used = new Set();
  const updates = [];
  const creations = [];
  const unknownLabels = new Set();

  for (const person of survey.people) {
    const existing = matchReader(person.raw, readers, used);
    if (existing) used.add(existing.id);
    const name = finalName(person.raw, existing && existing.name);

    const preferred = [];
    for (const label of person.yes) {
      const mass = byLabel.get(label);
      if (mass) preferred.push(mass.id);
      else unknownLabels.add(label);
    }
    for (const label of person.no) if (!byLabel.has(label)) unknownLabels.add(label);

    // Lo que no marco como SI queda como "no puede asistir", pero solo entre las
    // misas semanales del formulario: una misa futura no debe nacer bloqueada.
    const unavailable = weekly.map(m => m.id).filter(id => !preferred.includes(id));

    const value = {
      name,
      preferredMassIds: preferred,
      unavailableMassIds: unavailable,
      availability: preferred,
      preferenceModel: 1,
      active: true,
    };
    if (existing) updates.push({ reader: existing, value, renamed: existing.name !== name });
    else creations.push({ value, csvName: person.raw });
  }

  const faltantes = KEEP_ACTIVE.filter(n => !readers.some(r => norm(r.name) === n));
  if (faltantes.length)
    throw new Error(`No existen en la base estos lectores que deben seguir activos: ${faltantes.join(', ')}`);

  const ausentes = readers.filter(r => !used.has(r.id));
  const protegido = r => KEEP_ACTIVE.includes(norm(r.name));
  const kept = ausentes.filter(r => protegido(r) && r.active !== false);
  const deactivations = ausentes.filter(r => r.active !== false && !protegido(r));
  const alreadyInactive = ausentes.filter(r => r.active === false);
  return {
    updates,
    creations,
    deactivations,
    alreadyInactive,
    kept,
    weekly,
    specials,
    unknownLabels: [...unknownLabels],
  };
}

function report(plan, survey) {
  const line = '-'.repeat(74);
  const labels = ids =>
    ids.map(id => massLabel(plan.weekly.find(m => m.id === id))).join(', ') || '(ninguna)';

  console.log(`\n${line}\nRESPUESTAS DE LA ENCUESTA\n${line}`);
  console.log(
    `  ${survey.people.length} personas unicas` +
      (survey.duplicates.length
        ? `, ${survey.duplicates.length} duplicada(s) descartada(s): ${survey.duplicates.join(', ')}`
        : ''),
  );
  if (plan.unknownLabels.length)
    console.log(`  AVISO: horarios del CSV sin misa equivalente: ${plan.unknownLabels.join(' | ')}`);

  console.log(`\n${line}\nACTUALIZAR (${plan.updates.length})\n${line}`);
  for (const u of plan.updates) {
    const marca =
      (u.renamed ? `   [antes: "${u.reader.name}"]` : '') +
      (u.reader.active === false ? '   [se reactiva]' : '');
    console.log(`  ${u.value.name}${marca}`);
    console.log(`      prefiere: ${labels(u.value.preferredMassIds)}`);
  }

  console.log(`\n${line}\nCREAR (${plan.creations.length})\n${line}`);
  for (const c of plan.creations)
    console.log(`  ${c.value.name}\n      prefiere: ${labels(c.value.preferredMassIds)}`);

  console.log(`\n${line}\nDESACTIVAR, no respondieron (${plan.deactivations.length})\n${line}`);
  for (const r of plan.deactivations) console.log(`  ${r.name}`);
  if (plan.alreadyInactive.length)
    console.log(`  (ya estaban inactivos: ${plan.alreadyInactive.map(r => r.name).join(', ')})`);

  console.log(`\n${line}\nSE MANTIENEN ACTIVOS AUNQUE NO RESPONDIERON (${plan.kept.length})\n${line}`);
  for (const r of plan.kept) console.log(`  ${r.name}   [conserva sus preferencias actuales]`);
  if (!plan.kept.length) console.log('  (ninguno)');

  console.log(`\n${line}\nMISAS ESPECIALES A DESACTIVAR (${plan.specials.length})\n${line}`);
  for (const m of plan.specials) console.log(`  ${m.name} (${m.date})`);

  // Un mes completo necesita 4 funciones mas 1 suplente por cada misa semanal.
  const activos = plan.updates.length + plan.creations.length + plan.kept.length;
  const puestos = plan.weekly.length * 5;
  console.log(`\n${line}\nCAPACIDAD DEL PROXIMO MES\n${line}`);
  console.log(`  lectores activos tras aplicar : ${activos}`);
  console.log(
    `  puestos minimos de un mes     : ${puestos}  (${plan.weekly.length} misas x 4 funciones + 1 suplente)`,
  );
  const aviso =
    activos < puestos
      ? '   <-- NO se podra generar el mes'
      : activos === puestos
        ? '   <-- justo, sin suplentes extra'
        : '';
  console.log(`  margen                        : ${activos - puestos}${aviso}`);
  // Quien puede servir en una misa es quien no la marco como imposible, igual
  // que hace readerCanServeMass en el servidor.
  const perfiles = [...plan.updates.map(u => u.value), ...plan.creations.map(c => c.value), ...plan.kept];
  for (const m of plan.weekly) {
    const posibles = perfiles.filter(p => !(p.unavailableMassIds || []).includes(m.id)).length;
    console.log(
      `    ${massLabel(m).padEnd(18)} ${posibles} personas disponibles (minimo 5)${posibles < 5 ? '   <-- INSUFICIENTE' : ''}`,
    );
  }
}

async function main() {
  const survey = readSurvey();
  const client = await connect();
  const db = client.db(process.env.MONGODB_DB || 'lectores_parroquia');
  const readersCol = db.collection('readers');
  const massesCol = db.collection('masses');
  const [readers, masses] = await Promise.all([readersCol.find({}).toArray(), massesCol.find({}).toArray()]);

  if (VERIFY) {
    const activos = readers.filter(r => r.active !== false);
    const especiales = masses.filter(m => m.active && m.type === 'once');
    console.log(
      `Lectores: ${readers.length} en total, ${activos.length} activos, ${readers.length - activos.length} inactivos`,
    );
    console.log(`Con modelo de preferencias: ${readers.filter(r => r.preferenceModel === 1).length}`);
    console.log(`Misas semanales activas: ${masses.filter(m => m.active && m.type !== 'once').length}`);
    console.log(
      `Misas especiales todavia activas: ${especiales.length ? especiales.map(m => m.name).join(', ') : 'ninguna'}`,
    );
    console.log('\nLectores activos:');
    activos.sort((a, b) => a.name.localeCompare(b.name, 'es')).forEach(r => console.log(`  ${r.name}`));
    await client.close();
    return;
  }

  const plan = buildPlan(survey, readers, masses);
  report(plan, survey);

  if (!APPLY) {
    console.log('\nModo de revision: no se escribio nada. Ejecuta con --apply para aplicarlo.');
    await client.close();
    return;
  }

  fs.mkdirSync(PRIVATE_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backup = path.join(PRIVATE_DIR, `respaldo-antes-encuesta-${stamp}.json`);
  fs.writeFileSync(backup, JSON.stringify({ readers, masses }, null, 2));
  console.log(`\nRespaldo escrito en ${backup}`);

  const credentials = [];
  const session = client.startSession();
  try {
    await session.withTransaction(async () => {
      for (const u of plan.updates)
        await readersCol.updateOne({ id: u.reader.id }, { $set: u.value }, { session });
      for (const c of plan.creations) {
        const password = temporaryPassword();
        credentials.push({ name: c.value.name, password });
        await readersCol.insertOne(
          {
            id: crypto.randomUUID(),
            ...c.value,
            phone: '',
            notes: '',
            substituteOnly: false,
            passwordHash: await bcrypt.hash(password, 12),
            mustChangePassword: true,
            passwordResetAt: new Date(),
            createdAt: new Date(),
          },
          { session },
        );
      }
      for (const r of plan.deactivations)
        await readersCol.updateOne({ id: r.id }, { $set: { active: false } }, { session });
      for (const m of plan.specials)
        await massesCol.updateOne({ id: m.id }, { $set: { active: false } }, { session });
    });
  } finally {
    await session.endSession();
  }

  if (credentials.length) {
    const file = path.join(PRIVATE_DIR, `credenciales-nuevos-lectores-${stamp}.csv`);
    fs.writeFileSync(
      file,
      '"nombre","contrasena_temporal"\n' +
        credentials.map(c => `"${c.name}","${c.password}"`).join('\n') +
        '\n',
    );
    console.log(`Credenciales temporales en ${file}`);
    console.log('Entregalas en privado: no vuelven a poder consultarse.');
  }

  // Ningun mes futuro deberia conservar puestos de alguien que ya no puede servir.
  const today = new Date().toISOString().slice(0, 10);
  const futuras = await db.collection('assignments').countDocuments({ date: { $gte: today } });
  console.log(`\nAplicado. Asignaciones con fecha de hoy en adelante: ${futuras}`);
  await client.close();
}

main().catch(error => {
  console.error('Error:', error.message);
  process.exitCode = 1;
});
