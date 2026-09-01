require('dotenv').config({ quiet: true });
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { MongoClient } = require('mongodb');

const MODE = process.argv.includes('--apply')
  ? 'apply'
  : process.argv.includes('--verify')
    ? 'verify'
    : process.argv.includes('--check')
      ? 'check'
      : '';
if (!MODE) throw new Error('Usa --check, --apply o --verify');
const MONTH = '2026-08';
const PRIVATE_DIR = path.resolve(__dirname, '..', 'data', 'private');
const massPlans = {
  sat4: {
    weekday: 6,
    time: '16:00',
    dates: ['2026-08-01', '2026-08-08', '2026-08-15', '2026-08-22', '2026-08-29'],
    columns: [
      ['Rosario Castillo Vásquez', ['Primera', 'Segunda', 'Monitor', 'Primera', 'Salmo']],
      ['John Corredor', ['Salmo', 'Monitor', 'Primera', 'Salmo', 'Segunda']],
      ['Rita Mora Araya', ['Segunda', 'Primera', 'Salmo', 'Segunda', 'Monitor']],
      ['Flor Maria Rosales', ['Monitor', 'Salmo', 'Segunda', 'Monitor', 'Primera']],
    ],
    substitutes: ['Rudy Juan José Villaseca Figueroa', 'Marisol Solano Campos'],
  },
  sat6: {
    weekday: 6,
    time: '18:00',
    dates: ['2026-08-01', '2026-08-08', '2026-08-15', '2026-08-22', '2026-08-29'],
    columns: [
      ['Marco Espinoza', ['Primera', 'Segunda', 'Monitor', 'Primera', 'Salmo']],
      ['Maureen Delgado Castillo', ['Salmo', 'Monitor', 'Primera', 'Salmo', 'Segunda']],
      ['Yorleni Arrieta Solórzano', ['Segunda', 'Primera', 'Salmo', 'Segunda', 'Monitor']],
      ['Luis Alonso Marín Rodríguez', ['Monitor', 'Salmo', 'Segunda', 'Monitor', 'Primera']],
    ],
    substitutes: ['Lissete Salas', 'Juan Sebastián Quirós Murillo'],
  },
  sun7: {
    weekday: 0,
    time: '07:00',
    dates: ['2026-08-02', '2026-08-09', '2026-08-16', '2026-08-23', '2026-08-30'],
    columns: [
      ['Patricia', ['Primera', 'Salmo', 'Segunda', 'Monitor', 'Primera']],
      ['Kary Hernández Gonzalez', ['Salmo', 'Segunda', 'Monitor', 'Primera', 'Salmo']],
      ['Gelsy Yeny Rojas Storck', ['Segunda', 'Monitor', 'Primera', 'Salmo', 'Segunda']],
      ['Evelia Ramirez', ['Monitor', 'Primera', 'Salmo', 'Segunda', 'Monitor']],
    ],
    substitutes: ['Dominik Hodgson', 'Elvira Ortiz', 'María Chaves Casanova'],
  },
  sun11: {
    weekday: 0,
    time: '11:00',
    dates: ['2026-08-02', '2026-08-09', '2026-08-16', '2026-08-23', '2026-08-30'],
    columns: [
      ['Oscar Fdo. Arrieta Villalobos', ['Monitor', 'Salmo', 'Segunda', 'Monitor', 'Primera']],
      ['José Francisco Zumbado Arce', ['Salmo', 'Segunda', 'Salmo', 'Primera', 'Salmo']],
      ['Vicky Murillo', ['Segunda', 'Monitor', 'Primera', 'Salmo', 'Segunda']],
      ['Ana Bolaños Murillo', ['Primera', 'Primera', 'Monitor', 'Segunda', 'Monitor']],
    ],
    substitutes: ['José Antonio González Vega', 'Mauricio Cartín'],
  },
  sun4: {
    weekday: 0,
    time: '16:00',
    dates: ['2026-08-02', '2026-08-09', '2026-08-16', '2026-08-23', '2026-08-30'],
    columns: [
      ['María Álvarez Villalobos', ['Monitor', 'Salmo', 'Segunda', 'Monitor', 'Primera']],
      ['Andrea Sanabria', ['Salmo', 'Segunda', 'Monitor', 'Primera', 'Salmo']],
      ['Wendy Vargas', ['Segunda', 'Monitor', 'Primera', 'Salmo', 'Segunda']],
      ['Ligia Zumbado', ['Primera', 'Primera', 'Salmo', 'Segunda', 'Monitor']],
    ],
    substitutes: ['Mauren Aguilar Villanea', 'Juan Luis Mena Soto'],
  },
  sun6: {
    weekday: 0,
    time: '18:00',
    dates: ['2026-08-02', '2026-08-09', '2026-08-16', '2026-08-23', '2026-08-30'],
    columns: [
      ['Zeneida Chaves', ['Salmo', 'Segunda', 'Monitor', 'Primera', 'Salmo']],
      ['Marco Canales', ['Segunda', 'Monitor', 'Primera', 'Salmo', 'Segunda']],
      ['Laura Cascante', ['Monitor', 'Primera', 'Salmo', 'Segunda', 'Monitor']],
      ['María Auxiliadora Rodríguez', ['Primera', 'Salmo', 'Segunda', 'Monitor', 'Primera']],
    ],
    substitutes: ['Ana', 'Gloriela Mora'],
  },
};

