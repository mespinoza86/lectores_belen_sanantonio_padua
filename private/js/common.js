const isAdmin = document.body.dataset.mode === 'admin';
const initialView = location.pathname.endsWith('/cobertura.html') ? 'coverage' : (document.body.dataset.page || 'dashboard');
const APP_TIME_ZONE = 'America/Costa_Rica';
const MASS_DURATION_MINUTES = 60;
function costaRicaParts(date = new Date()) {
  return Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: APP_TIME_ZONE, year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hourCycle:'h23' }).formatToParts(date).filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
}
function costaRicaDateTime(date = new Date()) { const value=costaRicaParts(date); return `${value.year}-${value.month}-${value.day}T${value.hour}:${value.minute}`; }
const costaRicaToday = () => costaRicaDateTime().slice(0, 10);
const massEndTime = (date,time) => new Date(`${date}T${time}:00-06:00`).getTime() + MASS_DURATION_MINUTES * 60_000;
const hasMassEnded = (date,time) => Date.now() >= massEndTime(date,time);
const state = { readers: [], masses: [], assignments: [], news: [], month: costaRicaToday().slice(0, 7) };
let pendingConfirmation = null;
let selfEditingReader = null;
let assignmentReaderFilter = '';
let assignmentMassFilter = '';
let coverageMassId = '';
let coverageSearch = '';
let newsCarouselIndex = 0;
let newsCarouselTimer = null;
let newsRefreshTimer = null;
const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
// Las páginas administrativas conservan las mismas vistas bajo una ruta protegida.
$$('[data-page-link]').forEach(link => {
  if (isAdmin) link.href = `/admin${new URL(link.href).pathname}`;
});
const weekdays = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
const months = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const esc = value => String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const localDate = iso => { const [y,m,d] = iso.split('-').map(Number); return new Date(y,m-1,d); };
const isoDate = date => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
const monthLabel = month => { const [y,m] = month.split('-').map(Number); return `${months[m-1][0].toUpperCase()+months[m-1].slice(1)} ${y}`; };

