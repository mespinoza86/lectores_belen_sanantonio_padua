// Pruebas de integración de las reglas de asignación.
//
// Corren contra un MongoDB real en memoria, con conjunto de réplica para que
// `withTransaction` funcione: la generación aleatoria, Asignar no asignados, el
// rechazo y la edición de suplentes son todas transaccionales, y un mongod suelto
// no las soportaría.
//
// Todo se ejercita por HTTP contra el servidor real, no llamando a funciones
// internas, para que la prueba recorra el mismo camino que la aplicación.

const test = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');
const crypto = require('node:crypto');
const { MongoClient } = require('mongodb');
const bcrypt = require('bcrypt');

// `mongodb-memory-server` es una dependencia de desarrollo, así que no existe en una
// instalación de producción (`npm install` con NODE_ENV=production la omite). Si el
// alojamiento ejecutase `npm test` durante el despliegue, un require directo lo
// tumbaría. Aquí se avisa y se salta, en voz alta, en vez de romper la construcción.
let MongoMemoryReplSet;
try {
  ({ MongoMemoryReplSet } = require('mongodb-memory-server'));
} catch {
  test(
    'pruebas de integración de las reglas de asignación',
    {
      skip: 'falta mongodb-memory-server, dependencia de desarrollo: ejecuta npm install sin NODE_ENV=production',
    },
    () => {},
  );
  // En CommonJS el módulo está envuelto en una función, así que este return es válido
  // y evita registrar el resto de las pruebas.
  return;
}

const ADMIN = 'clave-administrativa-de-prueba';
const CLAVE_LECTOR = 'clave-de-lector-de-prueba';
const MES = '2099-01';

let replica;
let mongo;
let db;
let servidor;
let base;
let cookieAdmin;
let hashLector;

function puertoLibre() {
  return new Promise((resolve, reject) => {
    const sonda = net.createServer();
    sonda.once('error', reject);
    sonda.listen(0, '127.0.0.1', () => {
      const { port } = sonda.address();
      sonda.close(() => resolve(port));
    });
  });
}

test.before(async () => {
  // `launchTimeout` sube de los 10 s por omisión a 60 s. Un arranque en frío del
  // binario de mongod, con el antivirus revisándolo la primera vez, puede pasarse de
  // 10 s y hacer fallar la suite entera sin que nada esté mal.
  replica = await MongoMemoryReplSet.create({ replSet: { count: 1, launchTimeout: 60_000 } });
  const uri = replica.getUri();
  const puerto = await puertoLibre();

  // El servidor lee estas variables al cargar el módulo, así que hay que fijarlas
  // antes del require. MONGODB_HOSTS se vacía para que no se aplique el rodeo de
  // Atlas y la URI de memoria se use tal cual.
  process.env.PORT = String(puerto);
  process.env.MONGODB_URI = uri;
  process.env.MONGODB_DB = 'lectores_pruebas';
  process.env.MONGODB_HOSTS = '';
  process.env.ADMIN_PASSWORD = ADMIN;

  servidor = require('../server');
  await servidor.start();
  base = `http://127.0.0.1:${puerto}`;

  mongo = new MongoClient(uri);
  await mongo.connect();
  db = mongo.db('lectores_pruebas');

  hashLector = await bcrypt.hash(CLAVE_LECTOR, 12);

  const acceso = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: ADMIN }),
  });
  assert.equal(acceso.status, 200, 'el acceso administrativo debería funcionar');
  cookieAdmin = acceso.headers
    .getSetCookie()
    .map(valor => valor.split(';')[0])
    .join('; ');
});

test.after(async () => {
  if (mongo) await mongo.close();
  if (servidor) await servidor.shutdown();
  if (replica) await replica.stop();
});

test.beforeEach(async () => {
  for (const nombre of ['readers', 'masses', 'assignments', 'auth_rate_limits']) {
    await db.collection(nombre).deleteMany({});
  }
});

// --- Utilidades -------------------------------------------------------------