function seedUri() {
  const source = new URL(process.env.MONGODB_URI),
    hosts = [
      'ac-1ucorrm-shard-00-00.5uov4sm.mongodb.net:27017',
      'ac-1ucorrm-shard-00-01.5uov4sm.mongodb.net:27017',
      'ac-1ucorrm-shard-00-02.5uov4sm.mongodb.net:27017',
    ];
  return `mongodb://${source.username}:${source.password}@${hosts.join(',')}${source.pathname}?tls=true&authSource=admin&retryWrites=true&w=majority`;
}
async function connect() {
  let last;
  for (const uri of [process.env.MONGODB_URI, seedUri()]) {
    const client = new MongoClient(uri, { serverSelectionTimeoutMS: 15000 });
    try {
      await client.connect();
      return client;
    } catch (error) {
      last = error;
      await client.close();
    }
  }
  throw last;
}
const normalize = value =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
function roleName(mass, label) {
  const target = normalize(label);
  const found = mass.roles.find(role => {
    const value = normalize(role);
    return target === 'monitor'
      ? value.includes('monici') || value.includes('monitor')
      : value.includes(target);
  });
  if (!found) throw new Error(`La misa ${mass.name} no tiene la función ${label}`);
  return found;
}
function canServe(reader, massId) {
  return !(reader.unavailableMassIds || []).includes(massId);
}
function prefers(reader, massId) {
  return (reader.preferredMassIds || reader.availability || []).includes(massId);
}

