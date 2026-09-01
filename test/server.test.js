const test = require('node:test');
const assert = require('node:assert/strict');
const { PassThrough } = require('node:stream');

process.env.ADMIN_PASSWORD = 'test-admin-password-that-is-not-secret';
const {
  server,
  body,
  securityHeaders,
  createAdminToken,
  adminSession,
  legacyReaderPasswordHash,
  readerPasswordHash,
  readerPasswordMatches,
  publicDoc,
  publicAssignment,
  massesForMonth,
  assertReadersBelongToSingleMass,
  assignmentQuery,
  previousMonth,
  costaRicaDateTime,
  validateNews,
} = require('../server');

test('la sesión administrativa firmada acepta tokens válidos y rechaza alteraciones', () => {
  const token = createAdminToken();
  assert.equal(adminSession({ headers: { cookie: `admin_session=${encodeURIComponent(token)}` } }), true);
  assert.equal(
    adminSession({ headers: { cookie: `admin_session=${encodeURIComponent(`${token}x`)}` } }),
    false,
  );
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
  assert.deepEqual(
    publicDoc({ _id: 'interno', id: 'lector-1', name: 'Ana', phone: '8888', passwordHash: 'hash' }, true),
    { id: 'lector-1', name: 'Ana' },
  );
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
  assert.deepEqual(
    validateNews({
      title: 'Formación',
      message: 'Sábado a las 2 p. m.',
      startsAt: '2026-08-03T10:00',
      expiresAt: '2026-08-10T23:59',
      active: true,
    }),
    {
      title: 'Formación',
      message: 'Sábado a las 2 p. m.',
      startsAt: '2026-08-03T10:00',
      expiresAt: '2026-08-10T23:59',
      active: true,
    },
  );
  assert.throws(
    () =>
      validateNews({
        title: 'Aviso',
        message: 'Texto',
        startsAt: '2026-08-10T10:00',
        expiresAt: '2026-08-09T10:00',
      }),
    /posterior al inicio/,
  );
  assert.throws(
    () => validateNews({ title: '', message: 'Texto', expiresAt: '2026-08-10T10:00' }),
    /obligatorios/,
  );
  assert.throws(
    () =>
      validateNews({
        title: 'Aviso',
        message: 'Texto',
        startsAt: '2026-08-03T10:00',
        expiresAt: '2026-02-31T10:00',
      }),
    /expiración/,
  );
});

test('una cabecera Host malformada responde 400 y no derriba el proceso', async () => {
  const net = require('node:net');
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const statusLine = await new Promise(resolve => {
    const socket = net.connect(port, '127.0.0.1', () => socket.write('GET / HTTP/1.1\r\nHost: [\r\n\r\n'));
    let received = '';
    socket.on('data', chunk => {
      received += chunk;
    });
    socket.on('close', () => resolve(received.split('\r\n')[0]));
  });
  await new Promise(resolve => server.close(resolve));
  assert.match(statusLine, /400/);
});