function api(metodo, ruta, cuerpo, conCookie = true) {
  return fetch(base + ruta, {
    method: metodo,
    headers: {
      'Content-Type': 'application/json',
      ...(conCookie ? { cookie: cookieAdmin } : {}),
    },
    ...(cuerpo === undefined ? {} : { body: JSON.stringify(cuerpo) }),
  });
}

async function crearMisa({ nombre, hora = '18:00', weekday = 0, roles }) {
  const misa = {
    id: crypto.randomUUID(),
    name: nombre,
    time: hora,
    roles,
    type: 'weekly',
    weekday,
    date: null,
    active: true,
  };
  await db.collection('masses').insertOne(misa);
  return misa;
}

async function crearLectores(cantidad, misasPreferidas, extra = {}) {
  const lectores = Array.from({ length: cantidad }, (_, indice) => ({
    id: crypto.randomUUID(),
    name: `Lector ${String(indice + 1).padStart(2, '0')}`,
    phone: '',
    notes: '',
    passwordHash: hashLector,
    availability: misasPreferidas,
    preferredMassIds: misasPreferidas,
    unavailableMassIds: [],
    preferenceModel: 1,
    active: true,
    substituteOnly: false,
    ...extra,
  }));
  await db.collection('readers').insertMany(lectores);
  return lectores;
}

function asignacion({ misa, fecha, role, readerId, suplentes = [] }) {
  return {
    id: crypto.randomUUID(),
    massId: misa.id,
    readerId,
    role,
    month: MES,
    date: fecha,
    substituteIds: [...suplentes],
    confirmationStatus: 'pending',
    createdAt: new Date(),
  };
}

const asignacionesDelMes = () => db.collection('assignments').find({ month: MES }).toArray();

// Nadie puede figurar en la banca de ninguna celebración.
function bancasSinLector(documentos, readerId) {
  return documentos
    .filter(documento => (documento.substituteIds || []).includes(readerId))
    .map(documento => `${documento.date}/${documento.role}`);
}

// --- Generación aleatoria ---------------------------------------------------

test('la generación aleatoria cubre el mes y respeta una misa por persona', async () => {
  const primera = await crearMisa({ nombre: 'Misa A', weekday: 0, roles: ['Primera', 'Salmo'] });
  const segunda = await crearMisa({ nombre: 'Misa B', weekday: 6, roles: ['Primera', 'Salmo'] });
  await crearLectores(12, [primera.id, segunda.id]);

  const respuesta = await api('POST', '/api/random-assignments', { month: MES });
  assert.equal(respuesta.status, 201);

  const documentos = await asignacionesDelMes();
  const fechasA = servidor.massOccurrences(primera, MES);
  const fechasB = servidor.massOccurrences(segunda, MES);
  const esperados = fechasA.length * 2 + fechasB.length * 2;

  assert.equal(documentos.length, esperados, 'debería haber un documento por puesto del mes');
  assert.equal(
    documentos.filter(documento => !documento.readerId).length,
    0,
    'ningún puesto debería quedar sin titular',
  );
  assert.doesNotThrow(() => servidor.assertReadersBelongToSingleMass(documentos));

  // Cada persona pertenece a una sola misa, como titular o como suplente.
  const misaPorPersona = new Map();
  for (const documento of documentos) {
    for (const readerId of [documento.readerId, ...(documento.substituteIds || [])].filter(Boolean)) {
      const anterior = misaPorPersona.get(readerId);
      assert.ok(
        anterior === undefined || anterior === documento.massId,
        `${readerId} aparece en dos misas distintas`,
      );
      misaPorPersona.set(readerId, documento.massId);
    }
  }
});

test('sin lectores suficientes la generación aborta y no deja nada escrito', async () => {
  const primera = await crearMisa({ nombre: 'Misa A', weekday: 0, roles: ['Primera', 'Salmo'] });
  const segunda = await crearMisa({ nombre: 'Misa B', weekday: 6, roles: ['Primera', 'Salmo'] });
  // Hacen falta 8 titulares más suplentes; con 5 personas es imposible.
  await crearLectores(5, [primera.id, segunda.id]);

  const respuesta = await api('POST', '/api/random-assignments', { month: MES });
  assert.equal(respuesta.status, 400, 'debería rechazarse por falta de lectores');

  assert.deepEqual(await asignacionesDelMes(), [], 'la transacción no debe dejar restos');
});

