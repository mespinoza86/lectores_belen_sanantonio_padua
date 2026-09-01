const test = require('node:test');
const assert = require('node:assert/strict');
const { PassThrough } = require('node:stream');

process.env.ADMIN_PASSWORD = 'test-admin-password-that-is-not-secret';
const {
  server, body, securityHeaders, createAdminToken, adminSession,
  legacyReaderPasswordHash, readerPasswordHash, readerPasswordMatches,
  publicDoc, publicAssignment, assignmentQuery, previousMonth, costaRicaDateTime, validateNews
} = require('../server');

test('la sesión administrativa firmada acepta tokens válidos y rechaza alteraciones', () => {
  const token = createAdminToken();
  assert.equal(adminSession({ headers: { cookie: `admin_session=${encodeURIComponent(token)}` } }), true);
  assert.equal(adminSession({ headers: { cookie: `admin_session=${encodeURIComponent(`${token}x`)}` } }), false);
});

test('la sesión administrativa expira después de ocho horas', () => {
  const expired = createAdminToken(Date.now() - 8 * 60 * 60 * 1000 - 1);
  assert.equal(adminSession({ headers: { cookie: `admin_session=${encodeURIComponent(expired)}` } }), false);
});

test('bcrypt y los hashes heredados validan contraseñas sin exponerlas', async () => {
  const bcryptHash = await readerPasswordHash('una-clave-segura');
  assert.equal(await readerPasswordMatches({ passwordHash: bcryptHash }, 'una-clave-segura'), true);
  assert.equal(await readerPasswordMatches({ passwordHash: bcryptHash }, 'incorrecta'), false);
  const legacyHash = legacyReaderPasswordHash('11111111');
  assert.equal(await readerPasswordMatches({ passwordHash: legacyHash }, '11111111'), true);
  assert.equal(await readerPasswordMatches({ passwordHash: legacyHash }, ''), false);
});

test('los documentos públicos ocultan hash, identificador interno y teléfono', () => {
  assert.deepEqual(publicDoc({ _id: 'interno', id: 'lector-1', name: 'Ana', phone: '8888', passwordHash: 'hash' }, true), { id: 'lector-1', name: 'Ana' });
});

test('las respuestas incluyen cabeceras defensivas', () => {
  const headers = securityHeaders();
  assert.match(headers['Content-Security-Policy'], /frame-ancestors 'none'/);
  assert.equal(headers['X-Content-Type-Options'], 'nosniff');
  assert.equal(headers['X-Frame-Options'], 'DENY');
});

test('el lector de JSON rechaza cuerpos mayores de 1 MB', async () => {
  const request = new PassThrough();
  const result = body(request);
  request.end(Buffer.alloc(1_000_001, 97));
  await assert.rejects(result, /demasiado grande/);
});

test('la fecha del servidor se expresa en la zona horaria de Costa Rica', () => {
  assert.equal(costaRicaDateTime(new Date('2026-07-16T18:30:00Z')), '2026-07-16T12:30');
});

test('las noticias exigen contenido y una expiración posterior al inicio', () => {
  assert.deepEqual(validateNews({ title: 'Formación', message: 'Sábado a las 2 p. m.', startsAt: '2026-08-03T10:00', expiresAt: '2026-08-10T23:59', active: true }), {
    title: 'Formación', message: 'Sábado a las 2 p. m.', startsAt: '2026-08-03T10:00', expiresAt: '2026-08-10T23:59', active: true
  });
  assert.throws(() => validateNews({ title: 'Aviso', message: 'Texto', startsAt: '2026-08-10T10:00', expiresAt: '2026-08-09T10:00' }), /posterior al inicio/);
  assert.throws(() => validateNews({ title: '', message: 'Texto', expiresAt: '2026-08-10T10:00' }), /obligatorios/);
  assert.throws(() => validateNews({ title: 'Aviso', message: 'Texto', startsAt: '2026-08-03T10:00', expiresAt: '2026-02-31T10:00' }), /expiración/);
});