async function request(url, options) {
  const response = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...options });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'No se pudo completar la operación');
  return data;
}
async function load() {
  try {
    if (isAdmin) {
      if (sessionStorage.getItem('admin_access_verified') !== 'yes') {
        return location.replace('/login.html');
      }
      const auth = await request('/api/auth/status');
      if (!auth.authenticated) return location.replace('/login.html');
    }
    [state.readers, state.masses, state.assignments, state.news] = await Promise.all(['/api/readers','/api/masses','/api/assignments','/api/news'].map(x => request(x)));
    render();
    if(!newsRefreshTimer)newsRefreshTimer=setInterval(async()=>{try{state.news=await request('/api/news');renderNewsCarousel()}catch{}},60_000);
  } catch (error) { toast(error.message, true); }
}
function occurrences(mass, month = state.month) {
  const [year, mon] = month.split('-').map(Number);
  if (!mass.active) return [];
  if (mass.type === 'once') return mass.date?.startsWith(month) ? [mass.date] : [];
  const result = [], last = new Date(year, mon, 0).getDate();
  for (let d=1; d<=last; d++) { const date = new Date(year, mon-1, d); if (date.getDay() === mass.weekday) result.push(isoDate(date)); }
  return result;
}
function assignment(massId, role, date) {
  return state.assignments.find(x => x.massId === massId && x.role === role && x.month === state.month && x.date === date)
    || state.assignments.find(x => x.massId === massId && x.role === role && x.month === state.month && !x.date);
}
function readerName(id) { return state.readers.find(x => x.id === id)?.name || 'Sin asignar'; }
function readerPrefersMass(reader,massId){return (Array.isArray(reader.preferredMassIds)?reader.preferredMassIds:(reader.availability||[])).includes(massId)}
function readerCanServeMass(reader,massId){return Array.isArray(reader.unavailableMassIds)||reader.preferenceModel===1?!(reader.unavailableMassIds||[]).includes(massId):(reader.availability||[]).includes(massId)}
function readerMassPreferences(reader) {
  const activeMasses=state.masses.filter(mass=>mass.active);
  return {
    preferred:activeMasses.filter(mass=>readerPrefersMass(reader,mass.id)).map(massSchedule),
    flexible:activeMasses.filter(mass=>readerCanServeMass(reader,mass.id)&&!readerPrefersMass(reader,mass.id)).map(massSchedule),
    unavailable:activeMasses.filter(mass=>!readerCanServeMass(reader,mass.id)).map(massSchedule)
  };
}
function allEvents() {
  return state.masses.flatMap(mass => occurrences(mass).map(date => ({ mass, date }))).sort((a,b) => `${a.date}${a.mass.time}`.localeCompare(`${b.date}${b.mass.time}`));
}
function currentWeekEvents() {
  const today=localDate(costaRicaToday()), monday=new Date(today);
  monday.setHours(0,0,0,0); monday.setDate(today.getDate()-((today.getDay()+6)%7));
  const sunday=new Date(monday); sunday.setDate(monday.getDate()+6);
  const months=[...new Set([isoDate(monday).slice(0,7),isoDate(sunday).slice(0,7)])];
  return state.masses.flatMap(mass=>months.flatMap(month=>occurrences(mass,month).map(date=>({mass,date}))))
    .filter(event=>localDate(event.date)>=monday&&localDate(event.date)<=sunday)
    .sort((a,b)=>`${a.date}${a.mass.time}`.localeCompare(`${b.date}${b.mass.time}`));
}
function render() {
  renderDashboard(); renderReaders(); renderMasses(); if ($('#assignmentBoard')) renderAssignments(); renderCoverage(); renderReport();
  if (!isAdmin) $$('.assign-select').forEach(select => { select.disabled = true; });
}
function renderDashboard() {
  $('#readerCount').textContent = state.readers.filter(x => x.active).length;
  $('#massCount').textContent = state.masses.filter(x => x.active).length;
  const slots = state.masses.filter(x => x.active).flatMap(x => occurrences(x).flatMap(date => x.roles.map(role => ({x,role,date}))));
  const filled = slots.filter(({x,role,date}) => assignment(x.id, role, date)).length;
  $('#assignedCount').textContent = `${slots.length ? Math.round(filled/slots.length*100) : 0}%`;
  $('#heroCopy').textContent = `Prepara y comparte la planificación de ${monthLabel(state.month).toLowerCase()}.`;
  const events = currentWeekEvents();
  $('#upcoming').innerHTML = events.length ? events.map(({mass,date}) => {
    const reserves=state.assignments.find(a=>a.massId===mass.id&&a.date===date&&a.substituteIds?.length)?.substituteIds||[];
    const roles=mass.roles.map(role=>{
      const a=state.assignments.find(item=>item.massId===mass.id&&item.role===role&&item.date===date);
      if(!a)return `<div class="confirmation-row needs"><div><b>${esc(role)}</b><small>Suplente por definir</small></div>${isAdmin?adminReplacementSelect('',mass.id,role,date):''}</div>`;
      const status=a.confirmationStatus||'pending';
      const label=status==='confirmed'?'Confirmado':status==='needs_replacement'?'Suplente por definir':'Sin confirmar';
      const hasStarted=`${date}T${mass.time}`<=costaRicaDateTime();
      const controls=hasStarted?'<small>Misa finalizada</small>':status==='pending'&&a.readerId?`<div class="confirmation-actions"><button class="small-btn confirm-reader" data-id="${a.id}">Confirmar</button><button class="small-btn danger decline-reader" data-id="${a.id}">No puedo asistir</button></div>`:status==='needs_replacement'&&isAdmin?adminReplacementSelect(a.id,mass.id,role,date):'';
      return `<div class="confirmation-row ${status}"><div><b>${esc(role)} · ${esc(readerName(a.readerId))}</b><small>${label}</small></div>${controls}</div>`;
    }).join('');
    const hasEnded=hasMassEnded(date,mass.time);
    const reportAction=hasEnded?`<div class="eucharist-report-action"><button class="primary open-eucharist-report" data-mass="${mass.id}" data-date="${date}">Crear reporte de Eucaristía</button></div>`:'';
    return `<details class="weekly-mass"><summary class="weekly-mass-head"><div><b>${esc(mass.name)}</b><small>${esc(formatDate(date))} · ${mass.time}</small></div><span class="weekly-mass-arrow" aria-hidden="true">⌄</span></summary><div class="weekly-mass-content">${roles}<div class="weekly-reserves"><b>Suplentes:</b> ${reserves.length?reserves.map((id,index)=>`${index+1}. ${esc(readerName(id))}`).join(' · '):'Sin suplentes disponibles'}</div>${reportAction}</div></details>`;
  }).join('') : '<div class="empty">No hay celebraciones programadas para esta semana.</div>';
  renderNewsCarousel();
  renderPendingReports();
}
function activeNews(){const now=costaRicaDateTime();return state.news.filter(item=>item.active&&item.startsAt<=now&&item.expiresAt>now)}
function renderNewsCarousel(){
  const dashboard=$('#dashboard');if(!dashboard)return;
  if(newsCarouselTimer){clearInterval(newsCarouselTimer);newsCarouselTimer=null}
  let panel=$('#newsCarousel');const items=activeNews();
  if(!items.length){panel?.remove();newsCarouselIndex=0;return}
  if(!panel){panel=document.createElement('section');panel.id='newsCarousel';panel.className='news-carousel';dashboard.querySelector('.hero').after(panel)}
  if(newsCarouselIndex>=items.length)newsCarouselIndex=0;
  const draw=()=>{const item=items[newsCarouselIndex];panel.innerHTML=`<div class="news-carousel-copy"><p class="eyebrow">AVISOS DE LA COMUNIDAD</p><h3>${esc(item.title)}</h3><p>${esc(item.message)}</p><a href="${isAdmin?'/admin/noticias.html':'/noticias.html'}">Ver todas las noticias →</a></div>${items.length>1?`<div class="news-carousel-controls"><button type="button" class="icon-btn news-previous" aria-label="Noticia anterior">‹</button><div class="news-carousel-dots" aria-label="Noticia ${newsCarouselIndex+1} de ${items.length}">${items.map((_,index)=>`<button type="button" class="${index===newsCarouselIndex?'active':''}" data-news-index="${index}" aria-label="Mostrar noticia ${index+1}"></button>`).join('')}</div><button type="button" class="icon-btn news-next" aria-label="Noticia siguiente">›</button></div>`:''}`};
  const move=offset=>{newsCarouselIndex=(newsCarouselIndex+offset+items.length)%items.length;draw()};
  draw();
  panel.onclick=event=>{const dot=event.target.closest('[data-news-index]');if(dot){newsCarouselIndex=Number(dot.dataset.newsIndex);draw();return}if(event.target.closest('.news-previous'))move(-1);if(event.target.closest('.news-next'))move(1)};
  if(items.length>1){const start=()=>{if(!newsCarouselTimer)newsCarouselTimer=setInterval(()=>move(1),10000)},stop=()=>{clearInterval(newsCarouselTimer);newsCarouselTimer=null};panel.onmouseenter=stop;panel.onmouseleave=start;panel.onfocusin=stop;panel.onfocusout=event=>{if(!panel.contains(event.relatedTarget))start()};start()}
}
function pendingReportEvents(){const now=Date.now(),cutoff=now-7*24*60*60*1000,today=localDate(costaRicaToday()),months=new Set();for(let offset=0;offset<=7;offset++){const day=new Date(today);day.setDate(today.getDate()-offset);months.add(isoDate(day).slice(0,7))}return state.masses.flatMap(mass=>[...months].flatMap(month=>occurrences(mass,month).map(date=>({mass,date,end:massEndTime(date,mass.time)})))).filter(event=>event.end<=now&&event.end>=cutoff).sort((a,b)=>b.end-a.end)}
function renderPendingReports(){let panel=$('#pendingReportsPanel');if(!panel){panel=document.createElement('div');panel.id='pendingReportsPanel';panel.className='panel pending-reports-panel';$('#dashboard').append(panel)}const events=pendingReportEvents();panel.innerHTML=`<div class="panel-head"><div><p class="eyebrow">ÚLTIMOS 7 DÍAS</p><h3>Reportes pendientes</h3><p class="pending-reports-copy">Prepara el resumen de las Eucaristías que ya concluyeron.</p></div><span class="badge">${events.length}</span></div><div class="pending-report-list">${events.length?events.map(({mass,date})=>{const roleSummary=mass.roles.map(role=>{const readerId=state.assignments.find(item=>item.massId===mass.id&&item.role===role&&item.date===date)?.readerId;return `<span><b>${esc(role)}:</b> ${esc(readerName(readerId))}</span>`}).join('');return `<article class="pending-report-card"><div><h4>${esc(mass.name)}</h4><small>${esc(formatDate(date))} · ${mass.time}</small><div class="pending-report-roles">${roleSummary}</div></div><button class="primary open-eucharist-report" data-mass="${mass.id}" data-date="${date}">Crear reporte</button></article>`}).join(''):'<div class="empty pending-report-empty">No hay reportes pendientes de los últimos 7 días.</div>'}</div>`}
function assignmentReaderOptions(readers,massId,selectedId=''){
  const groups=[
    ['Misa preferida',readers.filter(reader=>readerPrefersMass(reader,massId)),'Preferida'],
    ['Disponible como alternativa',readers.filter(reader=>!readerPrefersMass(reader,massId)),'No preferida']
  ];
  return groups.filter(([,items])=>items.length).map(([label,items,status])=>`<optgroup label="${label}">${items.sort((a,b)=>a.name.localeCompare(b.name,'es')).map(reader=>`<option value="${reader.id}" ${reader.id===selectedId?'selected':''}>${esc(reader.name)} · ${status}</option>`).join('')}</optgroup>`).join('');
}
function adminReplacementSelect(assignmentId,massId,role,date){const readers=state.readers.filter(reader=>reader.active&&!reader.substituteOnly&&readerCanServeMass(reader,massId)&&!state.assignments.some(a=>a.massId===massId&&a.date===date&&a.readerId===reader.id));return `<select class="admin-replacement admin-only" data-id="${assignmentId}" data-mass="${massId}" data-role="${esc(role)}" data-date="${date}"><option value="">Asignar lector…</option>${assignmentReaderOptions(readers,massId)}</select>`}
function renderReaders() {
  let summary=$('#readerStatusSummary');
  if(isAdmin&&!summary){summary=document.createElement('div');summary.id='readerStatusSummary';summary.className='stats admin-only';$('#readerList').before(summary)}
  if(summary){const normal=state.readers.filter(r=>r.active&&!r.substituteOnly).length,substitutes=state.readers.filter(r=>r.active&&r.substituteOnly).length,inactive=state.readers.filter(r=>!r.active).length;summary.innerHTML=`<article><span class="stat-icon green">✓</span><div><strong>${normal}</strong><small>Activos normales</small></div></article><article><span class="stat-icon gold">↻</span><div><strong>${substitutes}</strong><small>Solo suplentes</small></div></article><article><span class="stat-icon rose">—</span><div><strong>${inactive}</strong><small>Inactivos</small></div></article>`}
  $('#readerList').innerHTML = state.readers.length ? state.readers.map(r => { const preferences=readerMassPreferences(r); return `<article class="card"><div class="card-top"><span class="avatar">${esc(r.name.split(/\s+/).map(x=>x[0]).slice(0,2).join('').toUpperCase())}</span><div><h3>${esc(r.name)}</h3><span class="badge ${r.active?'':'off'}">${r.active?'Activo':'Inactivo'}</span>${r.active&&r.substituteOnly?'<span class="badge">Solo suplente</span>':''}${isAdmin&&r.mustChangePassword?'<span class="badge off">Cambio de contraseña pendiente</span>':''}</div></div>${isAdmin?`<p>${esc(r.phone || 'Sin teléfono')}</p>`:''}<p class="availability-copy"><b>Preferidas:</b> ${preferences.preferred.length?preferences.preferred.map(esc).join(' · '):'Ninguna'}</p><p class="availability-copy"><b>También puede servir:</b> ${preferences.flexible.length?preferences.flexible.map(esc).join(' · '):'Ninguna'}</p><p class="availability-copy"><b>No puede asistir:</b> ${preferences.unavailable.length?preferences.unavailable.map(esc).join(' · '):'Ninguna'}</p>${r.notes?`<p>${esc(r.notes)}</p>`:''}<div class="reader-password-action">${r.active?`<button class="small-btn self-edit-reader user-only" data-id="${esc(r.id)}" data-name="${esc(r.name)}">Editar mis datos</button>`:''}<button class="small-btn change-reader-password" data-id="${esc(r.id)}" data-name="${esc(r.name)}">Cambiar contraseña</button>${isAdmin?`<button class="small-btn reset-reader-password" data-id="${esc(r.id)}" data-name="${esc(r.name)}">Generar contraseña temporal</button>`:''}</div><div class="card-actions"><button class="small-btn edit-reader" data-id="${esc(r.id)}">Editar</button><button class="small-btn danger delete-reader" data-id="${esc(r.id)}">Eliminar</button></div></article>`; }).join('') : emptyCard('No hay lectores todavía','Agrega la primera persona del equipo.');
}
function massSchedule(m) { return m.type === 'weekly' ? `${weekdays[m.weekday]} · ${m.time}` : `${formatDate(m.date)} · ${m.time}`; }
function renderMasses() {
  $('#massList').innerHTML = state.masses.length ? state.masses.map(m => `<article class="card"><div class="card-top"><span class="avatar">✦</span><div><h3>${esc(m.name)}</h3><span class="badge ${m.active?'':'off'}">${m.type==='weekly'?'Semanal':'Especial'}</span></div></div><p><b>${esc(massSchedule(m))}</b></p><p>${m.roles.map(esc).join(' · ')}</p><div class="card-actions"><button class="small-btn edit-mass" data-id="${m.id}">Editar</button><button class="small-btn danger delete-mass" data-id="${m.id}">Eliminar</button></div></article>`).join('') : emptyCard('No hay misas configuradas','Crea horarios semanales o fechas especiales.');
}
function renderAssignments() {
  const filterSelect=$('#assignmentReaderFilter'),massFilterSelect=$('#assignmentMassFilter'),clearFilter=$('#clearAssignmentReaderFilter');
  if(filterSelect){
    if(assignmentReaderFilter&&!state.readers.some(reader=>reader.id===assignmentReaderFilter))assignmentReaderFilter='';
    const readers=[...state.readers].sort((a,b)=>a.name.localeCompare(b.name,'es',{sensitivity:'base'}));
    filterSelect.innerHTML=`<option value="">— Todos los lectores —</option>${readers.map(reader=>`<option value="${esc(reader.id)}" ${reader.id===assignmentReaderFilter?'selected':''}>${esc(reader.name)}</option>`).join('')}`;
  }
  const availableMasses=state.masses.filter(mass=>mass.active&&occurrences(mass).length).sort((a,b)=>`${occurrences(a)[0]}${a.time}`.localeCompare(`${occurrences(b)[0]}${b.time}`));
  if(assignmentMassFilter&&!availableMasses.some(mass=>mass.id===assignmentMassFilter))assignmentMassFilter='';
  if(massFilterSelect)massFilterSelect.innerHTML=`<option value="">— Todas las misas —</option>${availableMasses.map(mass=>`<option value="${esc(mass.id)}" ${mass.id===assignmentMassFilter?'selected':''}>${esc(mass.name)} · ${esc(massSchedule(mass))}</option>`).join('')}`;
  if(clearFilter)clearFilter.disabled=!assignmentReaderFilter&&!assignmentMassFilter;
  const readerMassIds=assignmentReaderFilter?new Set(state.assignments.filter(a=>a.month===state.month&&(a.readerId===assignmentReaderFilter||(a.substituteIds||[]).includes(assignmentReaderFilter))).map(a=>a.massId)):null;
  const masses = availableMasses.filter(mass=>(!assignmentMassFilter||mass.id===assignmentMassFilter)&&(!readerMassIds||readerMassIds.has(mass.id)));
  $('#assignmentBoard').innerHTML = masses.length ? masses.map(m => {
    const titularReaders=state.readers.filter(r=>r.active&&!r.substituteOnly&&readerCanServeMass(r,m.id));
    const dates=occurrences(m);
    const datePlans=dates.map(date=>{
      const dateAssignments=state.assignments.filter(a=>a.massId===m.id&&a.date===date);
      const reserves=dateAssignments.find(a=>a.substituteIds?.length)?.substituteIds||[];
      const titularIds=new Set(dateAssignments.map(a=>a.readerId).filter(Boolean));
      const monthTitularIds=new Set(state.assignments.filter(a=>a.month===state.month).map(a=>a.readerId).filter(Boolean));
      const substituteOptions=state.readers.filter(reader => reader.active && readerCanServeMass(reader,m.id) &&
        !titularIds.has(reader.id) && !monthTitularIds.has(reader.id));
      const reserveContent=isAdmin
        ? Array.from({length:Math.max(4,reserves.length)},(_,index)=>`<label><span>${index+1}.</span><select class="substitute-select" data-slot="${index}"><option value="">— Sin asignar —</option>${assignmentReaderOptions(substituteOptions,m.id,reserves[index])}</select></label>`).join('')
        : reserves.length?`<ol>${reserves.map(id=>`<li>${esc(readerName(id))}</li>`).join('')}</ol>`:'<span class="empty">Sin suplentes asignados.</span>';
      const roles=m.roles.map(role => { const a=assignment(m.id,role,date); return `<div class="role-row"><label>${esc(role)}</label><select class="assign-select" data-mass="${m.id}" data-role="${esc(role)}" data-date="${date}" data-reader="${a?.readerId||''}"><option value="">— Sin asignar —</option>${assignmentReaderOptions(titularReaders,m.id,a?.readerId||'')}</select></div>`; }).join('');
      return `<section class="assignment-date"><h4>${esc(formatDate(date))}</h4>${roles}<div class="date-reserves" data-mass="${m.id}" data-date="${date}"><div><b>Suplentes de esta misa</b><small>En orden de llamada</small></div><div class="substitute-controls">${reserveContent}</div></div></section>`;
    }).join('');
    return `<article class="mass-assign"><div class="mass-assign-head"><div><h3>${esc(m.name)}</h3><small>${esc(massSchedule(m))} · ${dates.length} fecha(s) en ${monthLabel(state.month)}</small></div><span class="badge">${m.roles.length} funciones por misa</span></div>${datePlans}</article>`;
  }).join('') : assignmentReaderFilter
    ? emptyCard('Sin misas para este lector',assignmentMassFilter
      ? `${readerName(assignmentReaderFilter)} no participa como titular ni suplente en ${availableMasses.find(mass=>mass.id===assignmentMassFilter)?.name||'la misa seleccionada'} durante ${monthLabel(state.month)}.`
      : `${readerName(assignmentReaderFilter)} no participa como titular ni suplente en ${monthLabel(state.month)}.`)
    : emptyCard('Nada que asignar','Agrega una misa que ocurra durante este mes.');
}
function readerMonthPlacements(readerId){const titularMassIds=[...new Set(state.assignments.filter(item=>item.month===state.month&&item.readerId===readerId).map(item=>item.massId))],substituteMassIds=[...new Set(state.assignments.filter(item=>item.month===state.month&&(item.substituteIds||[]).includes(readerId)).map(item=>item.massId))];const labels=[];titularMassIds.forEach(id=>labels.push(`Titular · ${state.masses.find(mass=>mass.id===id)?.name||'Misa'}`));substituteMassIds.forEach(id=>labels.push(`Suplente · ${state.masses.find(mass=>mass.id===id)?.name||'Misa'}`));return labels}
function renderCoverage(){const massSelect=$('#coverageMass'),content=$('#coverageContent');if(!massSelect||!content)return;const masses=state.masses.filter(mass=>mass.active&&occurrences(mass).length).sort((a,b)=>`${occurrences(a)[0]}${a.time}`.localeCompare(`${occurrences(b)[0]}${b.time}`));if(!masses.some(mass=>mass.id===coverageMassId))coverageMassId=masses[0]?.id||'';massSelect.innerHTML=masses.map(mass=>`<option value="${esc(mass.id)}" ${mass.id===coverageMassId?'selected':''}>${esc(mass.name)} · ${esc(massSchedule(mass))}</option>`).join('');const mass=masses.find(item=>item.id===coverageMassId);if(!mass){content.innerHTML='<div class="empty">No hay misas activas durante este mes.</div>';return}const monthAssignments=state.assignments.filter(item=>item.month===state.month),massAssignments=monthAssignments.filter(item=>item.massId===mass.id),titularIds=new Set(massAssignments.map(item=>item.readerId).filter(Boolean)),substituteIds=new Set(massAssignments.flatMap(item=>item.substituteIds||[])),query=coverageSearch.trim().toLocaleLowerCase('es'),readers=state.readers.filter(reader=>reader.active&&(!query||reader.name.toLocaleLowerCase('es').includes(query))),groups=[{title:'Prefieren esta misa',kind:'preferred',readers:readers.filter(reader=>readerPrefersMass(reader,mass.id))},{title:'Pueden asistir como alternativa',kind:'flexible',readers:readers.filter(reader=>readerCanServeMass(reader,mass.id)&&!readerPrefersMass(reader,mass.id))},{title:'No pueden asistir',kind:'unavailable',readers:readers.filter(reader=>!readerCanServeMass(reader,mass.id))}];const official=(reader)=>titularIds.has(reader.id)?'<span class="coverage-badge titular">Titular de esta misa</span>':substituteIds.has(reader.id)?'<span class="coverage-badge substitute">Suplente de esta misa</span>':'';const card=reader=>{const placements=readerMonthPlacements(reader.id);return `<article class="coverage-reader"><div><b>${esc(reader.name)}</b>${official(reader)}</div><small>${placements.length?placements.map(esc).join(' · '):'Sin asignación en este mes'}</small></article>`};content.innerHTML=`<div class="coverage-selected-summary"><div><span>Titulares de esta misa</span><b>${titularIds.size}</b></div><div><span>Suplentes oficiales</span><b>${substituteIds.size}</b></div><div><span>Lectores que la prefieren</span><b>${groups[0].readers.length}</b></div><div><span>Alternativas posibles</span><b>${groups[1].readers.length}</b></div></div><div class="coverage-groups">${groups.map(group=>`<section class="coverage-group ${group.kind}"><div class="coverage-group-head"><h3>${group.title}</h3><span>${group.readers.length}</span></div><div class="coverage-reader-list">${group.readers.length?group.readers.sort((a,b)=>Number(Boolean(official(b)))-Number(Boolean(official(a)))||a.name.localeCompare(b.name,'es')).map(card).join(''):'<p class="empty">No hay lectores en esta categoría.</p>'}</div></section>`).join('')}</div>`}
function renderReport() {
  const events=allEvents(), grouped=Object.groupBy ? Object.groupBy(events,x=>x.date) : events.reduce((a,x)=>((a[x.date]??=[]).push(x),a),{});
  $('#reportContent').innerHTML=`<div class="report-title"><p class="eyebrow">PARROQUIA · MINISTERIO DE LECTORES</p><h2>Programación de ${monthLabel(state.month)}</h2><p>Titulares y suplentes por celebración</p></div>${events.length?Object.entries(grouped).map(([date,items])=>`<div class="report-date">${formatDate(date)}</div>${items.map(({mass})=>{const reserves=state.assignments.find(a=>a.massId===mass.id&&a.month===state.month&&a.date===date&&a.substituteIds?.length)?.substituteIds||[];return `<div class="report-mass"><h4>${esc(mass.name)} · ${mass.time}</h4><div class="report-roles">${mass.roles.map(role=>`<div><span>${esc(role)}:</span> <b>${esc(readerName(assignment(mass.id,role,date)?.readerId))}</b></div>`).join('')}</div><div class="report-reserves"><span>Suplentes, en orden:</span> <b>${reserves.length?reserves.map((id,index)=>`${index+1}. ${esc(readerName(id))}`).join(' · '):'Sin suplentes asignados'}</b></div></div>`;}).join('')}`).join(''):'<p class="empty">No hay celebraciones para este mes.</p>'}<p style="margin-top:35px;color:#718078;font-size:11px">Generado desde el planificador de lectores.</p>`;
  renderTraditionalReport();
}
function traditionalRoleLabel(role){const value=role.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();return value.includes('primera')?'Primera':value.includes('segunda')?'Segunda':value.includes('salmo')?'Salmo':value.includes('monici')||value.includes('monitor')?'Monitor':role}
function traditionalReportData(){return state.masses.filter(mass=>mass.active&&occurrences(mass).length).sort((a,b)=>`${occurrences(a)[0]}${a.time}`.localeCompare(`${occurrences(b)[0]}${b.time}`)).map(mass=>{const dates=occurrences(mass),items=state.assignments.filter(item=>item.month===state.month&&item.massId===mass.id&&dates.includes(item.date)),readerIds=[...new Set(items.map(item=>item.readerId).filter(Boolean))].slice(0,4);while(readerIds.length<4)readerIds.push('');const reserves=items.find(item=>item.substituteIds?.length)?.substituteIds||[];return {mass,dates,readerIds,columns:readerIds.map(readerId=>({readerId,name:readerId?readerName(readerId):'Sin asignar',rows:dates.map(date=>{const item=items.find(value=>value.date===date&&value.readerId===readerId);return {date,label:item?traditionalRoleLabel(item.role):'—'}})})),reserves:Array.from({length:4},(_,index)=>reserves[index]?readerName(reserves[index]):'Sin asignar')}})}
function traditionalMassTitle(mass){const day=mass.type==='weekly'?weekdays[mass.weekday]:formatDate(mass.date);const [hour,minute]=mass.time.split(':').map(Number),suffix=hour>=12?'PM':'AM',displayHour=hour%12||12;return `${day.toUpperCase()} ${displayHour}:${String(minute).padStart(2,'0')} ${suffix} - ${monthLabel(state.month).toUpperCase()}`}
function renderTraditionalReport(){const target=$('#traditionalReport');if(!target)return;const data=traditionalReportData();target.innerHTML=data.length?data.map(({mass,columns,reserves})=>`<section class="traditional-mass"><h3>${esc(traditionalMassTitle(mass))}</h3><div class="traditional-columns">${columns.map(column=>`<div class="traditional-column"><h4>${esc(column.name)}</h4>${column.rows.map(row=>`<div><span>${esc(`${localDate(row.date).getDate()} ${months[localDate(row.date).getMonth()]}`)}</span><b>${esc(row.label)}</b></div>`).join('')}</div>`).join('')}</div><div class="traditional-reserves"><b>Suplentes:</b>${reserves.map((name,index)=>`<span>${index+1}. ${esc(name)}</span>`).join('')}</div></section>`).join(''):'<p class="empty">No hay celebraciones para este mes.</p>'}
function drawFittedText(ctx,text,x,y,maxWidth,fontSize=22){let size=fontSize;do{ctx.font=`700 ${size}px Arial`;if(ctx.measureText(text).width<=maxWidth)break;size--}while(size>12);ctx.fillText(text,x,y)}
function createTraditionalCanvas(){const data=traditionalReportData();if(!data.length)return null;const width=1600,margin=2,headerH=54,nameH=42,rowH=38,reserveH=66,gap=18,sectionH=headerH+nameH+Math.max(...data.flatMap(item=>item.columns.map(column=>column.rows.length)))*rowH+reserveH,height=margin*2+data.length*sectionH+(data.length-1)*gap,canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,width,height);ctx.textBaseline='middle';let top=margin;for(const item of data){const rows=item.columns[0]?.rows.length||0,colW=(width-margin*2)/4;ctx.fillStyle='#3f66a3';ctx.fillRect(margin,top,width-margin*2,headerH);ctx.fillStyle='#fff';ctx.textAlign='center';drawFittedText(ctx,traditionalMassTitle(item.mass),width/2,top+headerH/2,width-40,30);top+=headerH;item.columns.forEach((column,index)=>{const x=margin+index*colW;ctx.fillStyle='#5d9bd3';ctx.fillRect(x,top,colW,nameH);ctx.strokeStyle='#1d2733';ctx.strokeRect(x,top,colW,nameH);ctx.fillStyle='#fff';drawFittedText(ctx,column.name,x+colW/2,top+nameH/2,colW-16,20);column.rows.forEach((row,rowIndex)=>{const y=top+nameH+rowIndex*rowH;ctx.fillStyle=rowIndex%2?'#fff':'#d9e3f3';ctx.fillRect(x,y,colW,rowH);ctx.strokeStyle='#68717b';ctx.strokeRect(x,y,colW,rowH);ctx.fillStyle='#111';ctx.textAlign='left';ctx.font='18px Arial';ctx.fillText(`${localDate(row.date).getDate()} ${months[localDate(row.date).getMonth()]}`,x+8,y+rowH/2);ctx.textAlign='right';ctx.font='19px Arial';ctx.fillText(row.label,x+colW-8,y+rowH/2)})});top+=nameH+rows*rowH;ctx.fillStyle='#eef2f8';ctx.fillRect(margin,top,width-margin*2,reserveH);ctx.strokeStyle='#1d2733';ctx.strokeRect(margin,top,width-margin*2,reserveH);ctx.fillStyle='#111';ctx.textAlign='left';ctx.font='700 19px Arial';ctx.fillText('Suplentes:',margin+12,top+reserveH/2);const reserveStart=margin+125,reserveW=(width-reserveStart-margin)/4;item.reserves.forEach((name,index)=>{ctx.textAlign='center';drawFittedText(ctx,`${index+1}. ${name}`,reserveStart+index*reserveW+reserveW/2,top+reserveH/2,reserveW-12,17)});top+=reserveH+gap}return canvas}
function downloadTraditionalImage(){const canvas=createTraditionalCanvas();if(!canvas)return toast('No hay celebraciones para exportar',true);canvas.toBlob(blob=>{if(!blob)return toast('No se pudo crear la imagen',true);const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=`lectores-formato-tradicional-${state.month}.png`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)},'image/png')}
function printTraditionalImage(){const canvas=createTraditionalCanvas();if(!canvas)return toast('No hay celebraciones para exportar',true);let target=$('#traditionalPrintImage');if(!target){target=document.createElement('div');target.id='traditionalPrintImage';document.body.append(target)}target.innerHTML='';const image=document.createElement('img');image.alt=`Programación tradicional de ${monthLabel(state.month)}`;target.append(image);document.body.classList.add('print-traditional-image');let opened=false;const openPrint=()=>{if(opened)return;opened=true;window.addEventListener('afterprint',()=>{document.body.classList.remove('print-traditional-image');target.remove()},{once:true});window.print()};image.onload=openPrint;image.src=canvas.toDataURL('image/png');if(image.complete)setTimeout(openPrint,0)}
function emptyCard(title, copy) { return `<article class="card"><h3>${title}</h3><p>${copy}</p></article>`; }
function formatDate(iso) { if(!iso)return ''; return localDate(iso).toLocaleDateString('es-CR',{weekday:'long',day:'numeric',month:'long',year:'numeric'}).replace(/^./,x=>x.toUpperCase()); }
function toast(message,error=false){const t=$('#toast');t.textContent=message;t.style.background=error?'#8c4545':'';t.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>t.classList.remove('show'),2800)}
function showTemporaryPassword(readerNameValue,password){
  let dialog=$('#temporaryPasswordDialog');
  if(!dialog){
    dialog=document.createElement('dialog');
    dialog.id='temporaryPasswordDialog';
    dialog.innerHTML='<form method="dialog"><div class="dialog-head"><div><p class="eyebrow">CREDENCIAL TEMPORAL</p><h3>Contraseña creada</h3></div><button class="icon-btn close" type="button">×</button></div><p id="temporaryPasswordReader"></p><label>Contraseña temporal<input id="temporaryPasswordValue" readonly></label><p class="hint">Cópiala ahora y entrégala de forma privada. No podrá volver a consultarse y el lector deberá cambiarla antes de confirmar una asignación.</p><div class="actions"><button class="secondary" id="copyTemporaryPassword" type="button">Copiar</button><button class="primary" value="close">Entendido</button></div></form>';
    document.body.append(dialog);
  }
  $('#temporaryPasswordReader').textContent=readerNameValue;
  $('#temporaryPasswordValue').value=password;
  dialog.showModal();
}
function openSelfEditAccess(id,name){
  let dialog=$('#selfEditAccessDialog');
  if(!dialog){
    dialog=document.createElement('dialog');
    dialog.id='selfEditAccessDialog';
    dialog.innerHTML='<form id="selfEditAccessForm"><div class="dialog-head"><div><p class="eyebrow">SEGURIDAD</p><h3>Editar mis datos</h3><span id="selfEditReaderName" class="hint"></span></div><button type="button" class="icon-btn close">×</button></div><input type="hidden" name="id"><label>Contraseña del lector<input type="password" name="password" autocomplete="current-password" required></label><div class="actions"><button type="button" class="secondary close">Cancelar</button><button class="primary">Continuar</button></div></form>';
    document.body.append(dialog);
    $('#selfEditAccessForm').addEventListener('submit',async event=>{
      event.preventDefault();
      const form=event.currentTarget,idValue=form.elements.id.value,password=form.elements.password.value;
      try{
        const reader=await request(`/api/readers/${idValue}/profile`,{method:'POST',body:JSON.stringify({password})});
        selfEditingReader={id:idValue,password};
        dialog.close();
        form.reset();
        openReader(reader,true);
      }catch(error){toast(error.message,true);form.elements.password.select()}
    });
  }
  const form=$('#selfEditAccessForm');form.reset();form.elements.id.value=id;$('#selfEditReaderName').textContent=name;dialog.showModal();form.elements.password.focus();
}
function showView(id){$$('.view').forEach(x=>x.classList.toggle('active',x.id===id));$$('.nav').forEach(x=>x.classList.toggle('active',x.dataset.view===id));$('#pageTitle').textContent={dashboard:'Buenos días',readers:'Lectores',masses:'Misas',assign:'Asignaciones',coverage:'Cobertura por misa',report:'Reporte mensual'}[id];$('.sidebar').classList.remove('open');window.scrollTo(0,0)}