test('una cookie con codificación inválida no interrumpe la sesión administrativa', () => {
  assert.equal(adminSession({ headers: { cookie: 'admin_session=%' } }), false);
  const token = createAdminToken();
  assert.equal(
    adminSession({ headers: { cookie: `rota=%E0%A4%A; admin_session=${encodeURIComponent(token)}` } }),
    true,
  );
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
    _id: 'interno',
    id: 'a1',
    massId: 'm1',
    month: '2026-08',
    readerId: 'r1',
    confirmationStatus: 'pending',
    originalReaderId: 'r9',
    confirmationHistory: [{ readerId: 'r9', action: 'declined' }],
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

// Las paginas del planificador comparten una sola plantilla; la vista inicial la inyecta el servidor.
const paginaDe = async (ruta, cookie) => {
  const http = require('node:http');
  const { port } = server.address();
  return new Promise(resolve => {
    http.get({ port, path: ruta, headers: cookie ? { Cookie: cookie } : {} }, res => {
      let cuerpo = '';
      res.on('data', trozo => {
        cuerpo += trozo;
      });
      res.on('end', () =>
        resolve({
          code: res.statusCode,
          location: res.headers.location,
          page: (cuerpo.match(/<body[^>]*data-page="([a-z]+)"/) || [, null])[1],
          mode: (cuerpo.match(/<body[^>]*data-mode="([a-z]+)"/) || [, null])[1],
        }),
      );
    });
  });
};

test('cada ruta del planificador sirve la plantilla comun con su vista inicial', async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const esperado = {
      '/': 'dashboard',
      '/index.html': 'dashboard',
      '/lectores.html': 'readers',
      '/misas.html': 'masses',
      '/asignar.html': 'assign',
      '/cobertura.html': 'coverage',
      '/reporte.html': 'report',
    };
    for (const [ruta, vista] of Object.entries(esperado)) {
      const r = await paginaDe(ruta);
      assert.equal(r.code, 200, `${ruta} deberia responder 200`);
      assert.equal(r.page, vista, `${ruta} deberia abrir la vista ${vista}`);
      assert.equal(r.mode, 'user', `${ruta} sin sesion deberia ser modo publico`);
    }
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('las rutas administrativas exigen sesion y conservan su vista', async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const cookie = `admin_session=${encodeURIComponent(createAdminToken())}`;
    const conSesion = await paginaDe('/admin/asignar.html', cookie);
    assert.equal(conSesion.code, 200);
    assert.equal(conSesion.page, 'assign');
    assert.equal(conSesion.mode, 'admin');

    const inicio = await paginaDe('/adminmode.html', cookie);
    assert.equal(inicio.page, 'dashboard');
    assert.equal(inicio.mode, 'admin');

    for (const ruta of ['/adminmode.html', '/admin/asignar.html', '/estadisticas.html']) {
      const sinSesion = await paginaDe(ruta);
      assert.equal(sinSesion.code, 302, `${ruta} sin sesion deberia redirigir`);
      assert.equal(sinSesion.location, '/login.html');
    }
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('una misa especial de otro mes no genera puestos que haya que llenar', () => {
  const semanales = [
    {
      id: 'sab16',
      type: 'weekly',
      weekday: 6,
      time: '16:00',
      roles: ['Primera', 'Segunda', 'Salmo', 'Moniciones'],
    },
    {
      id: 'dom11',
      type: 'weekly',
      weekday: 0,
      time: '11:00',
      roles: ['Primera', 'Segunda', 'Salmo', 'Moniciones'],
    },
  ];
  // Caso real: la Misa Domingo 9am quedo activa con fecha del 30 de agosto.
  const especialDeAgosto = {
    id: 'esp9am',
    type: 'once',
    weekday: null,
    date: '2026-08-30',
    time: '09:00',
    roles: ['Primera', 'Segunda', 'Salmo', 'Moniciones'],
  };
  const todas = [...semanales, especialDeAgosto];

  // En septiembre la especial no se celebra: no debe aportar ningun puesto.
  assert.deepEqual(
    massesForMonth(todas, '2026-09').map(m => m.id),
    ['sab16', 'dom11'],
  );
  // En agosto si se celebra y debe contar.
  assert.deepEqual(
    massesForMonth(todas, '2026-08').map(m => m.id),
    ['sab16', 'dom11', 'esp9am'],
  );
  // Cada misa aporta 4 funciones mas 1 suplente: septiembre pide 10 puestos y
  // agosto 15. Antes del arreglo septiembre pedia 15 e impedia generar el mes.
  const puestos = mes => massesForMonth(todas, mes).reduce((total, m) => total + m.roles.length + 1, 0);
  assert.equal(puestos('2026-09'), 10);
  assert.equal(puestos('2026-08'), 15);
});

test('una misa semanal cuenta en cualquier mes y una especial solo en el suyo', () => {
  const semanal = { id: 's', type: 'weekly', weekday: 0, time: '11:00', roles: ['Primera'] };
  const especial = { id: 'e', type: 'once', date: '2026-12-24', time: '20:00', roles: ['Primera'] };
  for (const mes of ['2026-09', '2026-10', '2026-11', '2026-12']) {
    assert.ok(massesForMonth([semanal], mes).length === 1, `la semanal deberia contar en ${mes}`);
  }
  assert.equal(massesForMonth([especial], '2026-12').length, 1);
  assert.equal(massesForMonth([especial], '2026-11').length, 0);
  // Un mes sin ninguna celebracion no genera puestos en vez de fallar.
  assert.deepEqual(massesForMonth([especial], '2027-01'), []);
});

// La regla del ministerio: cada persona participa en una sola misa al mes, como
// titular o como suplente, nunca en ambas.
const celebracion = (massId, date, role, readerId, substituteIds = []) => ({
  massId,
  date,
  role,
  readerId,
  substituteIds,
  month: '2026-09',
});

test('la validacion rechaza a un titular colocado en dos misas distintas', () => {
  assert.throws(
    () =>
      assertReadersBelongToSingleMass([
        celebracion('A', '2026-09-05', 'Primera', 'x'),
        celebracion('B', '2026-09-06', 'Salmo', 'x'),
      ]),
    /titular en otra misa/,
  );
});

test('la validacion rechaza a un suplente repartido entre dos misas', () => {
  assert.throws(
    () =>
      assertReadersBelongToSingleMass([
        celebracion('A', '2026-09-05', 'Primera', 'p', ['x']),
        celebracion('B', '2026-09-06', 'Primera', 'q', ['x']),
      ]),
    /suplente en mas de una misa|suplente en más de una misa/,
  );
});

test('la validacion rechaza ser titular de una misa y suplente de otra', () => {
  assert.throws(
    () =>
      assertReadersBelongToSingleMass([
        celebracion('A', '2026-09-05', 'Primera', 'x'),
        celebracion('B', '2026-09-06', 'Primera', 'q', ['x']),
      ]),
    /titular como suplente/,
  );
});

test('la validacion rechaza ser titular y suplente de la MISMA misa', () => {
  // Antes pasaba desapercibido: quien ya sirve no debe ocupar ademas la banca.
  assert.throws(
    () => assertReadersBelongToSingleMass([celebracion('A', '2026-09-05', 'Primera', 'x', ['x'])]),
    /titular como suplente/,
  );
  // Y tambien al reves, cuando la banca aparece antes en el recorrido.
  assert.throws(
    () =>
      assertReadersBelongToSingleMass([
        celebracion('A', '2026-09-05', 'Primera', 'q', ['x']),
        celebracion('A', '2026-09-12', 'Salmo', 'x'),
      ]),
    /ya es suplente/,
  );
});

test('la validacion rechaza dos funciones de la misma persona en una celebracion', () => {
  assert.throws(
    () =>
      assertReadersBelongToSingleMass([
        celebracion('A', '2026-09-05', 'Primera', 'x'),
        celebracion('A', '2026-09-05', 'Salmo', 'x'),
      ]),
    /dos funciones/,
  );
});

test('la validacion acepta la rotacion normal de una misa a lo largo del mes', () => {
  // La misma persona sirve las cuatro fechas de su misa, cambiando de funcion,
  // y otras dos personas ocupan la banca de esa misma misa.
  const plan = [
    celebracion('A', '2026-09-05', 'Primera', 'x', ['s1', 's2']),
    celebracion('A', '2026-09-12', 'Salmo', 'x', ['s1', 's2']),
    celebracion('A', '2026-09-19', 'Segunda', 'x', ['s1', 's2']),
    celebracion('A', '2026-09-26', 'Moniciones', 'x', ['s1', 's2']),
    celebracion('B', '2026-09-06', 'Primera', 'y', ['s3']),
  ];
  assert.doesNotThrow(() => assertReadersBelongToSingleMass(plan));
});