test('una cabecera Host malformada responde 400 y no derriba el proceso', async () => {
  const net = require('node:net');
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const statusLine = await new Promise(resolve => {
    const socket = net.connect(port, '127.0.0.1', () => socket.write('GET / HTTP/1.1\r\nHost: [\r\n\r\n'));
    let received = '';
    socket.on('data', chunk => { received += chunk; });
    socket.on('close', () => resolve(received.split('\r\n')[0]));
  });
  await new Promise(resolve => server.close(resolve));
  assert.match(statusLine, /400/);
});

test('una cookie con codificación inválida no interrumpe la sesión administrativa', () => {
  assert.equal(adminSession({ headers: { cookie: 'admin_session=%' } }), false);
  const token = createAdminToken();
  assert.equal(adminSession({ headers: { cookie: `rota=%E0%A4%A; admin_session=${encodeURIComponent(token)}` } }), true);
});

test('un lector sin hash almacenado nunca acepta una contraseña', async () => {
  assert.equal(await readerPasswordMatches({ id: 'sin-hash' }, '11111111'), false);
  assert.equal(await readerPasswordMatches({ id: 'sin-hash' }, ''), false);
  assert.equal(await readerPasswordMatches({ id: 'vacio', passwordHash: '' }, '11111111'), false);
});

test('el mes anterior cruza correctamente el cambio de año', () => {
  assert.equal(previousMonth('2026-01'), '2025-12');
  assert.equal(previousMonth('2026-08'), '2026-07');
});

test('las asignaciones se filtran por los meses solicitados', () => {
  const query = q => assignmentQuery(new URL(`http://x/api/assignments${q}`), false);
  assert.deepEqual(query('?months=2026-08,2026-09'), { month: { $in: ['2026-08', '2026-09'] } });
  assert.deepEqual(query('?month=2026-08'), { month: { $in: ['2026-08'] } });
  // Un mes repetido no duplica la condición.
  assert.deepEqual(query('?months=2026-08,2026-08'), { month: { $in: ['2026-08'] } });
});

test('sin parámetros el público recibe una ventana y el administrador el historial completo', () => {
  const current = costaRicaDateTime().slice(0, 7);
  const url = new URL('http://x/api/assignments');
  assert.deepEqual(assignmentQuery(url, true), {});
  assert.deepEqual(assignmentQuery(url, false), { month: { $in: [previousMonth(current), current] } });
});

test('un mes inválido no llega a la consulta de MongoDB', () => {
  const query = q => assignmentQuery(new URL(`http://x/api/assignments${q}`), false);
  const fallback = query('');
  assert.deepEqual(query('?months=basura'), fallback);
  assert.deepEqual(query(`?months=${encodeURIComponent('{"$ne":null}')}`), fallback);
  assert.deepEqual(query('?months=2026-8'), fallback);
});

test('el historial de confirmaciones solo se entrega al administrador', () => {
  const stored = {
    _id: 'interno', id: 'a1', massId: 'm1', month: '2026-08', readerId: 'r1',
    confirmationStatus: 'pending', originalReaderId: 'r9',
    confirmationHistory: [{ readerId: 'r9', action: 'declined' }]
  };
  const publico = publicAssignment(stored, true);
  assert.equal(publico.confirmationHistory, undefined);
  assert.equal(publico.originalReaderId, undefined);
  assert.equal(publico._id, undefined);
  // El estado de confirmación sí es público: la interfaz lo muestra.
  assert.equal(publico.confirmationStatus, 'pending');
  const administrador = publicAssignment(stored, false);
  assert.equal(administrador.confirmationHistory.length, 1);
  assert.equal(administrador.originalReaderId, 'r9');
  // Sanear la copia no debe alterar el documento original.
  assert.equal(stored.originalReaderId, 'r9');
});
