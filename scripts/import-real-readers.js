require('dotenv').config({ quiet: true });
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const { MongoClient } = require('mongodb');

const APPLY = process.argv.includes('--apply');
const CHECK = process.argv.includes('--check');
const VERIFY = process.argv.includes('--verify');
const CSV_PATH = path.resolve(__dirname, '..', 'data', 'lectores_reales_revision.csv');
const PRIVATE_DIR = path.resolve(__dirname, '..', 'data', 'private');
const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

if (!process.env.MONGODB_URI) throw new Error('Falta MONGODB_URI en .env');

function parseCsvLine(line) {
  const values = [];
  for (const match of line.matchAll(/"((?:[^"]|"")*)"(?:,|$)/g)) values.push(match[1].replace(/""/g, '"'));
  return values;
}

function readCsv() {
  const lines = fs
    .readFileSync(CSV_PATH, 'utf8')
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter(Boolean);
  const headers = parseCsvLine(lines.shift());
  return lines.map(line =>
    Object.fromEntries(headers.map((header, index) => [header, parseCsvLine(line)[index] || ''])),
  );
}

function splitMasses(value) {
  return value
    ? value
        .split(' | ')
        .map(item => item.trim())
        .filter(Boolean)
    : [];
}

function temporaryPassword() {
  return Array.from({ length: 12 }, () => PASSWORD_ALPHABET[crypto.randomInt(PASSWORD_ALPHABET.length)]).join(
    '',
  );
}