test('la generación no exige puestos de una misa que no se celebra en el mes', async () => {
  const semanal = await crearMisa({ nombre: 'Semanal', weekday: 0, roles: ['Primera', 'Salmo'] });
  // Misa especial de otro mes: no debe aportar ningún puesto a este.
  await db.collection('masses').insertOne({
    id: crypto.randomUUID(),
    name: 'Especial de otro mes',
    time: '09:00',
    roles: ['Primera', 'Salmo', 'Segunda', 'Moniciones'],
    type: 'once',
    weekday: null,
    date: '2099-06-15',
    active: true,
  });
  await crearLectores(6, [semanal.id]);

  const respuesta = await api('POST', '/api/random-assignments', { month: MES });
  assert.equal(respuesta.status, 201, 'la misa especial de otro mes no debería estorbar');

  const documentos = await asignacionesDelMes();
  const fechas = servidor.massOccurrences(semanal, MES);
  assert.equal(documentos.length, fechas.length * 2);
  assert.ok(
    documentos.every(documento => documento.massId === semanal.id),
    'solo debería planificarse la misa semanal',
  );
});

// --- Rechazo de asistencia --------------------------------------------------

test('al rechazar, el suplente que asciende sale de la banca de TODAS las fechas', async () => {
  // Regresión del fallo corregido el 22 de septiembre de 2026: la banca de una misa
  // recurrente se repite en cada fecha, y retirarlo solo de la celebración rechazada
  // lo dejaba como suplente de su propia misa en las demás.
  const misa = await crearMisa({ nombre: 'Misa A', weekday: 0, roles: ['Primera', 'Salmo'] });
  const [quienRechaza, suplente, otro] = await crearLectores(3, [misa.id]);
  const [primeraFecha, segundaFecha] = servidor.massOccurrences(misa, MES);
  assert.ok(segundaFecha, 'la misa debería tener al menos dos fechas en el mes');

  const titular = asignacion({
    misa,
    fecha: primeraFecha,
    role: 'Primera',
    readerId: quienRechaza.id,
    suplentes: [suplente.id],
  });
  await db.collection('assignments').insertMany([
    titular,
    asignacion({ misa, fecha: primeraFecha, role: 'Salmo', readerId: otro.id, suplentes: [suplente.id] }),
    asignacion({ misa, fecha: segundaFecha, role: 'Primera', readerId: otro.id, suplentes: [suplente.id] }),
    asignacion({
      misa,
      fecha: segundaFecha,
      role: 'Salmo',
      readerId: quienRechaza.id,
      suplentes: [suplente.id],
    }),
  ]);

  const respuesta = await fetch(`${base}/api/confirmations/${titular.id}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'decline', password: CLAVE_LECTOR }),
  });
  assert.equal(respuesta.status, 200);

  const documentos = await asignacionesDelMes();
  const ascendido = documentos.find(documento => documento.id === titular.id);
  assert.equal(ascendido.readerId, suplente.id, 'el suplente debería haber ascendido');
  assert.equal(ascendido.originalReaderId, quienRechaza.id, 'debe conservarse el titular original');

  assert.deepEqual(
    bancasSinLector(documentos, suplente.id),
    [],
    'el ascendido no debe quedar en ninguna banca, ni la de su propia misa',
  );
  assert.doesNotThrow(
    () => servidor.assertReadersBelongToSingleMass(documentos),
    'el estado posterior al rechazo debe seguir cumpliendo una misa por persona',
  );
});

test('un rechazo sin suplente disponible deja el puesto pendiente de reemplazo', async () => {
  const misa = await crearMisa({ nombre: 'Misa A', weekday: 0, roles: ['Primera'] });
  const [quienRechaza] = await crearLectores(1, [misa.id]);
  const [primeraFecha] = servidor.massOccurrences(misa, MES);

  const titular = asignacion({ misa, fecha: primeraFecha, role: 'Primera', readerId: quienRechaza.id });
  await db.collection('assignments').insertOne(titular);

  const respuesta = await fetch(`${base}/api/confirmations/${titular.id}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'decline', password: CLAVE_LECTOR }),
  });
  assert.equal(respuesta.status, 200);

  const documento = await db.collection('assignments').findOne({ id: titular.id });
  assert.equal(documento.readerId, null);
  assert.equal(documento.confirmationStatus, 'needs_replacement');
  assert.equal(documento.originalReaderId, quienRechaza.id);
});

