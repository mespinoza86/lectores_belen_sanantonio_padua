const $ = selector => document.querySelector(selector);
const esc = value =>
  String(value ?? '').replace(
    /[&<>'"]/g,
    character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character],
  );
const weekdays = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

async function request(url, options) {
  const response = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...options });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'No se pudo completar la operación');
  return data;
}

function schedule(mass) {
  if (mass.type === 'once') {
    const [year, month, day] = mass.date.split('-').map(Number);
    const date = new Date(year, month - 1, day).toLocaleDateString('es-CR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    return `${date.replace(/^./, letter => letter.toUpperCase())} · ${mass.time}`;
  }
  return `${weekdays[mass.weekday]} · ${mass.time}`;
}

function readerPrefersMass(reader, massId) {
  return (
    Array.isArray(reader.preferredMassIds) ? reader.preferredMassIds : reader.availability || []
  ).includes(massId);
}
function readerCanServeMass(reader, massId) {
  return Array.isArray(reader.unavailableMassIds) || reader.preferenceModel === 1
    ? !(reader.unavailableMassIds || []).includes(massId)
    : (reader.availability || []).includes(massId);
}
function coverage(preferredNormal, preferredTotal, possibleNormal, possibleTotal, roles) {
  const minimum = roles + 1;
  if (preferredNormal >= roles && preferredTotal >= minimum)
    return { key: 'good', label: 'Preferida suficiente' };
  if (possibleNormal >= roles && possibleTotal >= minimum)
    return { key: 'tight', label: 'Requiere alternativas' };
  return { key: 'insufficient', label: 'Insuficiente' };
}

function currentCostaRicaMonth() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Costa_Rica',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(
    parts.filter(part => part.type !== 'literal').map(part => [part.type, part.value]),
  );
  return `${values.year}-${values.month}`;
}

function monthName(month) {
  const [year, value] = month.split('-').map(Number);
  return new Date(year, value - 1, 1)
    .toLocaleDateString('es-CR', { month: 'long', year: 'numeric' })
    .replace(/^./, letter => letter.toUpperCase());
}

function renderReaderConfirmations(readers, assignments, month) {
  const monthly = assignments.filter(assignment => assignment.month === month);
  const values = new Map(
    readers.map(reader => [reader.id, { reader, confirmed: 0, declined: 0, pending: 0 }]),
  );
  monthly.forEach(assignment => {
    const current = values.get(assignment.readerId);
    if (current) {
      if (assignment.confirmationStatus === 'confirmed') current.confirmed += 1;
      else if (assignment.confirmationStatus === 'pending' || !assignment.confirmationStatus)
        current.pending += 1;
    }
    (assignment.confirmationHistory || []).forEach(entry => {
      if (entry.action === 'declined' && values.has(entry.readerId)) values.get(entry.readerId).declined += 1;
    });
  });
  const rows = [...values.values()]
    .filter(row => row.confirmed || row.declined || row.pending)
    .sort(
      (a, b) =>
        b.declined - a.declined ||
        b.confirmed - a.confirmed ||
        a.reader.name.localeCompare(b.reader.name, 'es'),
    );
  const confirmed = rows.reduce((total, row) => total + row.confirmed, 0);
  const declined = rows.reduce((total, row) => total + row.declined, 0);
  const pending = rows.reduce((total, row) => total + row.pending, 0);
  const readersWithDeclines = rows.filter(row => row.declined).length;
  $('#readerConfirmationSummary').innerHTML =
    `<article><span class="stat-icon green">✓</span><div><strong>${confirmed}</strong><small>Confirmaciones</small></div></article><article><span class="stat-icon rose">×</span><div><strong>${declined}</strong><small>Avisos de no asistencia</small></div></article><article><span class="stat-icon gold">…</span><div><strong>${pending}</strong><small>Respuestas pendientes</small></div></article><article><span class="stat-icon rose">♙</span><div><strong>${readersWithDeclines}</strong><small>Lectores con rechazos</small></div></article>`;
  $('#readerConfirmationTable').innerHTML = rows.length
    ? `<table class="reader-confirmation-table"><thead><tr><th>Lector</th><th>Confirmó</th><th>No asistirá</th><th>Pendiente</th><th>Decisiones</th></tr></thead><tbody>${rows
        .map(({ reader, confirmed, declined, pending }) => {
          const decisions = confirmed + declined;
          const confirmationRate = decisions ? Math.round((confirmed / decisions) * 100) : 0;
          return `<tr class="${declined ? 'has-declines' : ''}"><td><b>${esc(reader.name)}</b><small>${reader.active ? 'Activo' : 'Inactivo'}${reader.substituteOnly ? ' · Solo suplente' : ''}</small></td><td><span class="metric confirmed">${confirmed}</span></td><td><span class="metric declined">${declined}</span></td><td><span class="metric pending">${pending}</span></td><td><b>${decisions ? `${confirmationRate}% confirmó` : 'Sin respuesta'}</b><small>${decisions} decisión${decisions === 1 ? '' : 'es'} registrada${decisions === 1 ? '' : 's'}</small></td></tr>`;
        })
        .join('')}</tbody></table>`
    : `<article class="card"><h3>Sin respuestas en ${esc(monthName(month))}</h3><p>No hay confirmaciones, rechazos ni asignaciones pendientes registradas para este mes.</p></article>`;
}