document.addEventListener('click', async e => {
  const go=e.target.closest('[data-view]'); if(go){showView(go.dataset.view);return}
  const confirmation=e.target.closest('.confirm-reader,.decline-reader');
  if(confirmation){pendingConfirmation={id:confirmation.dataset.id,action:confirmation.classList.contains('confirm-reader')?'confirm':'decline'};const isConfirm=pendingConfirmation.action==='confirm';$('#confirmationActionTitle').textContent=isConfirm?'¿Está seguro de que desea confirmar la misa?':'¿Está seguro de que no podrá asistir?';$('#confirmationActionCopy').textContent=isConfirm?'Se registrará su asistencia a esta misa.':'Se retirará su asignación y se intentará llamar al siguiente suplente.';$('#confirmationActionDialog').showModal();return}
  if(e.target.closest('#menuBtn')) $('.sidebar').classList.toggle('open');
  const reportButton=e.target.closest('.open-eucharist-report');
  if(reportButton){openEucharistReport(reportButton.dataset.mass,reportButton.dataset.date);return}
  const passwordButton=e.target.closest('.change-reader-password');
  if(passwordButton){const form=$('#readerPasswordForm');form.reset();form.elements.id.value=passwordButton.dataset.id;$('#readerPasswordName').textContent=passwordButton.dataset.name;$('#readerPasswordDialog').showModal();return}
  const selfEditButton=e.target.closest('.self-edit-reader');
  if(selfEditButton){openSelfEditAccess(selfEditButton.dataset.id,selfEditButton.dataset.name);return}
  const resetPasswordButton=e.target.closest('.reset-reader-password');
  if(resetPasswordButton){if(!confirm(`¿Invalidar la contraseña actual de ${resetPasswordButton.dataset.name} y generar una temporal nueva?`))return;try{const result=await request(`/api/readers/${resetPasswordButton.dataset.id}/reset-password`,{method:'POST',body:'{}'});showTemporaryPassword(resetPasswordButton.dataset.name,result.temporaryPassword);await load()}catch(error){toast(error.message,true)}return}
  if(e.target.closest('#copyTemporaryPassword')){const input=$('#temporaryPasswordValue');try{await navigator.clipboard.writeText(input.value);toast('Contraseña copiada')}catch{input.select();toast('Seleccionada para copiar')}return}
  if (e.target.closest('#logoutBtn')) {
    sessionStorage.removeItem('admin_access_verified');
    await request('/api/auth/logout', { method: 'POST' });
    return location.replace('/');
  }
  if (!isAdmin && e.target.closest('#newReader,#newMass,#randomAssign,#fillUnassigned,.edit-reader,.edit-mass,.delete-reader,.delete-mass,.reset-reader-password')) return;
  if(e.target.closest('#newReader')) openReader();
  if(e.target.closest('#newMass')) openMass();
  if(e.target.closest('#randomAssign')) {
    if(!confirm(`¿Reemplazar las asignaciones de ${monthLabel(state.month)} y generar titulares y suplentes según disponibilidad?`)) return;
    const button=e.target.closest('#randomAssign'),label=button.textContent;button.disabled=true;button.textContent='Generando…';
    try{await request('/api/random-assignments',{method:'POST',body:JSON.stringify({month:state.month})});toast('Titulares y suplentes generados');await load()}catch(x){toast(x.message,true)}finally{button.disabled=false;button.textContent=label}
  }
  if(e.target.closest('#fillUnassigned')) {
    if(!confirm(`¿Completar únicamente las funciones sin asignar de ${monthLabel(state.month)}? Las asignaciones actuales se conservarán.`)) return;
    const button=e.target.closest('#fillUnassigned'),label=button.textContent;button.disabled=true;button.textContent='Completando…';
    try{const result=await request('/api/fill-unassigned',{method:'POST',body:JSON.stringify({month:state.month})});const detail=result.remaining?` Quedaron ${result.remaining} puestos sin lector disponible.`:'';toast(`Se completaron ${result.filled} puestos.${detail}`);await load()}catch(x){toast(x.message,true)}finally{button.disabled=false;button.textContent=label}
  }
  if(e.target.closest('.close')) e.target.closest('dialog').close();
  const er=e.target.closest('.edit-reader'); if(er) openReader(state.readers.find(x=>x.id===er.dataset.id));
  const em=e.target.closest('.edit-mass'); if(em) openMass(state.masses.find(x=>x.id===em.dataset.id));
  const del=e.target.closest('.delete-reader,.delete-mass');
  if(del){const resource=del.classList.contains('delete-reader')?'readers':'masses';if(confirm('¿Eliminar este registro y sus asignaciones?')){try{await request(`/api/${resource}/${del.dataset.id}`,{method:'DELETE'});toast('Registro eliminado');await load()}catch(x){toast(x.message,true)}}}
  if(e.target.closest('#printReport')){document.body.classList.remove('print-traditional');window.print()}
  if(e.target.closest('#printTraditionalReport'))printTraditionalImage();
  if(e.target.closest('#downloadTraditionalImage'))downloadTraditionalImage();
});
$('#upcoming').addEventListener('change',async e=>{if(!e.target.matches('.admin-replacement')||!e.target.value)return;const {id,mass,role,date}=e.target.dataset;try{await request(`/api/replacement/${id||'new'}`,{method:'POST',body:JSON.stringify({readerId:e.target.value,massId:mass,role,date,month:date.slice(0,7)})});toast('Lector asignado; queda pendiente de confirmar');await load()}catch(x){toast(x.message,true)}});
function openReader(r={},selfMode=false) { const f=$('#readerForm'), x=f.elements,availability=$('#readerAvailability'),fieldset=availability.closest('fieldset'); f.reset(); x.id.value=r.id||'';x.name.value=r.name||'';x.phone.value=r.phone||'';x.notes.value=r.notes||'';x.active.checked=r.active!==false;x.active.closest('label').hidden=selfMode;x.substituteOnly.checked=r.substituteOnly===true;fieldset.querySelector('legend').textContent='Preferencia por misa';let help=fieldset.querySelector('.mass-preference-help');if(!help){help=document.createElement('p');help.className='hint mass-preference-help';fieldset.querySelector('legend').after(help)}help.textContent='Elige una opción por horario. “Puedo asistir” se usará cuando falten personas en las misas preferidas.';availability.innerHTML=state.masses.filter(m=>m.active).map(m=>{const value=!r.id?'flexible':readerPrefersMass(r,m.id)?'preferred':readerCanServeMass(r,m.id)?'flexible':'unavailable';return `<div class="mass-preference-row"><b>${esc(massSchedule(m))}</b><div class="mass-preference-options"><label><input type="radio" name="massPreference_${esc(m.id)}" data-mass-preference="${esc(m.id)}" value="preferred" ${value==='preferred'?'checked':''}> Preferida</label><label><input type="radio" name="massPreference_${esc(m.id)}" data-mass-preference="${esc(m.id)}" value="flexible" ${value==='flexible'?'checked':''}> Puedo asistir</label><label><input type="radio" name="massPreference_${esc(m.id)}" data-mass-preference="${esc(m.id)}" value="unavailable" ${value==='unavailable'?'checked':''}> No puedo asistir</label></div></div>`}).join('')||'<span class="hint">Primero agrega una misa activa.</span>';$('#readerDialogTitle').textContent=selfMode?'Editar mis datos':r.id?'Editar lector':'Nuevo lector';$('#readerDialog').showModal(); }
function openMass(m={}) { const f=$('#massForm'),x=f.elements;f.reset();x.id.value=m.id||'';x.name.value=m.name||'';x.time.value=m.time||'';x.type.value=m.type||'weekly';x.weekday.value=m.weekday??0;x.date.value=m.date||'';x.roles.value=(m.roles||['Primera lectura','Segunda lectura','Salmo','Moniciones']).join(', ');x.active.checked=m.active!==false;toggleMassType();$('#massDialogTitle').textContent=m.id?'Editar misa':'Nueva misa';$('#massDialog').showModal(); }
function toggleMassType(){const f=$('#massForm').elements,once=f.type.value==='once';$('#dateField').hidden=!once;$('#weekdayField').hidden=once;f.date.required=once}
$('#massForm').elements.type.addEventListener('change',toggleMassType);
$('#readerForm').addEventListener('submit',async e=>{e.preventDefault();const f=e.currentTarget,x=f.elements,id=x.id.value,preferences=$$('input[data-mass-preference]:checked',f),preferredMassIds=preferences.filter(input=>input.value==='preferred').map(input=>input.dataset.massPreference),unavailableMassIds=preferences.filter(input=>input.value==='unavailable').map(input=>input.dataset.massPreference),payload={name:x.name.value,phone:x.phone.value,notes:x.notes.value,preferredMassIds,unavailableMassIds,active:x.active.checked,substituteOnly:x.substituteOnly.checked};try{let result;if(selfEditingReader&&selfEditingReader.id===id){result=await request(`/api/readers/${id}/profile`,{method:'POST',body:JSON.stringify({password:selfEditingReader.password,profile:payload})});selfEditingReader=null}else result=await request(`/api/readers${id?'/'+id:''}`,{method:id?'PUT':'POST',body:JSON.stringify(payload)});f.closest('dialog').close();if(!id&&result.temporaryPassword)showTemporaryPassword(payload.name,result.temporaryPassword);else toast('Lector guardado');await load()}catch(x){toast(x.message,true)}});
$('#readerPasswordForm').addEventListener('submit',async e=>{e.preventDefault();const f=e.currentTarget,x=f.elements;if(x.newPassword.value!==x.confirmPassword.value){toast('Las contraseñas nuevas no coinciden',true);return}try{await request(`/api/readers/${x.id.value}/password`,{method:'POST',body:JSON.stringify({currentPassword:x.currentPassword.value,newPassword:x.newPassword.value,confirmPassword:x.confirmPassword.value})});f.closest('dialog').close();f.reset();toast('Contraseña actualizada')}catch(error){toast(error.message,true)}});
$('#acceptConfirmationAction').addEventListener('click',()=>{if(!pendingConfirmation)return;$('#confirmationActionDialog').close();const form=$('#confirmationPasswordForm');form.reset();$('#confirmationPasswordTitle').textContent=pendingConfirmation.action==='confirm'?'Confirmar asistencia':'Indicar que no puedes asistir';$('#confirmationPasswordDialog').showModal();form.elements.password.focus()});
$('#confirmationPasswordForm').addEventListener('submit',async e=>{e.preventDefault();if(!pendingConfirmation)return;const f=e.currentTarget,{id,action}=pendingConfirmation;try{await request(`/api/confirmations/${id}`,{method:'POST',body:JSON.stringify({action,password:f.elements.password.value})});f.closest('dialog').close();f.reset();pendingConfirmation=null;toast(action==='confirm'?'Asistencia confirmada':'Se asignó el siguiente suplente');await load()}catch(error){toast(error.message,true);f.elements.password.select()}});
function openEucharistReport(massId,date){const mass=state.masses.find(item=>item.id===massId);if(!mass||!hasMassEnded(date,mass.time))return toast('El reporte estará disponible una hora después del inicio de la misa',true);const assignedReader=role=>state.assignments.find(item=>item.massId===mass.id&&item.role===role&&item.date===date)?.readerId;const form=$('#eucharistReportForm');form.reset();form.elements.massId.value=mass.id;form.elements.date.value=date;$('#eucharistReportHeading').textContent=mass.name;$('#eucharistReportSchedule').textContent=`${formatDate(date)} · ${mass.time}`;$('#eucharistRoleFields').innerHTML=mass.roles.map(role=>`<label>${esc(role)}<input class="eucharist-role" data-role="${esc(role)}" value="${esc(readerName(assignedReader(role)))}" required></label>`).join('');const monitorRole=mass.roles.find(role=>/monici|monitor/i.test(role.normalize('NFD').replace(/[\u0300-\u036f]/g,'')));form.elements.monitor.value=monitorRole?readerName(assignedReader(monitorRole)):'';$('#eucharistReportDialog').showModal()}
function eucharistReportText(){const form=$('#eucharistReportForm');if(!form.reportValidity())return null;const mass=state.masses.find(item=>item.id===form.elements.massId.value);const lines=[`📖 *Reporte de Eucaristía*`,``, `⛪ ${mass?.name||'Eucaristía'}`,`📅 ${formatDate(form.elements.date.value)} · ${mass?.time||''}`,''];$$('.eucharist-role',form).forEach(input=>lines.push(`*${input.dataset.role}:* ${input.value.trim()}`));lines.push(`*Sacerdote:* ${form.elements.priest.value.trim()}`,`*Monitor:* ${form.elements.monitor.value.trim()}`);if(form.elements.note.value.trim())lines.push('',`*Nota:* ${form.elements.note.value.trim()}`);if(form.elements.reflection.value.trim())lines.push('',`*Reflexión:* ${form.elements.reflection.value.trim()}`);return lines.join('\n')}
$('#copyEucharistReport').addEventListener('click',async()=>{const text=eucharistReportText();if(!text)return;try{await navigator.clipboard.writeText(text)}catch{const area=document.createElement('textarea');area.value=text;document.body.append(area);area.select();document.execCommand('copy');area.remove()}toast('Reporte copiado; ya puedes pegarlo en WhatsApp')});
$('#shareEucharistReport').addEventListener('click',()=>{const text=eucharistReportText();if(!text)return;window.open(`https://wa.me/?text=${encodeURIComponent(text)}`,'_blank','noopener,noreferrer')});
$('#massForm').addEventListener('submit',async e=>{e.preventDefault();const f=e.currentTarget,x=f.elements,id=x.id.value,payload={name:x.name.value,time:x.time.value,type:x.type.value,weekday:+x.weekday.value,date:x.date.value,roles:x.roles.value.split(',').map(v=>v.trim()).filter(Boolean),active:x.active.checked};try{await request(`/api/masses${id?'/'+id:''}`,{method:id?'PUT':'POST',body:JSON.stringify(payload)});f.closest('dialog').close();toast('Misa guardada');await load()}catch(x){toast(x.message,true)}});
function chooseAssignmentScope(select){
  const dialog=$('#assignmentScopeDialog');
  if(!dialog)return Promise.resolve('single');
  const previousName=readerName(select.dataset.reader),nextName=readerName(select.value);
  $('#assignmentScopeCopy').textContent=select.value
    ? select.dataset.reader
      ? `Reemplazarás a ${previousName} por ${nextName}. Si eliges las fechas restantes, el reemplazo seguirá las apariciones posteriores de ${previousName} en esta misa.`
      : `Asignarás a ${nextName}. Si eliges las fechas restantes, también ocupará un puesto sin asignar en cada celebración posterior de esta misa.`
    : `Quitarás a ${previousName}. Si eliges las fechas restantes, se eliminarán sus apariciones posteriores en esta misa, aunque cambie de función.`;
  dialog.showModal();
  return new Promise(resolve=>{
    let settled=false;
    const finish=scope=>{if(settled)return;settled=true;dialog.removeEventListener('close',cancel);if(dialog.open)dialog.close();resolve(scope)};
    const cancel=()=>finish(null);
    $('#singleAssignmentScope').onclick=()=>finish('single');
    $('#remainingAssignmentScope').onclick=()=>finish('remaining');
    $('#cancelAssignmentScope').onclick=cancel;
    dialog.addEventListener('close',cancel,{once:true});
  });
}
$('#assignmentBoard')?.addEventListener('change',async e=>{
  if(!e.target.matches('.assign-select'))return;
  const select=e.target,{mass,role,date,reader:previousReaderId}=select.dataset;
  const scope=await chooseAssignmentScope(select);
  if(!scope){select.value=previousReaderId;return}
  try{
    const result=await request('/api/assignment-change',{method:'POST',body:JSON.stringify({
      massId:mass,role,date,month:state.month,readerId:select.value,previousReaderId,scope
    })});
    const detail=scope==='remaining'&&result.changed>1?` en ${result.changed} celebraciones`:'';
    toast(`Asignación actualizada${detail}`);
    await load();
  }catch(x){toast(x.message,true);await load()}
});
$('#assignmentBoard')?.addEventListener('change',async e=>{if(!e.target.matches('.substitute-select'))return;const group=e.target.closest('.date-reserves'),substituteIds=[...group.querySelectorAll('.substitute-select')].map(select=>select.value).filter((id,index,all)=>id&&all.indexOf(id)===index);try{await request('/api/substitutes',{method:'POST',body:JSON.stringify({massId:group.dataset.mass,date:group.dataset.date,substituteIds})});toast('Lista de suplentes actualizada');await load()}catch(x){toast(x.message,true)}});
$('#month').value=state.month;$('#month').addEventListener('change',e=>{state.month=e.target.value||state.month;render()});
$('#assignmentReaderFilter')?.addEventListener('change',e=>{assignmentReaderFilter=e.target.value;renderAssignments();if(!isAdmin)$$('.assign-select').forEach(select=>{select.disabled=true})});
$('#assignmentMassFilter')?.addEventListener('change',e=>{assignmentMassFilter=e.target.value;renderAssignments();if(!isAdmin)$$('.assign-select').forEach(select=>{select.disabled=true})});
$('#clearAssignmentReaderFilter')?.addEventListener('click',()=>{assignmentReaderFilter='';assignmentMassFilter='';renderAssignments();if(!isAdmin)$$('.assign-select').forEach(select=>{select.disabled=true})});
$('#coverageMass')?.addEventListener('change',event=>{coverageMassId=event.target.value;renderCoverage()});
$('#coverageSearch')?.addEventListener('input',event=>{coverageSearch=event.target.value;renderCoverage()});
showView(initialView);
load();
