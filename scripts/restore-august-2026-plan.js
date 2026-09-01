require('dotenv').config({ quiet: true });
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { MongoClient } = require('mongodb');

// Restaura la planificacion de agosto de 2026 desde el rol original en Excel.
// Agosto ya paso: esto solo repone el historico, que el algoritmo usa para rotar
// a la gente en los meses siguientes.
//   --check    muestra el plan y los cambios sin escribir nada (por defecto)
//   --apply    reemplaza agosto dentro de una transaccion, con respaldo previo
//   --verify   vuelve a leer la base y comprueba el resultado
const APPLY = process.argv.includes('--apply');
const VERIFY = process.argv.includes('--verify');
const MONTH = '2026-08';
const PRIVATE_DIR = path.resolve(__dirname, '..', 'data', 'private');
const XLSX_PATH =
  (process.argv.find(a => a.startsWith('--xlsx=')) || '').slice(7) ||
  path.join(PRIVATE_DIR, 'rol-lectores-agosto-2026.xlsx');

// El Excel abrevia las funciones; las misas las guardan con su nombre completo.
const ROLES = {
  primera: 'Primera lectura',
  segunda: 'Segunda lectura',
  salmo: 'Salmo',
  monitor: 'Moniciones',
  moniciones: 'Moniciones',
};

// Titulos del Excel y la misa que les corresponde, por dia y hora.
const MASS_BY_TITLE = {
  'sabado 4:00 pm': { weekday: 6, time: '16:00' },
  'sabado 6:00 pm': { weekday: 6, time: '18:00' },
  'domingo 7:00 am': { weekday: 0, time: '07:00' },
  'domingo 11:00 am': { weekday: 0, time: '11:00' },
  'domingo 4:00 pm': { weekday: 0, time: '16:00' },
  'domingo 6:00 pm': { weekday: 0, time: '18:00' },
};

// Nombres cortos del Excel confirmados por el usuario que el emparejamiento por
// palabras no puede resolver solo.
const KNOWN_READERS = {
  'vicky murillo': 'María Victoria Murillo Guzmán',
  'anna bolanos': 'Ana Bolaños Murillo',
  'mary alvarez': 'María Álvarez Villalobos',
};

if (!process.env.MONGODB_URI) throw new Error('Falta MONGODB_URI en .env');