test('una decisión ya registrada no se puede revertir', async () => {
  const misa = await crearMisa({ nombre: 'Misa A', weekday: 0, roles: ['Primera'] });
  const [lector] = await crearLectores(1, [misa.id]);
  const [primeraFecha] = servidor.massOccurrences(misa, MES);
  const titular = asignacion({ misa, fecha: primeraFecha, role: 'Primera', readerId: lector.id });
  await db.collection('assignments').insertOne(titular);

  const confirmar = () =>
    fetch(`${base}/api/confirmations/${titular.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'confirm', password: CLAVE_LECTOR }),
    });

  assert.equal((await confirmar()).status, 200);
  assert.equal((await confirmar()).status, 400, 'la segunda vez debería rechazarse');
});

// --- Asignar no asignados ---------------------------------------------------

test('Asignar no asignados llena solo los huecos y no toca lo ya confirmado', async () => {
  const misa = await crearMisa({ nombre: 'Misa A', weekday: 0, roles: ['Primera', 'Salmo'] });
  const lectores = await crearLectores(8, [misa.id]);
  const fechas = servidor.massOccurrences(misa, MES);

  // Se ocupa solo el puesto de Primera de cada fecha; los de Salmo quedan vacíos.
  const existentes = fechas.map((fecha, indice) =>
    asignacion({ misa, fecha, role: 'Primera', readerId: lectores[indice % 4].id }),
  );
  existentes[0].confirmationStatus = 'confirmed';
  await db.collection('assignments').insertMany(existentes);

  const respuesta = await api('POST', '/api/fill-unassigned', { month: MES });
  assert.equal(respuesta.status, 200);

  const documentos = await asignacionesDelMes();
  assert.equal(documentos.length, fechas.length * 2, 'deberían existir todos los puestos del mes');
  assert.equal(documentos.filter(documento => !documento.readerId).length, 0);

  const confirmada = documentos.find(documento => documento.id === existentes[0].id);
  assert.equal(confirmada.confirmationStatus, 'confirmed', 'no debe tocarse una confirmación previa');
  assert.equal(confirmada.readerId, existentes[0].readerId);

  assert.doesNotThrow(() => servidor.assertReadersBelongToSingleMass(documentos));
});

test('al ascender a un suplente, Asignar no asignados lo retira de toda la banca', async () => {
  const misa = await crearMisa({ nombre: 'Misa A', weekday: 0, roles: ['Primera', 'Salmo'] });
  const [titularA, titularB, suplente] = await crearLectores(3, [misa.id]);
  const fechas = servidor.massOccurrences(misa, MES);

  // Solo hay un candidato libre, el suplente, y está en la banca de todas las fechas.
  const existentes = fechas.flatMap((fecha, indice) => [
    asignacion({
      misa,
      fecha,
      role: 'Primera',
      readerId: indice % 2 === 0 ? titularA.id : titularB.id,
      suplentes: [suplente.id],
    }),
  ]);
  await db.collection('assignments').insertMany(existentes);

  const respuesta = await api('POST', '/api/fill-unassigned', { month: MES });
  assert.equal(respuesta.status, 200);

  const documentos = await asignacionesDelMes();
  const ascendido = documentos.filter(documento => documento.readerId === suplente.id);
  assert.ok(ascendido.length > 0, 'el suplente debería haber ascendido a algún puesto');
  assert.deepEqual(
    bancasSinLector(documentos, suplente.id),
    [],
    'quien asciende no puede seguir en ninguna banca',
  );
  assert.doesNotThrow(() => servidor.assertReadersBelongToSingleMass(documentos));
});

// --- Ascenso manual de un suplente ------------------------------------------

// El desplegable "Asignar lector…" de Inicio llama a esta ruta. Antes rebotaba
// siempre que se elegía a alguien de la banca de la propia misa, que es justo a
// quien tiene sentido elegir: la comprobación de "una sola misa por persona" no
// distinguía la banca propia de la ajena, y el $pull de después era código muerto.

test('ascender a un suplente de la banca lo retira de la banca de todas las fechas', async () => {
  const misa = await crearMisa({ nombre: 'Misa A', weekday: 0, roles: ['Primera', 'Salmo'] });
  const [titularPrimera, titularSalmo, suplente] = await crearLectores(3, [misa.id]);
  const fechas = servidor.massOccurrences(misa, MES);
  assert.ok(fechas.length > 1, 'la misa debería celebrarse varias veces en el mes');

  // La banca se replica en los cuatro documentos, tal como la deja la aplicación.
  const documentosIniciales = fechas.flatMap(fecha => [
    asignacion({ misa, fecha, role: 'Primera', readerId: titularPrimera.id, suplentes: [suplente.id] }),
    asignacion({ misa, fecha, role: 'Salmo', readerId: titularSalmo.id, suplentes: [suplente.id] }),
  ]);
  const vacante = documentosIniciales[0];
  vacante.readerId = null;
  vacante.confirmationStatus = 'needs_replacement';
  vacante.originalReaderId = titularPrimera.id;
  await db.collection('assignments').insertMany(documentosIniciales);

  const respuesta = await api('POST', `/api/replacement/${vacante.id}`, {
    readerId: suplente.id,
    massId: misa.id,
    role: 'Primera',
    date: vacante.date,
    month: MES,
  });
  assert.equal(respuesta.status, 200, 'ascender a un suplente de la propia misa debe permitirse');

  const documentos = await asignacionesDelMes();
  const ascendido = documentos.find(documento => documento.id === vacante.id);
  assert.equal(ascendido.readerId, suplente.id, 'el suplente debería haber quedado de titular');
  assert.deepEqual(
    bancasSinLector(documentos, suplente.id),
    [],
    'el ascendido no debe quedar en ninguna banca, ni la de las demás fechas de su misa',
  );
  assert.doesNotThrow(
    () => servidor.assertReadersBelongToSingleMass(documentos),
    'el estado posterior al ascenso debe seguir cumpliendo una misa por persona',
  );
});

test('ascender a un suplente a un puesto que todavía no existe también lo saca de la banca', async () => {
  const misa = await crearMisa({ nombre: 'Misa A', weekday: 0, roles: ['Primera', 'Salmo'] });
  const [titularSalmo, suplente] = await crearLectores(2, [misa.id]);
  const fechas = servidor.massOccurrences(misa, MES);

  // Solo existe el Salmo: la Primera aún no tiene documento, y el desplegable de
  // Inicio llama entonces a /api/replacement/new.
  await db
    .collection('assignments')
    .insertMany(
      fechas.map(fecha =>
        asignacion({ misa, fecha, role: 'Salmo', readerId: titularSalmo.id, suplentes: [suplente.id] }),
      ),
    );

  const respuesta = await api('POST', '/api/replacement/new', {
    readerId: suplente.id,
    massId: misa.id,
    role: 'Primera',
    date: fechas[0],
    month: MES,
  });
  assert.equal(respuesta.status, 201, 'debería crear la asignación');

  const documentos = await asignacionesDelMes();
  assert.ok(
    documentos.some(documento => documento.role === 'Primera' && documento.readerId === suplente.id),
    'el suplente debería aparecer como titular de la Primera',
  );
  assert.deepEqual(
    bancasSinLector(documentos, suplente.id),
    [],
    'quien asciende no puede seguir en la banca de su propia misa',
  );
  assert.doesNotThrow(() => servidor.assertReadersBelongToSingleMass(documentos));
});

test('un suplente de otra misa del mes sigue sin poder ascender aquí', async () => {
  const primera = await crearMisa({ nombre: 'Misa A', weekday: 0, roles: ['Primera'] });
  const segunda = await crearMisa({ nombre: 'Misa B', weekday: 6, roles: ['Primera'] });
  const [titularA, titularB, suplenteDeB] = await crearLectores(3, [primera.id, segunda.id]);
  const [fechaA] = servidor.massOccurrences(primera, MES);
  const [fechaB] = servidor.massOccurrences(segunda, MES);

  const vacante = asignacion({ misa: primera, fecha: fechaA, role: 'Primera', readerId: null });
  vacante.confirmationStatus = 'needs_replacement';
  vacante.originalReaderId = titularA.id;
  await db.collection('assignments').insertMany([
    vacante,
    asignacion({
      misa: segunda,
      fecha: fechaB,
      role: 'Primera',
      readerId: titularB.id,
      suplentes: [suplenteDeB.id],
    }),
  ]);

  const respuesta = await api('POST', `/api/replacement/${vacante.id}`, {
    readerId: suplenteDeB.id,
    massId: primera.id,
    role: 'Primera',
    date: fechaA,
    month: MES,
  });
  assert.equal(respuesta.status, 400, 'la banca de OTRA misa debe seguir bloqueando');

  const documento = await db.collection('assignments').findOne({ id: vacante.id });
  assert.equal(documento.readerId, null, 'el puesto debe quedar como estaba');
});

// --- Edición de suplentes ---------------------------------------------------

test('poner a alguien de suplente lo retira de la banca de otra misa del mes', async () => {
  const primera = await crearMisa({ nombre: 'Misa A', weekday: 0, roles: ['Primera'] });
  const segunda = await crearMisa({ nombre: 'Misa B', weekday: 6, roles: ['Primera'] });
  const [titularA, titularB, suplente] = await crearLectores(3, [primera.id, segunda.id]);
  const [fechaA] = servidor.massOccurrences(primera, MES);
  const [fechaB] = servidor.massOccurrences(segunda, MES);

  await db.collection('assignments').insertMany([
    asignacion({
      misa: primera,
      fecha: fechaA,
      role: 'Primera',
      readerId: titularA.id,
      suplentes: [suplente.id],
    }),
    asignacion({ misa: segunda, fecha: fechaB, role: 'Primera', readerId: titularB.id }),
  ]);

  const respuesta = await api('POST', '/api/substitutes', {
    massId: segunda.id,
    date: fechaB,
    substituteIds: [suplente.id],
  });
  assert.equal(respuesta.status, 200);

  const documentos = await asignacionesDelMes();
  const enPrimera = documentos.filter(documento => documento.massId === primera.id);
  assert.ok(
    enPrimera.every(documento => !(documento.substituteIds || []).includes(suplente.id)),
    'debería haber salido de la banca de la otra misa',
  );
  assert.doesNotThrow(() => servidor.assertReadersBelongToSingleMass(documentos));
});

test('un titular del mes no puede quedar además como suplente', async () => {
  const misa = await crearMisa({ nombre: 'Misa A', weekday: 0, roles: ['Primera'] });
  const [titular] = await crearLectores(1, [misa.id]);
  const [fecha] = servidor.massOccurrences(misa, MES);
  await db
    .collection('assignments')
    .insertOne(asignacion({ misa, fecha, role: 'Primera', readerId: titular.id }));

  const respuesta = await api('POST', '/api/substitutes', {
    massId: misa.id,
    date: fecha,
    substituteIds: [titular.id],
  });
  assert.equal(respuesta.status, 400, 'un titular del mes no es un suplente válido');
});

// --- Permisos ---------------------------------------------------------------

test('las rutas de planificación exigen sesión administrativa', async () => {
  for (const [ruta, cuerpo] of [
    ['/api/random-assignments', { month: MES }],
    ['/api/fill-unassigned', { month: MES }],
    ['/api/substitutes', { massId: 'x', date: '2099-01-04', substituteIds: [] }],
  ]) {
    const respuesta = await api('POST', ruta, cuerpo, false);
    assert.equal(respuesta.status, 401, `${ruta} debería exigir sesión`);
  }
});