async function build(db) {
  const [masses, readers] = await Promise.all([
    db.collection('masses').find({ active: true }).toArray(),
    db.collection('readers').find({ active: true }).toArray(),
  ]);
  const readerByName = new Map(readers.map(reader => [reader.name, reader])),
    documents = [],
    titularMass = new Map(),
    substituteMass = new Map(),
    summary = [];
  for (const [key, plan] of Object.entries(massPlans)) {
    const matches = masses.filter(
      mass => mass.type === 'weekly' && mass.weekday === plan.weekday && mass.time === plan.time,
    );
    if (matches.length !== 1)
      throw new Error(`${key}: se esperaba una misa y se encontraron ${matches.length}`);
    const mass = matches[0],
      substitutes = plan.substitutes.map(name => {
        const reader = readerByName.get(name);
        if (!reader) throw new Error(`No existe el suplente ${name}`);
        if (!canServe(reader, mass.id)) throw new Error(`${name} no puede servir en ${mass.name}`);
        if (substituteMass.has(reader.id) || titularMass.has(reader.id))
          throw new Error(`${name} ya pertenece a otra misa`);
        substituteMass.set(reader.id, mass.id);
        return reader;
      });
    for (const [name, roles] of plan.columns) {
      const reader = readerByName.get(name);
      if (!reader) throw new Error(`No existe el titular ${name}`);
      if (reader.substituteOnly) throw new Error(`${name} está configurado solo como suplente`);
      if (!canServe(reader, mass.id)) throw new Error(`${name} no puede servir en ${mass.name}`);
      if (titularMass.has(reader.id) || substituteMass.has(reader.id))
        throw new Error(`${name} ya pertenece a otra misa`);
      titularMass.set(reader.id, mass.id);
      roles.forEach((label, index) =>
        documents.push({
          id: crypto.randomUUID(),
          massId: mass.id,
          readerId: reader.id,
          role: roleName(mass, label),
          month: MONTH,
          date: plan.dates[index],
          substituteIds: substitutes.map(item => item.id),
          confirmationStatus: 'pending',
          createdAt: new Date(),
        }),
      );
    }
    for (const date of plan.dates) {
      const items = documents.filter(item => item.massId === mass.id && item.date === date);
      if (items.length !== 4 || new Set(items.map(item => item.role)).size !== 4)
        throw new Error(`${mass.name} ${date} no contiene cuatro funciones únicas`);
    }
    summary.push({
      mass: mass.name,
      time: mass.time,
      titulars: plan.columns.map(item => item[0]),
      substitutes: substitutes.map(item => ({ name: item.name, preferred: prefers(item, mass.id) })),
    });
  }
  if (documents.length !== 120)
    throw new Error(`Se esperaban 120 asignaciones y se generaron ${documents.length}`);
  if (summary.flatMap(item => item.substitutes).some(item => !item.preferred))
    throw new Error('Se encontró un suplente en una misa no preferida');
  return { documents, summary };
}

async function run() {
  const client = await connect(),
    db = client.db('lectores_parroquia');
  try {
    const plan = await build(db);
    if (MODE === 'check') {
      console.log(
        JSON.stringify(
          { ok: true, mode: 'check', assignments: plan.documents.length, summary: plan.summary },
          null,
          2,
        ),
      );
      return;
    }
    if (MODE === 'apply') {
      fs.mkdirSync(PRIVATE_DIR, { recursive: true });
      const existing = await db.collection('assignments').find({ month: MONTH }).toArray(),
        stamp = new Date().toISOString().replace(/[:.]/g, '-'),
        backup = path.join(PRIVATE_DIR, `respaldo-asignaciones-agosto-antes-imagenes-${stamp}.json`);
      fs.writeFileSync(
        backup,
        JSON.stringify({ createdAt: new Date(), month: MONTH, assignments: existing }, null, 2),
        'utf8',
      );
      const session = client.startSession();
      try {
        await session.withTransaction(async () => {
          await db.collection('assignments').deleteMany({ month: MONTH }, { session });
          await db.collection('assignments').insertMany(plan.documents, { session });
        });
      } finally {
        await session.endSession();
      }
      console.log(
        JSON.stringify(
          { ok: true, mode: 'apply', assignments: plan.documents.length, backup, summary: plan.summary },
          null,
          2,
        ),
      );
      return;
    }
    const stored = await db.collection('assignments').find({ month: MONTH }).toArray();
    const expected = plan.documents
        .map(
          item => `${item.massId}|${item.date}|${item.role}|${item.readerId}|${item.substituteIds.join(',')}`,
        )
        .sort(),
      actual = stored
        .map(
          item =>
            `${item.massId}|${item.date}|${item.role}|${item.readerId}|${(item.substituteIds || []).join(',')}`,
        )
        .sort();
    if (JSON.stringify(expected) !== JSON.stringify(actual))
      throw new Error('Las asignaciones guardadas no coinciden con el plan validado');
    console.log(
      JSON.stringify(
        {
          ok: true,
          mode: 'verify',
          assignments: stored.length,
          celebrations: new Set(stored.map(item => `${item.massId}|${item.date}`)).size,
          summary: plan.summary,
        },
        null,
        2,
      ),
    );
  } finally {
    await client.close();
  }
}
run().catch(error => {
  console.error(`PLAN CANCELADO: ${error.message}`);
  process.exitCode = 1;
});