const stripAccents = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const norm = s =>
  stripAccents(String(s || ''))
    .toLowerCase()
    .replace(/[.,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
const unescapeXml = s =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

// ---------- lectura del .xlsx ----------
// Un .xlsx es un zip con XML dentro. Se lee sin dependencias nuevas.
function readWorkbook(file) {
  const out = fs.mkdtempSync(path.join(require('os').tmpdir(), 'rol-'));
  try {
    execFileSync('unzip', ['-q', '-o', file, '-d', out], { stdio: 'pipe' });
  } catch {
    throw new Error(`No se pudo descomprimir ${file}. Hace falta la utilidad unzip.`);
  }
  const shared = [];
  for (const si of fs
    .readFileSync(path.join(out, 'xl/sharedStrings.xml'), 'utf8')
    .matchAll(/<si>([\s\S]*?)<\/si>/g))
    shared.push(unescapeXml([...si[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(m => m[1]).join('')));

  const sheet = fs.readFileSync(path.join(out, 'xl/worksheets/sheet1.xml'), 'utf8');
  const rows = new Map();
  for (const row of sheet.matchAll(/<row[^>]*\sr="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells = new Map();
    // Una celda vacia es autocerrada; solo las que llevan contenido tienen </c>.
    for (const cell of row[2].matchAll(/<c\s([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      if (!cell[2]) continue;
      const column = (cell[1].match(/r="([A-Z]+)\d+"/) || [])[1];
      const raw = (cell[2].match(/<v>([\s\S]*?)<\/v>/) || [])[1];
      if (!column || raw === undefined) continue;
      const value = /t="s"/.test(cell[1]) ? shared[Number(raw)] : unescapeXml(raw);
      if (value && String(value).trim()) cells.set(column, String(value).trim());
    }
    if (cells.size) rows.set(Number(row[1]), cells);
  }
  fs.rmSync(out, { recursive: true, force: true });
  return rows;
}

// Cada bloque son cuatro columnas: nombre arriba y, debajo, fecha y funcion.
const COLUMN_PAIRS = [
  ['B', 'C'],
  ['E', 'F'],
  ['H', 'I'],
  ['K', 'L'],
];

function readPlan(rows) {
  const blocks = [];
  for (const [number, cells] of [...rows].sort((a, b) => a[0] - b[0])) {
    const title = (cells.get('B') || '').replace(/\s+/g, ' ').trim();
    if (!/AGOSTO 2026/i.test(title)) continue;
    const names = rows.get(number + 1);
    const readers = COLUMN_PAIRS.map(([nameColumn]) => (names && names.get(nameColumn)) || null);
    const dates = [];
    for (let i = number + 2; i < number + 8; i++) {
      const line = rows.get(i);
      if (!line || !line.get('B')) break;
      dates.push({
        label: line.get('B'),
        roles: COLUMN_PAIRS.map(([, roleColumn]) => line.get(roleColumn) || null),
      });
    }
    blocks.push({ title, readers, dates });
  }
  return blocks;
}

// "15 agosto" -> "2026-08-15"
function isoDate(label) {
  const day = Number((label.match(/^(\d{1,2})/) || [])[1]);
  if (!day || day < 1 || day > 31) throw new Error(`Fecha del Excel no reconocida: "${label}"`);
  return `${MONTH}-${String(day).padStart(2, '0')}`;
}

function findMass(title, masses) {
  const key = norm(title).replace(/\s*-\s*agosto 2026$/, '');
  const wanted = MASS_BY_TITLE[key];
  if (!wanted) throw new Error(`Titulo del Excel sin misa equivalente: "${title}"`);
  const mass = masses.find(m => m.type !== 'once' && m.weekday === wanted.weekday && m.time === wanted.time);
  if (!mass) throw new Error(`No existe en la base la misa de "${title}"`);
  return mass;
}

function findReader(name, readers) {
  const known = KNOWN_READERS[norm(name)];
  if (known) {
    const target = readers.find(r => norm(r.name) === norm(known));
    if (!target) throw new Error(`La equivalencia confirmada "${name}" -> "${known}" ya no existe`);
    return target;
  }
  const words = norm(name).split(' ').filter(Boolean);
  const matches = readers.filter(r => {
    const other = norm(r.name).split(' ').filter(Boolean);
    return words.filter(w => other.includes(w)).length >= 2;
  });
  if (matches.length === 1) return matches[0];
  if (matches.length > 1)
    throw new Error(`"${name}" coincide con varios lectores: ${matches.map(r => r.name).join(', ')}`);
  throw new Error(`"${name}" no coincide con ningun lector de la base`);
}

function findRole(label, mass) {
  const role = ROLES[norm(label)];
  if (!role) throw new Error(`Funcion del Excel no reconocida: "${label}"`);
  if (!mass.roles.includes(role)) throw new Error(`La misa ${mass.name} no tiene la funcion "${role}"`);
  return role;
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

function buildAssignments(blocks, masses, readers) {
  const documents = [];
  const summary = [];
  for (const block of blocks) {
    const mass = findMass(block.title, masses);
    const people = block.readers.map(name => (name ? findReader(name, readers) : null));
    summary.push({ block, mass, people });
    for (const line of block.dates) {
      const date = isoDate(line.label);
      const seen = new Set();
      line.roles.forEach((label, index) => {
        const reader = people[index];
        if (!label || !reader) return;
        const role = findRole(label, mass);
        if (seen.has(role))
          throw new Error(`${block.title} ${line.label}: la funcion "${role}" aparece dos veces`);
        seen.add(role);
        documents.push({
          id: crypto.randomUUID(),
          massId: mass.id,
          readerId: reader.id,
          role,
          month: MONTH,
          date,
          // Agosto se repone sin banca, por decision del usuario.
          substituteIds: [],
          confirmationStatus: 'pending',
          createdAt: new Date(),
        });
      });
    }
  }
  return { documents, summary };
}

// Reproduce la regla del ministerio sobre el plan que se va a escribir.
function assertOneMassPerReader(documents, readers) {
  const massByReader = new Map();
  const seats = new Set();
  for (const doc of documents) {
    const seat = `${doc.massId}|${doc.date}|${doc.readerId}`;
    if (seats.has(seat)) throw new Error('Alguien tiene dos funciones en la misma celebracion');
    seats.add(seat);
    const previous = massByReader.get(doc.readerId);
    if (previous && previous !== doc.massId) {
      const name = (readers.find(r => r.id === doc.readerId) || {}).name || doc.readerId;
      throw new Error(`${name} aparece en dos misas distintas`);
    }
    massByReader.set(doc.readerId, doc.massId);
  }
}

async function main() {
  const client = await connect();
  const db = client.db(process.env.MONGODB_DB || 'lectores_parroquia');
  const assignments = db.collection('assignments');
  const [masses, readers] = await Promise.all([
    db.collection('masses').find({}).toArray(),
    db.collection('readers').find({}).toArray(),
  ]);
  const name = id => (readers.find(r => r.id === id) || {}).name || '(desconocido)';

  if (VERIFY) {
    const current = await assignments.find({ month: MONTH }).toArray();
    const weekly = masses.filter(m => m.type !== 'once');
    console.log(`Agosto tiene ${current.length} asignaciones`);
    for (const mass of weekly) {
      const own = current.filter(a => a.massId === mass.id);
      const dates = [...new Set(own.map(a => a.date))].sort();
      const people = [...new Set(own.map(a => a.readerId))];
      console.log(
        `  ${mass.name.padEnd(26)} ${own.length} puestos, ${dates.length} fechas, ${people.length} lectores`,
      );
      console.log(`      ${people.map(name).join(', ')}`);
    }
    const fuera = current.filter(a => !weekly.some(m => m.id === a.massId));
    if (fuera.length) console.log(`  AVISO: ${fuera.length} asignaciones de misas que no estan en el Excel`);
    await client.close();
    return;
  }

  const blocks = readPlan(readWorkbook(XLSX_PATH));
  if (!blocks.length) throw new Error('El Excel no contiene ningun bloque de agosto de 2026');
  const { documents, summary } = buildAssignments(blocks, masses, readers);
  assertOneMassPerReader(documents, readers);

  const weeklyIds = masses.filter(m => m.type !== 'once').map(m => m.id);
  const current = await assignments.find({ month: MONTH }).toArray();
  // Agosto queda exactamente como el Excel: se reemplaza el mes completo, incluida
  // la misa especial del 30 de agosto, que ya no continua.
  const fueraDelExcel = current.filter(a => !weeklyIds.includes(a.massId));

  const line = '-'.repeat(74);
  console.log(`\n${line}\nPLAN DE AGOSTO SEGUN EL EXCEL\n${line}`);
  for (const { block, mass, people } of summary) {
    console.log(`\n${mass.name}   (${block.title})`);
    people.forEach((reader, index) => {
      const original = block.readers[index];
      const marca = reader && reader.active === false ? '   [hoy inactivo]' : '';
      const cambio = reader && norm(reader.name) !== norm(original) ? `   <- "${original}" en el Excel` : '';
      console.log(`   ${index + 1}. ${reader ? reader.name : '(vacio)'}${cambio}${marca}`);
    });
    for (const dateLine of block.dates) {
      console.log(
        `      ${isoDate(dateLine.label)}  ${dateLine.roles.map(r => String(r || '-').padEnd(9)).join(' ')}`,
      );
    }
  }

  console.log(`\n${line}\nEFECTO SOBRE LA BASE\n${line}`);
  console.log(`  documentos que se escribiran   : ${documents.length}`);
  console.log(`  documentos de agosto que se van: ${current.length}  (el mes completo)`);
  if (fueraDelExcel.length)
    console.log(
      `    de ellos ${fueraDelExcel.length} son de misas que no estan en el Excel y no se repondran`,
    );
  console.log(`  lectores distintos en el plan  : ${new Set(documents.map(d => d.readerId)).size}`);
  console.log(`  suplentes                      : ninguno, en blanco por decision del usuario`);
  const inactivos = [...new Set(documents.map(d => d.readerId))].filter(
    id => (readers.find(r => r.id === id) || {}).active === false,
  );
  if (inactivos.length)
    console.log(`  incluye a ${inactivos.length} lectores hoy inactivos: ${inactivos.map(name).join(', ')}`);

  if (!APPLY) {
    console.log('\nModo de revision: no se escribio nada. Ejecuta con --apply para aplicarlo.');
    await client.close();
    return;
  }

  fs.mkdirSync(PRIVATE_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backup = path.join(PRIVATE_DIR, `respaldo-agosto-antes-restaurar-${stamp}.json`);
  fs.writeFileSync(backup, JSON.stringify(current, null, 2));
  console.log(`\nRespaldo de agosto escrito en ${backup}`);

  const session = client.startSession();
  try {
    await session.withTransaction(async () => {
      await assignments.deleteMany({ month: MONTH }, { session });
      await assignments.insertMany(documents, { session });
    });
  } finally {
    await session.endSession();
  }
  console.log(`Aplicado: ${documents.length} asignaciones de agosto restauradas.`);
  await client.close();
}

main().catch(error => {
  console.error('Error:', error.message);
  process.exitCode = 1;
});
