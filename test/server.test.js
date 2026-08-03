const test = require('node:test');
const assert = require('node:assert/strict');
const { PassThrough } = require('node:stream');

process.env.ADMIN_PASSWORD = 'test-admin-password-that-is-not-secret';
const {
  body, securityHeaders, createAdminToken, adminSession,
  legacyReaderPasswordHash, readerPasswordHash, readerPasswordMatches,
  publicDoc, costaRicaDateTime, validateNews
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
