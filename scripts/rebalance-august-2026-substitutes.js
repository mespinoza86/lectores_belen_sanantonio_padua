require('dotenv').config({ quiet: true });
const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');

const MONTH = '2026-08',
  TARGET = 4,
  APPLY = process.argv.includes('--apply');
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
const prefers = (reader, massId) => (reader.preferredMassIds || reader.availability || []).includes(massId);
const canServe = (reader, massId) =>
  Array.isArray(reader.unavailableMassIds) || reader.preferenceModel === 1
    ? !(reader.unavailableMassIds || []).includes(massId)
    : (reader.availability || []).includes(massId);

function allocate(readers, masses) {
  const result = new Map(masses.map(mass => [mass.id, []]));
  const candidates = readers
    .map(reader => ({
      reader,
      preferred: masses.filter(mass => prefers(reader, mass.id)),
      possible: masses.filter(mass => canServe(reader, mass.id)),
    }))
    .filter(item => item.possible.length)
    .sort(
      (a, b) =>
        a.preferred.length - b.preferred.length ||
        a.possible.length - b.possible.length ||
        a.reader.name.localeCompare(b.reader.name, 'es'),
    );
  for (const item of candidates) {
    const preferred = item.preferred.filter(mass => result.get(mass.id).length < TARGET);
    const alternatives = item.possible.filter(mass => result.get(mass.id).length < TARGET);
    const pool = preferred.length ? preferred : alternatives;
    if (!pool.length) continue;
    pool.sort((a, b) => result.get(a.id).length - result.get(b.id).length || a.time.localeCompare(b.time));
    result.get(pool[0].id).push(item.reader);
  }
  return result;
}

async function run() {
  const client = await connect(),
    db = client.db('lectores_parroquia');
  try {
    const [assignments, readers, masses] = await Promise.all([
      db.collection('assignments').find({ month: MONTH }).toArray(),
      db.collection('readers').find({ active: true }).toArray(),
      db.collection('masses').find({ active: true }).sort({ weekday: 1, time: 1 }).toArray(),
    ]);
    if (!assignments.length) throw new Error('No hay asignaciones de agosto para conservar');
    const assignedMassIds = new Set(assignments.map(item => item.massId));
    const monthMasses = masses.filter(mass => assignedMassIds.has(mass.id));
    const titularIds = new Set(assignments.map(item => item.readerId).filter(Boolean));
    const freeReaders = readers.filter(reader => !titularIds.has(reader.id));
    const plan = allocate(freeReaders, monthMasses);
    const summary = monthMasses.map(mass => ({
      mass: mass.name,
      time: mass.time,
      substitutes: (plan.get(mass.id) || []).map(reader => ({
        name: reader.name,
        preference: prefers(reader, mass.id) ? 'preferida' : 'alternativa',
      })),
    }));
    const total = summary.reduce((sum, item) => sum + item.substitutes.length, 0);
    if (!APPLY) {
      console.log(
        JSON.stringify(
          {
            mode: 'check',
            activeReaders: readers.length,
            uniqueTitulars: titularIds.size,
            freeReaders: freeReaders.length,
            target: TARGET,
            total,
            summary,
          },
          null,
          2,
        ),
      );
      return;
    }
    const privateDir = path.resolve(__dirname, '..', 'data', 'private');
    fs.mkdirSync(privateDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backup = path.join(privateDir, `respaldo-suplentes-agosto-${stamp}.json`);
    fs.writeFileSync(
      backup,
      JSON.stringify(
        {
          createdAt: new Date(),
          month: MONTH,
          substitutes: assignments.map(item => ({ id: item.id, substituteIds: item.substituteIds || [] })),
        },
        null,
        2,
      ),
      'utf8',
    );
    const session = client.startSession();
    try {
      await session.withTransaction(async () => {
        for (const mass of monthMasses) {
          const ids = (plan.get(mass.id) || []).map(reader => reader.id);
          await db
            .collection('assignments')
            .updateMany({ month: MONTH, massId: mass.id }, { $set: { substituteIds: ids } }, { session });
        }
      });
    } finally {
      await session.endSession();
    }
    const stored = await db.collection('assignments').find({ month: MONTH }).toArray();
    for (const mass of monthMasses) {
      const expected = (plan.get(mass.id) || []).map(reader => reader.id).join('|');
      const rows = stored.filter(item => item.massId === mass.id);
      if (rows.some(item => (item.substituteIds || []).join('|') !== expected))
        throw new Error(`Falló la verificación de ${mass.name}`);
    }
    console.log(JSON.stringify({ mode: 'apply', target: TARGET, total, backup, summary }, null, 2));
  } finally {
    await client.close();
  }
}
run().catch(error => {
  console.error(`REASIGNACIÓN CANCELADA: ${error.message}`);
  process.exitCode = 1;
});