function csvValue(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

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
  const attempts = [process.env.MONGODB_URI, seedUri()];
  let lastError;
  for (const uri of attempts) {
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
  const day = mass.weekday === 6 ? 'Sábado' : mass.weekday === 0 ? 'Domingo' : '';
  const [hour, minute] = mass.time.split(':').map(Number);
  const suffix = hour >= 12 ? 'pm' : 'am';
  const displayHour = hour % 12 || 12;
  return `${day} ${displayHour}:${String(minute).padStart(2, '0')} ${suffix}`;
}

async function run() {
  if (!APPLY && !CHECK && !VERIFY) throw new Error('Usa --check, --verify o --apply');
  const sourceRows = readCsv();
  if (sourceRows.length !== 30)
    throw new Error(`Se esperaban 30 lectores y se encontraron ${sourceRows.length}`);
  const duplicateNames = sourceRows
    .map(row => row.nombre)
    .filter((name, index, all) => all.indexOf(name) !== index);
  if (duplicateNames.length)
    throw new Error(`Hay nombres duplicados: ${[...new Set(duplicateNames)].join(', ')}`);

  const client = await connect();
  const database = client.db('lectores_parroquia');
  try {
    const masses = await database.collection('masses').find({ active: true }).toArray();
    const massByLabel = new Map(
      masses.filter(mass => mass.type === 'weekly').map(mass => [massLabel(mass), mass]),
    );
    const requestedLabels = [
      ...new Set(
        sourceRows.flatMap(row => [
          ...splitMasses(row.misas_preferidas),
          ...splitMasses(row.misas_alternativas),
          ...splitMasses(row.misas_no_disponibles),
        ]),
      ),
    ];
    const missing = requestedLabels.filter(label => !massByLabel.has(label));
    if (missing.length) throw new Error(`No existen en MongoDB estas misas del CSV: ${missing.join(', ')}`);
    if (requestedLabels.length !== 6)
      throw new Error(`Se esperaban 6 horarios únicos y se encontraron ${requestedLabels.length}`);
    if (CHECK && !APPLY) {
      console.log(
        JSON.stringify(
          { ok: true, mode: 'check', readers: sourceRows.length, masses: requestedLabels },
          null,
          2,
        ),
      );
      return;
    }
    if (VERIFY && !APPLY) {
      const [storedReaders, assignmentCount] = await Promise.all([
        database.collection('readers').find({}).toArray(),
        database.collection('assignments').countDocuments({}),
      ]);
      const expectedNames = [...sourceRows.map(row => row.nombre)].sort((a, b) => a.localeCompare(b, 'es'));
      const storedNames = [...storedReaders.map(reader => reader.name)].sort((a, b) =>
        a.localeCompare(b, 'es'),
      );
      const valid =
        storedReaders.length === 30 &&
        assignmentCount === 0 &&
        JSON.stringify(expectedNames) === JSON.stringify(storedNames) &&
        storedReaders.every(
          reader =>
            reader.active &&
            reader.phone === '' &&
            !reader.substituteOnly &&
            reader.preferenceModel === 1 &&
            Array.isArray(reader.preferredMassIds) &&
            Array.isArray(reader.unavailableMassIds) &&
            !reader.preferredMassIds.some(id => reader.unavailableMassIds.includes(id)) &&
            reader.mustChangePassword === true &&
            typeof reader.passwordHash === 'string' &&
            reader.passwordHash.startsWith('$2'),
        );
      if (!valid) throw new Error('La verificación posterior encontró datos inesperados');
      console.log(
        JSON.stringify(
          {
            ok: true,
            mode: 'verify',
            readerCount: storedReaders.length,
            assignmentCount,
            activeReaders: storedReaders.filter(reader => reader.active).length,
            temporaryPasswordsPending: storedReaders.filter(reader => reader.mustChangePassword).length,
          },
          null,
          2,
        ),
      );
      return;
    }

    const credentials = [];
    const documents = [];
    for (const row of sourceRows) {
      const preferred = splitMasses(row.misas_preferidas);
      const alternatives = splitMasses(row.misas_alternativas);
      const unavailable = splitMasses(row.misas_no_disponibles);
      const overlap = preferred.filter(label => unavailable.includes(label));
      if (overlap.length)
        throw new Error(
          `${row.nombre} tiene horarios preferidos e imposibles a la vez: ${overlap.join(', ')}`,
        );
      if (new Set([...preferred, ...alternatives, ...unavailable]).size !== 6)
        throw new Error(`${row.nombre} no tiene exactamente un estado para cada una de las seis misas`);
      const password = temporaryPassword();
      credentials.push({ name: row.nombre, password });
      const preferredMassIds = preferred.map(label => massByLabel.get(label).id);
      documents.push({
        id: crypto.randomUUID(),
        name: row.nombre,
        phone: '',
        notes: '',
        active: row.activo === 'SI',
        substituteOnly: row.solo_suplente === 'SI',
        preferredMassIds,
        unavailableMassIds: unavailable.map(label => massByLabel.get(label).id),
        availability: preferredMassIds,
        preferenceModel: 1,
        passwordHash: await bcrypt.hash(password, 12),
        mustChangePassword: true,
        passwordResetAt: new Date(),
        createdAt: new Date(),
      });
    }

    fs.mkdirSync(PRIVATE_DIR, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const [oldReaders, oldAssignments] = await Promise.all([
      database.collection('readers').find({}).toArray(),
      database.collection('assignments').find({}).toArray(),
    ]);
    const backupPath = path.join(PRIVATE_DIR, `respaldo-antes-lectores-reales-${stamp}.json`);
    const credentialsPath = path.join(PRIVATE_DIR, `credenciales-temporales-lectores-${stamp}.csv`);
    fs.writeFileSync(
      backupPath,
      JSON.stringify({ createdAt: new Date(), readers: oldReaders, assignments: oldAssignments }, null, 2),
      'utf8',
    );
    fs.writeFileSync(
      credentialsPath,
      '\uFEFF"nombre","contrasena_temporal"\n' +
        credentials.map(item => `${csvValue(item.name)},${csvValue(item.password)}`).join('\n') +
        '\n',
      'utf8',
    );

    const session = client.startSession();
    try {
      await session.withTransaction(async () => {
        await database.collection('assignments').deleteMany({}, { session });
        await database.collection('readers').deleteMany({}, { session });
        await database.collection('readers').insertMany(documents, { session });
      });
    } finally {
      await session.endSession();
    }

    const [readerCount, assignmentCount] = await Promise.all([
      database.collection('readers').countDocuments({}),
      database.collection('assignments').countDocuments({}),
    ]);
    if (readerCount !== 30 || assignmentCount !== 0)
      throw new Error(`Verificación inesperada: ${readerCount} lectores y ${assignmentCount} asignaciones`);
    console.log(
      JSON.stringify(
        { ok: true, readerCount, assignmentCount, backupPath, credentialsPath, masses: requestedLabels },
        null,
        2,
      ),
    );
  } finally {
    await client.close();
  }
}

run().catch(error => {
  console.error(`IMPORTACIÓN CANCELADA: ${error.message}`);
  process.exitCode = 1;
});
