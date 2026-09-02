function render() {
  renderDashboard();
  renderReaders();
  renderMasses();
  if ($('#assignmentBoard')) renderAssignments();
  renderCoverage();
  renderReport();
  if (!isAdmin)
    $$('.assign-select').forEach(select => {
      select.disabled = true;
    });
}
function renderDashboard() {
  $('#readerCount').textContent = state.readers.filter(x => x.active).length;
  $('#massCount').textContent = state.masses.filter(x => x.active).length;
  const slots = state.masses
    .filter(x => x.active)
    .flatMap(x => occurrences(x).flatMap(date => x.roles.map(role => ({ x, role, date }))));
  const filled = slots.filter(({ x, role, date }) => assignment(x.id, role, date)).length;
  $('#assignedCount').textContent = `${slots.length ? Math.round((filled / slots.length) * 100) : 0}%`;
  $('#heroCopy').textContent =
    `Prepara y comparte la planificación de ${monthLabel(state.month).toLowerCase()}.`;
  const events = currentWeekEvents();
  $('#upcoming').innerHTML = events.length
    ? events
        .map(({ mass, date }) => {
          const reserves =
            state.assignments.find(a => a.massId === mass.id && a.date === date && a.substituteIds?.length)
              ?.substituteIds || [];
          const roles = mass.roles
            .map(role => {
              const a = state.assignments.find(
                item => item.massId === mass.id && item.role === role && item.date === date,
              );
              if (!a)
                return `<div class="confirmation-row needs"><div><b>${esc(role)}</b><small>Suplente por definir</small></div>${isAdmin ? adminReplacementSelect('', mass.id, role, date) : ''}</div>`;
              const status = a.confirmationStatus || 'pending';
              const label =
                status === 'confirmed'
                  ? 'Confirmado'
                  : status === 'needs_replacement'
                    ? 'Suplente por definir'
                    : 'Sin confirmar';
              const hasStarted = `${date}T${mass.time}` <= costaRicaDateTime();
              const controls = hasStarted
                ? '<small>Misa finalizada</small>'
                : status === 'pending' && a.readerId
                  ? `<div class="confirmation-actions"><button class="small-btn confirm-reader" data-id="${a.id}">Confirmar</button><button class="small-btn danger decline-reader" data-id="${a.id}">No puedo asistir</button></div>`
                  : status === 'needs_replacement' && isAdmin
                    ? adminReplacementSelect(a.id, mass.id, role, date)
                    : '';
              return `<div class="confirmation-row ${status}"><div><b>${esc(role)} · ${esc(readerName(a.readerId))}</b><small>${label}</small></div>${controls}</div>`;
            })
            .join('');
          const hasEnded = hasMassEnded(date, mass.time);
          const reportAction = hasEnded
            ? `<div class="eucharist-report-action"><button class="primary open-eucharist-report" data-mass="${mass.id}" data-date="${date}">Crear reporte de Eucaristía</button></div>`
            : '';
          return `<details class="weekly-mass"><summary class="weekly-mass-head"><div><b>${esc(mass.name)}</b><small>${esc(formatDate(date))} · ${mass.time}</small></div><span class="weekly-mass-arrow" aria-hidden="true">⌄</span></summary><div class="weekly-mass-content">${roles}<div class="weekly-reserves"><b>Suplentes:</b> ${reserves.length ? reserves.map((id, index) => `${index + 1}. ${esc(readerName(id))}`).join(' · ') : 'Sin suplentes disponibles'}</div>${reportAction}</div></details>`;
        })
        .join('')
    : '<div class="empty">No hay celebraciones programadas para esta semana.</div>';
  renderNewsCarousel();
  renderPendingReports();
}
function activeNews() {
  const now = costaRicaDateTime();
  return state.news.filter(item => item.active && item.startsAt <= now && item.expiresAt > now);
}
function renderNewsCarousel() {
  const dashboard = $('#dashboard');
  if (!dashboard) return;
  if (newsCarouselTimer) {
    clearInterval(newsCarouselTimer);
    newsCarouselTimer = null;
  }
  let panel = $('#newsCarousel');
  const items = activeNews();
  if (!items.length) {
    panel?.remove();
    newsCarouselIndex = 0;
    return;
  }
  if (!panel) {
    panel = document.createElement('section');
    panel.id = 'newsCarousel';
    panel.className = 'news-carousel';
    dashboard.querySelector('.hero').after(panel);
  }
  if (newsCarouselIndex >= items.length) newsCarouselIndex = 0;
  const draw = () => {
    const item = items[newsCarouselIndex];
    panel.innerHTML = `<div class="news-carousel-copy"><p class="eyebrow">AVISOS DE LA COMUNIDAD</p><h3>${esc(item.title)}</h3><p>${esc(item.message)}</p><a href="${isAdmin ? '/admin/noticias.html' : '/noticias.html'}">Ver todas las noticias →</a></div>${items.length > 1 ? `<div class="news-carousel-controls"><button type="button" class="icon-btn news-previous" aria-label="Noticia anterior">‹</button><div class="news-carousel-dots" aria-label="Noticia ${newsCarouselIndex + 1} de ${items.length}">${items.map((_, index) => `<button type="button" class="${index === newsCarouselIndex ? 'active' : ''}" data-news-index="${index}" aria-label="Mostrar noticia ${index + 1}"></button>`).join('')}</div><button type="button" class="icon-btn news-next" aria-label="Noticia siguiente">›</button></div>` : ''}`;
  };
  const move = offset => {
    newsCarouselIndex = (newsCarouselIndex + offset + items.length) % items.length;
    draw();
  };
  draw();
  panel.onclick = event => {
    const dot = event.target.closest('[data-news-index]');
    if (dot) {
      newsCarouselIndex = Number(dot.dataset.newsIndex);
      draw();
      return;
    }
    if (event.target.closest('.news-previous')) move(-1);
    if (event.target.closest('.news-next')) move(1);
  };
  if (items.length > 1) {
    const start = () => {
        if (!newsCarouselTimer) newsCarouselTimer = setInterval(() => move(1), 10000);
      },
      stop = () => {
        clearInterval(newsCarouselTimer);
        newsCarouselTimer = null;
      };
    panel.onmouseenter = stop;
    panel.onmouseleave = start;
    panel.onfocusin = stop;
    panel.onfocusout = event => {
      if (!panel.contains(event.relatedTarget)) start();
    };
    start();
  }
}
function pendingReportEvents() {
  const now = Date.now(),
    cutoff = now - 7 * 24 * 60 * 60 * 1000,
    today = localDate(costaRicaToday()),
    months = new Set();
  for (let offset = 0; offset <= 7; offset++) {
    const day = new Date(today);
    day.setDate(today.getDate() - offset);
    months.add(isoDate(day).slice(0, 7));
  }
  return state.masses
    .flatMap(mass =>
      [...months].flatMap(month =>
        occurrences(mass, month).map(date => ({ mass, date, end: massEndTime(date, mass.time) })),
      ),
    )
    .filter(event => event.end <= now && event.end >= cutoff)
    .sort((a, b) => b.end - a.end);
}
function renderPendingReports() {
  let panel = $('#pendingReportsPanel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'pendingReportsPanel';
    panel.className = 'panel pending-reports-panel';
    $('#dashboard').append(panel);
  }
  const events = pendingReportEvents();
  panel.innerHTML = `<div class="panel-head"><div><p class="eyebrow">ÚLTIMOS 7 DÍAS</p><h3>Reportes pendientes</h3><p class="pending-reports-copy">Prepara el resumen de las Eucaristías que ya concluyeron.</p></div><span class="badge">${events.length}</span></div><div class="pending-report-list">${
    events.length
      ? events
          .map(({ mass, date }) => {
            const roleSummary = mass.roles
              .map(role => {
                const readerId = state.assignments.find(
                  item => item.massId === mass.id && item.role === role && item.date === date,
                )?.readerId;
                return `<span><b>${esc(role)}:</b> ${esc(readerName(readerId))}</span>`;
              })
              .join('');
            return `<article class="pending-report-card"><div><h4>${esc(mass.name)}</h4><small>${esc(formatDate(date))} · ${mass.time}</small><div class="pending-report-roles">${roleSummary}</div></div><button class="primary open-eucharist-report" data-mass="${mass.id}" data-date="${date}">Crear reporte</button></article>`;
          })
          .join('')
      : '<div class="empty pending-report-empty">No hay reportes pendientes de los últimos 7 días.</div>'
  }</div>`;
}
function assignmentReaderOptions(readers, massId, selectedId = '') {
  const groups = [
    ['Misa preferida', readers.filter(reader => readerPrefersMass(reader, massId)), 'Preferida'],
    [
      'Disponible como alternativa',
      readers.filter(reader => !readerPrefersMass(reader, massId)),
      'No preferida',
    ],
  ];
  return groups
    .filter(([, items]) => items.length)
    .map(
      ([label, items, status]) =>
        `<optgroup label="${label}">${items
          .sort((a, b) => a.name.localeCompare(b.name, 'es'))
          .map(
            reader =>
              `<option value="${reader.id}" ${reader.id === selectedId ? 'selected' : ''}>${esc(reader.name)} · ${status}</option>`,
          )
          .join('')}</optgroup>`,
    )
    .join('');
}
function adminReplacementSelect(assignmentId, massId, role, date) {
  const readers = state.readers.filter(
    reader =>
      reader.active &&
      !reader.substituteOnly &&
      readerCanServeMass(reader, massId) &&
      !state.assignments.some(a => a.massId === massId && a.date === date && a.readerId === reader.id),
  );
  return `<select class="admin-replacement admin-only" data-id="${assignmentId}" data-mass="${massId}" data-role="${esc(role)}" data-date="${date}"><option value="">Asignar lector…</option>${assignmentReaderOptions(readers, massId)}</select>`;
}
function renderReaders() {
  const filterSelect = $('#readerListFilter'),
    clearFilter = $('#clearReaderListFilter');
  // Los lectores inactivos son información administrativa: en modo público no se listan.
  const sortedReaders = state.readers
    .filter(reader => isAdmin || reader.active)
    .sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
  if (readerListFilter && !sortedReaders.some(reader => reader.id === readerListFilter))
    readerListFilter = '';
  if (filterSelect)
    filterSelect.innerHTML = `<option value="">— Todos los lectores —</option>${sortedReaders.map(reader => `<option value="${esc(reader.id)}" ${reader.id === readerListFilter ? 'selected' : ''}>${esc(reader.name)}</option>`).join('')}`;
  if (clearFilter) clearFilter.disabled = !readerListFilter;
  let summary = $('#readerStatusSummary');
  if (isAdmin && !summary) {
    summary = document.createElement('div');
    summary.id = 'readerStatusSummary';
    summary.className = 'stats admin-only';
    $('#readerList').before(summary);
  }
  if (summary) {
    const normal = state.readers.filter(r => r.active && !r.substituteOnly).length,
      substitutes = state.readers.filter(r => r.active && r.substituteOnly).length,
      inactive = state.readers.filter(r => !r.active).length;
    summary.innerHTML = `<article><span class="stat-icon green">✓</span><div><strong>${normal}</strong><small>Activos normales</small></div></article><article><span class="stat-icon gold">↻</span><div><strong>${substitutes}</strong><small>Solo suplentes</small></div></article><article><span class="stat-icon rose">—</span><div><strong>${inactive}</strong><small>Inactivos</small></div></article>`;
  }
  const visibleReaders = readerListFilter
    ? sortedReaders.filter(reader => reader.id === readerListFilter)
    : sortedReaders;
  $('#readerList').innerHTML = visibleReaders.length
    ? visibleReaders
        .map(r => {
          const preferences = readerMassPreferences(r);
          return `<article class="card"><div class="card-top"><span class="avatar">${esc(
            r.name
              .split(/\s+/)
              .map(x => x[0])
              .slice(0, 2)
              .join('')
              .toUpperCase(),
          )}</span><div><h3>${esc(r.name)}</h3><span class="badge ${r.active ? '' : 'off'}">${r.active ? 'Activo' : 'Inactivo'}</span>${r.active && r.substituteOnly ? '<span class="badge">Solo suplente</span>' : ''}${isAdmin && r.mustChangePassword ? '<span class="badge off">Cambio de contraseña pendiente</span>' : ''}</div></div>${isAdmin ? `<p>${esc(r.phone || 'Sin teléfono')}</p>` : ''}<p class="availability-copy"><b>Preferidas:</b> ${preferences.preferred.length ? preferences.preferred.map(esc).join(' · ') : 'Ninguna'}</p><p class="availability-copy"><b>También puede servir:</b> ${preferences.flexible.length ? preferences.flexible.map(esc).join(' · ') : 'Ninguna'}</p><p class="availability-copy"><b>No puede asistir:</b> ${preferences.unavailable.length ? preferences.unavailable.map(esc).join(' · ') : 'Ninguna'}</p>${r.notes ? `<p>${esc(r.notes)}</p>` : ''}<div class="reader-password-action">${r.active ? `<button class="small-btn self-edit-reader user-only" data-id="${esc(r.id)}" data-name="${esc(r.name)}">Editar mis datos</button>` : ''}<button class="small-btn change-reader-password" data-id="${esc(r.id)}" data-name="${esc(r.name)}">Cambiar contraseña</button>${isAdmin ? `<button class="small-btn reset-reader-password" data-id="${esc(r.id)}" data-name="${esc(r.name)}">Generar contraseña temporal</button>` : ''}</div><div class="card-actions"><button class="small-btn edit-reader" data-id="${esc(r.id)}">Editar</button><button class="small-btn danger delete-reader" data-id="${esc(r.id)}">Eliminar</button></div></article>`;
        })
        .join('')
    : emptyCard('No hay lectores todavía', 'Agrega la primera persona del equipo.');
}
function massSchedule(m) {
  return m.type === 'weekly' ? `${weekdays[m.weekday]} · ${m.time}` : `${formatDate(m.date)} · ${m.time}`;
}
function renderMasses() {
  $('#massList').innerHTML = state.masses.length
    ? state.masses
        .map(
          m =>
            `<article class="card"><div class="card-top"><span class="avatar">✦</span><div><h3>${esc(m.name)}</h3><span class="badge ${m.active ? '' : 'off'}">${m.type === 'weekly' ? 'Semanal' : 'Especial'}</span></div></div><p><b>${esc(massSchedule(m))}</b></p><p>${m.roles.map(esc).join(' · ')}</p><div class="card-actions"><button class="small-btn edit-mass" data-id="${m.id}">Editar</button><button class="small-btn danger delete-mass" data-id="${m.id}">Eliminar</button></div></article>`,
        )
        .join('')
    : emptyCard('No hay misas configuradas', 'Crea horarios semanales o fechas especiales.');
}
function renderAssignments() {
  const filterSelect = $('#assignmentReaderFilter'),
    massFilterSelect = $('#assignmentMassFilter'),
    clearFilter = $('#clearAssignmentReaderFilter');
  if (filterSelect) {
    if (assignmentReaderFilter && !state.readers.some(reader => reader.id === assignmentReaderFilter))
      assignmentReaderFilter = '';
    const readers = [...state.readers].sort((a, b) =>
      a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }),
    );
    filterSelect.innerHTML = `<option value="">— Todos los lectores —</option>${readers.map(reader => `<option value="${esc(reader.id)}" ${reader.id === assignmentReaderFilter ? 'selected' : ''}>${esc(reader.name)}</option>`).join('')}`;
  }
  const availableMasses = state.masses
    .filter(mass => mass.active && occurrences(mass).length)
    .sort((a, b) => `${occurrences(a)[0]}${a.time}`.localeCompare(`${occurrences(b)[0]}${b.time}`));
  if (assignmentMassFilter && !availableMasses.some(mass => mass.id === assignmentMassFilter))
    assignmentMassFilter = '';
  if (massFilterSelect)
    massFilterSelect.innerHTML = `<option value="">— Todas las misas —</option>${availableMasses.map(mass => `<option value="${esc(mass.id)}" ${mass.id === assignmentMassFilter ? 'selected' : ''}>${esc(mass.name)} · ${esc(massSchedule(mass))}</option>`).join('')}`;
  if (clearFilter) clearFilter.disabled = !assignmentReaderFilter && !assignmentMassFilter;
  const readerMassIds = assignmentReaderFilter
    ? new Set(
        state.assignments
          .filter(
            a =>
              a.month === state.month &&
              (a.readerId === assignmentReaderFilter ||
                (a.substituteIds || []).includes(assignmentReaderFilter)),
          )
          .map(a => a.massId),
      )
    : null;
  const masses = availableMasses.filter(
    mass =>
      (!assignmentMassFilter || mass.id === assignmentMassFilter) &&
      (!readerMassIds || readerMassIds.has(mass.id)),
  );
  $('#assignmentBoard').innerHTML = masses.length
    ? masses
        .map(m => {
          const titularReaders = state.readers.filter(
            r => r.active && !r.substituteOnly && readerCanServeMass(r, m.id),
          );
          const dates = occurrences(m);
          const datePlans = dates
            .map(date => {
              const dateAssignments = state.assignments.filter(a => a.massId === m.id && a.date === date);
              const reserves = dateAssignments.find(a => a.substituteIds?.length)?.substituteIds || [];
              const titularIds = new Set(dateAssignments.map(a => a.readerId).filter(Boolean));
              const monthTitularIds = new Set(
                state.assignments
                  .filter(a => a.month === state.month)
                  .map(a => a.readerId)
                  .filter(Boolean),
              );
              const substituteOptions = state.readers.filter(
                reader =>
                  reader.active &&
                  readerCanServeMass(reader, m.id) &&
                  !titularIds.has(reader.id) &&
                  !monthTitularIds.has(reader.id),
              );
              const reserveContent = isAdmin
                ? Array.from(
                    { length: Math.max(4, reserves.length) },
                    (_, index) =>
                      `<label><span>${index + 1}.</span><select class="substitute-select" data-slot="${index}"><option value="">— Sin asignar —</option>${assignmentReaderOptions(substituteOptions, m.id, reserves[index])}</select></label>`,
                  ).join('')
                : reserves.length
                  ? `<ol>${reserves.map(id => `<li>${esc(readerName(id))}</li>`).join('')}</ol>`
                  : '<span class="empty">Sin suplentes asignados.</span>';
              const roles = m.roles
                .map(role => {
                  const a = assignment(m.id, role, date);
                  return `<div class="role-row"><label>${esc(role)}</label><select class="assign-select" data-mass="${m.id}" data-role="${esc(role)}" data-date="${date}" data-reader="${a?.readerId || ''}"><option value="">— Sin asignar —</option>${assignmentReaderOptions(titularReaders, m.id, a?.readerId || '')}</select></div>`;
                })
                .join('');
              return `<section class="assignment-date"><h4>${esc(formatDate(date))}</h4>${roles}<div class="date-reserves" data-mass="${m.id}" data-date="${date}"><div><b>Suplentes de esta misa</b><small>En orden de llamada</small></div><div class="substitute-controls">${reserveContent}</div></div></section>`;
            })
            .join('');
          return `<article class="mass-assign"><div class="mass-assign-head"><div><h3>${esc(m.name)}</h3><small>${esc(massSchedule(m))} · ${dates.length} fecha(s) en ${monthLabel(state.month)}</small></div><span class="badge">${m.roles.length} funciones por misa</span></div>${datePlans}</article>`;
        })
        .join('')
    : assignmentReaderFilter
      ? emptyCard(
          'Sin misas para este lector',
          assignmentMassFilter
            ? `${readerName(assignmentReaderFilter)} no participa como titular ni suplente en ${availableMasses.find(mass => mass.id === assignmentMassFilter)?.name || 'la misa seleccionada'} durante ${monthLabel(state.month)}.`
            : `${readerName(assignmentReaderFilter)} no participa como titular ni suplente en ${monthLabel(state.month)}.`,
        )
      : emptyCard('Nada que asignar', 'Agrega una misa que ocurra durante este mes.');
}
function readerMonthPlacements(readerId) {
  const titularMassIds = [
      ...new Set(
        state.assignments
          .filter(item => item.month === state.month && item.readerId === readerId)
          .map(item => item.massId),
      ),
    ],
    substituteMassIds = [
      ...new Set(
        state.assignments
          .filter(item => item.month === state.month && (item.substituteIds || []).includes(readerId))
          .map(item => item.massId),
      ),
    ];
  const labels = [];
  titularMassIds.forEach(id =>
    labels.push(`Titular · ${state.masses.find(mass => mass.id === id)?.name || 'Misa'}`),
  );
  substituteMassIds.forEach(id =>
    labels.push(`Suplente · ${state.masses.find(mass => mass.id === id)?.name || 'Misa'}`),
  );
  return labels;
}
function renderCoverage() {
  const massSelect = $('#coverageMass'),
    content = $('#coverageContent');
  if (!massSelect || !content) return;
  const masses = state.masses
    .filter(mass => mass.active && occurrences(mass).length)
    .sort((a, b) => `${occurrences(a)[0]}${a.time}`.localeCompare(`${occurrences(b)[0]}${b.time}`));
  if (!masses.some(mass => mass.id === coverageMassId)) coverageMassId = masses[0]?.id || '';
  massSelect.innerHTML = masses
    .map(
      mass =>
        `<option value="${esc(mass.id)}" ${mass.id === coverageMassId ? 'selected' : ''}>${esc(mass.name)} · ${esc(massSchedule(mass))}</option>`,
    )
    .join('');
  const mass = masses.find(item => item.id === coverageMassId);
  if (!mass) {
    content.innerHTML = '<div class="empty">No hay misas activas durante este mes.</div>';
    return;
  }
  const monthAssignments = state.assignments.filter(item => item.month === state.month),
    massAssignments = monthAssignments.filter(item => item.massId === mass.id),
    titularIds = new Set(massAssignments.map(item => item.readerId).filter(Boolean)),
    substituteIds = new Set(massAssignments.flatMap(item => item.substituteIds || [])),
    query = coverageSearch.trim().toLocaleLowerCase('es'),
    readers = state.readers.filter(
      reader => reader.active && (!query || reader.name.toLocaleLowerCase('es').includes(query)),
    ),
    groups = [
      {
        title: 'Prefieren esta misa',
        kind: 'preferred',
        readers: readers.filter(reader => readerPrefersMass(reader, mass.id)),
      },
      {
        title: 'Pueden asistir como alternativa',
        kind: 'flexible',
        readers: readers.filter(
          reader => readerCanServeMass(reader, mass.id) && !readerPrefersMass(reader, mass.id),
        ),
      },
      {
        title: 'No pueden asistir',
        kind: 'unavailable',
        readers: readers.filter(reader => !readerCanServeMass(reader, mass.id)),
      },
    ];
  const official = reader =>
    titularIds.has(reader.id)
      ? '<span class="coverage-badge titular">Titular de esta misa</span>'
      : substituteIds.has(reader.id)
        ? '<span class="coverage-badge substitute">Suplente de esta misa</span>'
        : '';
  const card = reader => {
    const placements = readerMonthPlacements(reader.id);
    return `<article class="coverage-reader"><div><b>${esc(reader.name)}</b>${official(reader)}</div><small>${placements.length ? placements.map(esc).join(' · ') : 'Sin asignación en este mes'}</small></article>`;
  };
  content.innerHTML = `<div class="coverage-selected-summary"><div><span>Titulares de esta misa</span><b>${titularIds.size}</b></div><div><span>Suplentes oficiales</span><b>${substituteIds.size}</b></div><div><span>Lectores que la prefieren</span><b>${groups[0].readers.length}</b></div><div><span>Alternativas posibles</span><b>${groups[1].readers.length}</b></div></div><div class="coverage-groups">${groups
    .map(
      group =>
        `<section class="coverage-group ${group.kind}"><div class="coverage-group-head"><h3>${group.title}</h3><span>${group.readers.length}</span></div><div class="coverage-reader-list">${
          group.readers.length
            ? group.readers
                .sort(
                  (a, b) =>
                    Number(Boolean(official(b))) - Number(Boolean(official(a))) ||
                    a.name.localeCompare(b.name, 'es'),
                )
                .map(card)
                .join('')
            : '<p class="empty">No hay lectores en esta categoría.</p>'
        }</div></section>`,
    )
    .join('')}</div>`;
}
function renderReport() {
  const events = allEvents(),
    grouped = Object.groupBy
      ? Object.groupBy(events, x => x.date)
      : events.reduce((a, x) => ((a[x.date] ??= []).push(x), a), {});
  $('#reportContent').innerHTML =
    `<div class="report-title"><p class="eyebrow">PARROQUIA · MINISTERIO DE LECTORES</p><h2>Programación de ${monthLabel(state.month)}</h2><p>Titulares y suplentes por celebración</p></div>${
      events.length
        ? Object.entries(grouped)
            .map(
              ([date, items]) =>
                `<div class="report-date">${formatDate(date)}</div>${items
                  .map(({ mass }) => {
                    const reserves =
                      state.assignments.find(
                        a =>
                          a.massId === mass.id &&
                          a.month === state.month &&
                          a.date === date &&
                          a.substituteIds?.length,
                      )?.substituteIds || [];
                    return `<div class="report-mass"><h4>${esc(mass.name)} · ${mass.time}</h4><div class="report-roles">${mass.roles.map(role => `<div><span>${esc(role)}:</span> <b>${esc(readerName(assignment(mass.id, role, date)?.readerId))}</b></div>`).join('')}</div><div class="report-reserves"><span>Suplentes, en orden:</span> <b>${reserves.length ? reserves.map((id, index) => `${index + 1}. ${esc(readerName(id))}`).join(' · ') : 'Sin suplentes asignados'}</b></div></div>`;
                  })
                  .join('')}`,
            )
            .join('')
        : '<p class="empty">No hay celebraciones para este mes.</p>'
    }<p style="margin-top:35px;color:#718078;font-size:11px">Generado desde el planificador de lectores.</p>`;
  renderTraditionalReport();
}