// Directorio administrativo: quién está activo, quién solo suple y quién está inactivo,
// con la participación de cada persona durante el mes consultado.
function monthPlacements(assignments, masses, month) {
  const massName = id => masses.find(mass => mass.id === id)?.name || 'Misa';
  const placements = new Map();
  const add = (readerId, kind, massId) => {
    if (!readerId) return;
    const label = `${kind === 'titular' ? 'Titular' : 'Suplente'} · ${massName(massId)}`;
    const current = placements.get(readerId) || [];
    if (!current.some(entry => entry.label === label)) current.push({ kind, label });
    placements.set(readerId, current);
  };
  assignments
    .filter(assignment => assignment.month === month)
    .forEach(assignment => {
      add(assignment.readerId, 'titular', assignment.massId);
      (assignment.substituteIds || []).forEach(id => add(id, 'substitute', assignment.massId));
    });
  return placements;
}

function renderReaderDirectory(readers, masses, assignments, month) {
  const placements = monthPlacements(assignments, masses, month);
  const activeMasses = masses.filter(mass => mass.active);
  const byName = (a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' });
  const normal = readers.filter(reader => reader.active && !reader.substituteOnly).sort(byName);
  const substitutes = readers.filter(reader => reader.active && reader.substituteOnly).sort(byName);
  const inactive = readers.filter(reader => !reader.active).sort(byName);
  const idleNormal = normal.filter(reader => !placements.has(reader.id));
  const idleSubstitutes = substitutes.filter(reader => !placements.has(reader.id));
  const idle = [...idleNormal, ...idleSubstitutes];
  $('#readerDirectorySummary').innerHTML =
    `<article><span class="stat-icon green">✓</span><div><strong>${normal.length}</strong><small>Activos normales</small></div></article><article><span class="stat-icon gold">↻</span><div><strong>${substitutes.length}</strong><small>Solo suplentes</small></div></article><article><span class="stat-icon rose">—</span><div><strong>${inactive.length}</strong><small>Inactivos</small></div></article><article><span class="stat-icon gold">…</span><div><strong>${idle.length}</strong><small>Activos sin asignación en ${esc(monthName(month))}</small></div></article>`;
  const unassignedPerson = reader => {
    const preferred = activeMasses.filter(mass => readerPrefersMass(reader, mass.id));
    return `<article class="coverage-reader"><div><b>${esc(reader.name)}</b><span class="coverage-badge ${reader.substituteOnly ? 'substitute-only' : 'normal'}">${reader.substituteOnly ? 'Solo suplente' : 'Lector normal'}</span></div><small><b>Prefiere:</b> ${preferred.length ? preferred.map(mass => esc(mass.name)).join(' · ') : 'Ninguna misa'}</small></article>`;
  };
  const unassignedSection = (title, list) =>
    list.length
      ? `<section class="unassigned-reader-section"><h4>${esc(title)} <span>${list.length}</span></h4><div class="coverage-reader-list">${list.map(unassignedPerson).join('')}</div></section>`
      : '';
  $('#readerUnassignedDirectory').innerHTML =
    `<details class="coverage-group idle unassigned-readers" open><summary class="coverage-group-head"><h3>Lectores sin asignación</h3><div class="coverage-group-meta"><span>${idle.length}</span><span class="coverage-group-arrow" aria-hidden="true">⌄</span></div></summary>${idle.length ? `<div class="unassigned-reader-sections">${unassignedSection('Pueden ser titulares o suplentes', idleNormal)}${unassignedSection('Disponibles únicamente como suplentes', idleSubstitutes)}</div>` : '<div class="coverage-reader-list"><article class="coverage-reader unassigned-empty"><small>Todos los lectores activos tienen asignación este mes.</small></article></div>'}</details>`;
  const person = reader => {
    const marks = (placements.get(reader.id) || []).map(
      entry => `<span class="coverage-badge ${entry.kind}">${esc(entry.label)}</span>`,
    );
    if (reader.active && !marks.length)
      marks.push('<span class="coverage-badge idle">Sin asignación este mes</span>');
    if (reader.mustChangePassword)
      marks.push('<span class="badge off">Cambio de contraseña pendiente</span>');
    const details = [];
    if (reader.phone) details.push(`Tel. ${esc(reader.phone)}`);
    if (reader.active) {
      const preferred = activeMasses.filter(mass => readerPrefersMass(reader, mass.id));
      details.push(
        `Prefiere: ${preferred.length ? preferred.map(mass => esc(mass.name)).join(' · ') : 'ninguna misa'}`,
      );
    } else
      details.push(
        placements.has(reader.id)
          ? 'Inactivo hoy, pero figura en la planificación de este mes'
          : 'Inactivo: no entra en ninguna planificación',
      );
    return `<article class="coverage-reader"><div><b>${esc(reader.name)}</b>${marks.join('')}</div><small>${details.join(' · ')}</small></article>`;
  };
  const group = (title, kind, list, empty) =>
    `<details class="coverage-group ${kind}"><summary class="coverage-group-head"><h3>${esc(title)}</h3><div class="coverage-group-meta"><span>${list.length}</span><span class="coverage-group-arrow" aria-hidden="true">⌄</span></div></summary><div class="coverage-reader-list">${list.length ? list.map(person).join('') : `<article class="coverage-reader"><small>${empty}</small></article>`}</div></details>`;
  $('#readerDirectory').innerHTML =
    group('Activos normales', 'preferred', normal, 'No hay lectores activos.') +
    group('Solo suplentes', 'flexible', substitutes, 'Ningún lector está configurado como solo suplente.') +
    group('Inactivos', 'unavailable', inactive, 'No hay lectores inactivos.');
}

function render(readers, masses) {
  const activeReaders = readers.filter(reader => reader.active);
  const activeMasses = masses.filter(mass => mass.active);
  const rows = activeMasses
    .map(mass => {
      const preferred = activeReaders.filter(reader => readerPrefersMass(reader, mass.id));
      const flexible = activeReaders.filter(
        reader => readerCanServeMass(reader, mass.id) && !readerPrefersMass(reader, mass.id),
      );
      const unavailable = activeReaders.length - preferred.length - flexible.length;
      const preferredNormal = preferred.filter(reader => !reader.substituteOnly).length;
      const possibleNormal = [...preferred, ...flexible].filter(reader => !reader.substituteOnly).length;
      const possibleTotal = preferred.length + flexible.length;
      return {
        mass,
        preferred: preferred.length,
        flexible: flexible.length,
        unavailable,
        possibleTotal,
        status: coverage(preferredNormal, preferred.length, possibleNormal, possibleTotal, mass.roles.length),
      };
    })
    .sort(
      (a, b) =>
        a.preferred - b.preferred ||
        a.possibleTotal - b.possibleTotal ||
        schedule(a.mass).localeCompare(schedule(b.mass), 'es'),
    );
  const maxAvailable = Math.max(1, ...rows.map(row => row.possibleTotal));
  const insufficient = rows.filter(row => row.status.key === 'insufficient').length;
  const tight = rows.filter(row => row.status.key === 'tight').length;
  $('#availabilitySummary').innerHTML =
    `<article><span class="stat-icon green">♙</span><div><strong>${activeReaders.length}</strong><small>Lectores activos</small></div></article><article><span class="stat-icon gold">▦</span><div><strong>${activeMasses.length}</strong><small>Misas activas</small></div></article><article><span class="stat-icon rose">!</span><div><strong>${insufficient}</strong><small>Cobertura insuficiente</small></div></article><article><span class="stat-icon gold">≈</span><div><strong>${tight}</strong><small>Cobertura ajustada</small></div></article>`;
  $('#availabilityGrid').innerHTML = rows.length
    ? rows
        .map(({ mass, preferred, flexible, unavailable, possibleTotal, status }) => {
          const minimum = mass.roles.length + 1;
          return `<article class="availability-card ${status.key}"><div class="availability-card-head"><div><h3>${esc(mass.name)}</h3><span class="schedule">${esc(schedule(mass))}</span></div><span class="badge coverage-badge ${status.key}">${status.label}</span></div><div class="availability-total"><strong>${preferred}</strong><span>la prefieren · ${possibleTotal} pueden servir</span></div><div class="availability-bar" title="${possibleTotal} pueden servir"><span style="width:${Math.max(possibleTotal ? 7 : 0, Math.round((possibleTotal / maxAvailable) * 100))}%"></span></div><div class="availability-breakdown preference-breakdown"><div><b>${preferred}</b><small>Preferida</small></div><div><b>${flexible}</b><small>Alternativa</small></div><div><b>${unavailable}</b><small>No pueden asistir</small></div></div><p class="coverage-note">Necesita al menos ${mass.roles.length} lector${mass.roles.length === 1 ? '' : 'es'} apto${mass.roles.length === 1 ? '' : 's'} para titular y 1 suplente (${minimum} personas en total). Las alternativas solo se usan si las preferencias no alcanzan.</p></article>`;
        })
        .join('')
    : '<article class="card"><h3>No hay misas activas</h3><p>Configura una misa para calcular su disponibilidad.</p></article>';
}

let statisticsData = { readers: [], masses: [], assignments: [] };

async function load() {
  try {
    if (sessionStorage.getItem('admin_access_verified') !== 'yes') return location.replace('/login.html');
    const auth = await request('/api/auth/status');
    if (!auth.authenticated) return location.replace('/login.html');
    const [readers, masses, assignments] = await Promise.all([
      request('/api/readers'),
      request('/api/masses'),
      request('/api/assignments'),
    ]);
    statisticsData = { readers, masses, assignments };
    render(readers, masses);
    renderReaderDirectory(readers, masses, assignments, $('#directoryMonth').value);
    renderReaderConfirmations(readers, assignments, $('#statisticsMonth').value);
  } catch (error) {
    $('#availabilityGrid').innerHTML =
      `<article class="card"><h3>No se pudieron cargar las estadísticas</h3><p>${esc(error.message)}</p></article>`;
  }
}

$('#menuBtn').addEventListener('click', () => $('.sidebar').classList.toggle('open'));
$('#logoutBtn').addEventListener('click', async () => {
  sessionStorage.removeItem('admin_access_verified');
  await request('/api/auth/logout', { method: 'POST' });
  location.replace('/');
});
$('#directoryMonth').value = currentCostaRicaMonth();
$('#directoryMonth').addEventListener('change', event => {
  if (event.target.value)
    renderReaderDirectory(
      statisticsData.readers,
      statisticsData.masses,
      statisticsData.assignments,
      event.target.value,
    );
});
$('#statisticsMonth').value = currentCostaRicaMonth();
$('#statisticsMonth').addEventListener('change', event => {
  if (event.target.value)
    renderReaderConfirmations(statisticsData.readers, statisticsData.assignments, event.target.value);
});
load();
