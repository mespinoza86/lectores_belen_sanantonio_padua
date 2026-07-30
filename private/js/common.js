const isAdmin = document.body.dataset.mode === 'admin';
const initialView = document.body.dataset.page || 'dashboard';
const APP_TIME_ZONE = 'America/Costa_Rica';
const MASS_DURATION_MINUTES = 60;
function costaRicaParts(date = new Date()) {
  return Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: APP_TIME_ZONE, year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hourCycle:'h23' }).formatToParts(date).filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
}
function costaRicaDateTime(date = new Date()) { const value=costaRicaParts(date); return `${value.year}-${value.month}-${value.day}T${value.hour}:${value.minute}`; }
const costaRicaToday = () => costaRicaDateTime().slice(0, 10);
const massEndTime = (date,time) => new Date(`${date}T${time}:00-06:00`).getTime() + MASS_DURATION_MINUTES * 60_000;
const hasMassEnded = (date,time) => Date.now() >= massEndTime(date,time);
const state = { readers: [], masses: [], assignments: [], month: costaRicaToday().slice(0, 7) };
let pendingConfirmation = null;
let selfEditingReader = null;
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
    [state.readers, state.masses, state.assignments] = await Promise.all(['/api/readers','/api/masses','/api/assignments'].map(x => request(x)));
    render();
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
function readerMassNames(reader) {
  return (reader.availability || []).map(id => state.masses.find(m => m.id === id)).filter(Boolean).map(massSchedule);
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
  renderDashboard(); renderReaders(); renderMasses(); renderAssignments(); renderCalendar(); renderReport();
  if (!isAdmin) $$('.assign-select').forEach(select => { select.disabled = true; });
}
function renderDashboard() {
  $('#readerCount').textContent = state.readers.filter(x => x.active).length;
  $('#massCount').textContent = state.masses.filter(x => x.active).length;
  const slots = state.masses.filter(x => x.active).flatMap(x => occurrences(x).flatMap(date => x.roles.map(role => ({x,role,date}))));
  const filled = slots.filter(({x,role,date}) => assignment(x.id, role, date)).length;
  $('#assignedCount').textContent = `${slots.length ? Math.round(filled/slots.length*100) : 0}%`;
  $('#heroCopy').textContent = `Prepara y comparte el calendario de ${monthLabel(state.month).toLowerCase()}.`;
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
    return `<article class="weekly-mass"><div class="weekly-mass-head"><div><b>${esc(mass.name)}</b><small>${esc(formatDate(date))} · ${mass.time}</small></div></div>${roles}<div class="weekly-reserves"><b>Suplentes:</b> ${reserves.length?reserves.map((id,index)=>`${index+1}. ${esc(readerName(id))}`).join(' · '):'Sin suplentes disponibles'}</div>${reportAction}</article>`;
  }).join('') : '<div class="empty">No hay celebraciones programadas para esta semana.</div>';
  renderPendingReports();
}
function pendingReportEvents(){const now=Date.now(),cutoff=now-7*24*60*60*1000,today=localDate(costaRicaToday()),months=new Set();for(let offset=0;offset<=7;offset++){const day=new Date(today);day.setDate(today.getDate()-offset);months.add(isoDate(day).slice(0,7))}return state.masses.flatMap(mass=>[...months].flatMap(month=>occurrences(mass,month).map(date=>({mass,date,end:massEndTime(date,mass.time)})))).filter(event=>event.end<=now&&event.end>=cutoff).sort((a,b)=>b.end-a.end)}
function renderPendingReports(){let panel=$('#pendingReportsPanel');if(!panel){panel=document.createElement('div');panel.id='pendingReportsPanel';panel.className='panel pending-reports-panel';$('#dashboard').append(panel)}const events=pendingReportEvents();panel.innerHTML=`<div class="panel-head"><div><p class="eyebrow">ÚLTIMOS 7 DÍAS</p><h3>Reportes pendientes</h3><p class="pending-reports-copy">Prepara el resumen de las Eucaristías que ya concluyeron.</p></div><span class="badge">${events.length}</span></div><div class="pending-report-list">${events.length?events.map(({mass,date})=>{const roleSummary=mass.roles.map(role=>{const readerId=state.assignments.find(item=>item.massId===mass.id&&item.role===role&&item.date===date)?.readerId;return `<span><b>${esc(role)}:</b> ${esc(readerName(readerId))}</span>`}).join('');return `<article class="pending-report-card"><div><h4>${esc(mass.name)}</h4><small>${esc(formatDate(date))} · ${mass.time}</small><div class="pending-report-roles">${roleSummary}</div></div><button class="primary open-eucharist-report" data-mass="${mass.id}" data-date="${date}">Crear reporte</button></article>`}).join(''):'<div class="empty pending-report-empty">No hay reportes pendientes de los últimos 7 días.</div>'}</div>`}
function adminReplacementSelect(assignmentId,massId,role,date){const readers=state.readers.filter(reader=>reader.active&&!state.assignments.some(a=>a.massId===massId&&a.date===date&&a.readerId===reader.id));return `<select class="admin-replacement admin-only" data-id="${assignmentId}" data-mass="${massId}" data-role="${esc(role)}" data-date="${date}"><option value="">Asignar lector…</option>${readers.map(reader=>`<option value="${reader.id}">${esc(reader.name)}</option>`).join('')}</select>`}
function renderReaders() {
  let summary=$('#readerStatusSummary');
  if(isAdmin&&!summary){summary=document.createElement('div');summary.id='readerStatusSummary';summary.className='stats admin-only';$('#readerList').before(summary)}
  if(summary){const normal=state.readers.filter(r=>r.active&&!r.substituteOnly).length,substitutes=state.readers.filter(r=>r.active&&r.substituteOnly).length,inactive=state.readers.filter(r=>!r.active).length;summary.innerHTML=`<article><span class="stat-icon green">✓</span><div><strong>${normal}</strong><small>Activos normales</small></div></article><article><span class="stat-icon gold">↻</span><div><strong>${substitutes}</strong><small>Solo suplentes</small></div></article><article><span class="stat-icon rose">—</span><div><strong>${inactive}</strong><small>Inactivos</small></div></article>`}
  $('#readerList').innerHTML = state.readers.length ? state.readers.map(r => { const available=readerMassNames(r); return `<article class="card"><div class="card-top"><span class="avatar">${esc(r.name.split(/\s+/).map(x=>x[0]).slice(0,2).join('').toUpperCase())}</span><div><h3>${esc(r.name)}</h3><span class="badge ${r.active?'':'off'}">${r.active?'Activo':'Inactivo'}</span>${r.active&&r.substituteOnly?'<span class="badge">Solo suplente</span>':''}${isAdmin&&r.mustChangePassword?'<span class="badge off">Cambio de contraseña pendiente</span>':''}</div></div>${isAdmin?`<p>${esc(r.phone || 'Sin teléfono')}</p>`:''}<p class="availability-copy"><b>Disponible:</b> ${available.length?available.map(esc).join(' · '):'Sin horarios seleccionados'}</p>${r.notes?`<p>${esc(r.notes)}</p>`:''}<div class="reader-password-action">${r.active?`<button class="small-btn self-edit-reader user-only" data-id="${esc(r.id)}" data-name="${esc(r.name)}">Editar mis datos</button>`:''}<button class="small-btn change-reader-password" data-id="${esc(r.id)}" data-name="${esc(r.name)}">Cambiar contraseña</button>${isAdmin?`<button class="small-btn reset-reader-password" data-id="${esc(r.id)}" data-name="${esc(r.name)}">Generar contraseña temporal</button>`:''}</div><div class="card-actions"><button class="small-btn edit-reader" data-id="${esc(r.id)}">Editar</button><button class="small-btn danger delete-reader" data-id="${esc(r.id)}">Eliminar</button></div></article>`; }).join('') : emptyCard('No hay lectores todavía','Agrega la primera persona del equipo.');
}
function massSchedule(m) { return m.type === 'weekly' ? `${weekdays[m.weekday]} · ${m.time}` : `${formatDate(m.date)} · ${m.time}`; }
function renderMasses() {
  $('#massList').innerHTML = state.masses.length ? state.masses.map(m => `<article class="card"><div class="card-top"><span class="avatar">✦</span><div><h3>${esc(m.name)}</h3><span class="badge ${m.active?'':'off'}">${m.type==='weekly'?'Semanal':'Especial'}</span></div></div><p><b>${esc(massSchedule(m))}</b></p><p>${m.roles.map(esc).join(' · ')}</p><div class="card-actions"><button class="small-btn edit-mass" data-id="${m.id}">Editar</button><button class="small-btn danger delete-mass" data-id="${m.id}">Eliminar</button></div></article>`).join('') : emptyCard('No hay misas configuradas','Crea horarios semanales o fechas especiales.');
}
function renderAssignments() {
  const masses = state.masses.filter(x => x.active && occurrences(x).length);
  $('#assignmentBoard').innerHTML = masses.length ? masses.map(m => {
    const titularReaders=state.readers.filter(r=>r.active&&!r.substituteOnly);
    const dates=occurrences(m);
    const datePlans=dates.map(date=>{
      const dateAssignments=state.assignments.filter(a=>a.massId===m.id&&a.date===date);
      const reserves=dateAssignments.find(a=>a.substituteIds?.length)?.substituteIds||[];
      const titularIds=new Set(dateAssignments.map(a=>a.readerId).filter(Boolean));
      const substituteOptions=state.readers.filter(reader => reader.active && !titularIds.has(reader.id) &&
        (reserves.includes(reader.id) || !state.assignments.some(a => a.month === state.month &&
          (a.readerId === reader.id || (a.substituteIds || []).includes(reader.id)))));
      const reserveContent=isAdmin
        ? Array.from({length:Math.max(1,reserves.length+1)},(_,index)=>`<label><span>${index+1}.</span><select class="substitute-select" data-slot="${index}"><option value="">— Sin suplente —</option>${substituteOptions.map(reader=>`<option value="${reader.id}" ${reserves[index]===reader.id?'selected':''}>${esc(reader.name)}</option>`).join('')}</select></label>`).join('')
        : reserves.length?`<ol>${reserves.map(id=>`<li>${esc(readerName(id))}</li>`).join('')}</ol>`:'<span class="empty">Sin suplentes asignados.</span>';
      const roles=m.roles.map(role => { const a=assignment(m.id,role,date); return `<div class="role-row"><label>${esc(role)}</label><select class="assign-select" data-mass="${m.id}" data-role="${esc(role)}" data-date="${date}"><option value="">— Sin asignar —</option>${titularReaders.map(r=>`<option value="${r.id}" ${a?.readerId===r.id?'selected':''}>${esc(r.name)}</option>`).join('')}</select></div>`; }).join('');
      return `<section class="assignment-date"><h4>${esc(formatDate(date))}</h4>${roles}<div class="date-reserves" data-mass="${m.id}" data-date="${date}"><div><b>Suplentes de esta misa</b><small>En orden de llamada</small></div><div class="substitute-controls">${reserveContent}</div></div></section>`;
    }).join('');
    return `<article class="mass-assign"><div class="mass-assign-head"><div><h3>${esc(m.name)}</h3><small>${esc(massSchedule(m))} · ${dates.length} fecha(s) en ${monthLabel(state.month)}</small></div><span class="badge">${m.roles.length} funciones por misa</span></div>${datePlans}</article>`;
  }).join('') : emptyCard('Nada que asignar','Agrega una misa que ocurra durante este mes.');
}
function renderCalendar() {
  const [y,m] = state.month.split('-').map(Number), first = new Date(y,m-1,1), last = new Date(y,m,0).getDate();
  const start = (first.getDay()+6)%7, today=costaRicaToday(), names=['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];
  let html=names.map(x=>`<div class="cal-head">${x}</div>`).join('');
  for(let cell=0;cell<Math.ceil((start+last)/7)*7;cell++) {
    const day=cell-start+1, valid=day>0&&day<=last, date=valid?`${state.month}-${String(day).padStart(2,'0')}`:'';
    const events=valid?allEvents().filter(x=>x.date===date):[];
    html+=`<div class="day ${valid?'':'muted'} ${date===today?'today':''}">${valid?`<span class="day-number">${day}</span>`:''}${events.map(({mass})=>{const pending=mass.roles.some(r=>!assignment(mass.id,r,date));return `<div class="cal-event ${pending?'pending':''}" title="${esc(mass.name)} · ${mass.time}">${mass.time} ${esc(mass.name)}</div>`}).join('')}</div>`;
  }
  $('#calendarGrid').innerHTML=html;
}
function renderReport() {
  const events=allEvents(), grouped=Object.groupBy ? Object.groupBy(events,x=>x.date) : events.reduce((a,x)=>((a[x.date]??=[]).push(x),a),{});
  $('#reportContent').innerHTML=`<div class="report-title"><p class="eyebrow">PARROQUIA · MINISTERIO DE LECTORES</p><h2>Programación de ${monthLabel(state.month)}</h2><p>Titulares y suplentes por celebración</p></div>${events.length?Object.entries(grouped).map(([date,items])=>`<div class="report-date">${formatDate(date)}</div>${items.map(({mass})=>{const reserves=state.assignments.find(a=>a.massId===mass.id&&a.month===state.month&&a.date===date&&a.substituteIds?.length)?.substituteIds||[];return `<div class="report-mass"><h4>${esc(mass.name)} · ${mass.time}</h4><div class="report-roles">${mass.roles.map(role=>`<div><span>${esc(role)}:</span> <b>${esc(readerName(assignment(mass.id,role,date)?.readerId))}</b></div>`).join('')}</div><div class="report-reserves"><span>Suplentes, en orden:</span> <b>${reserves.length?reserves.map((id,index)=>`${index+1}. ${esc(readerName(id))}`).join(' · '):'Sin suplentes asignados'}</b></div></div>`;}).join('')}`).join(''):'<p class="empty">No hay celebraciones para este mes.</p>'}<p style="margin-top:35px;color:#718078;font-size:11px">Generado desde el planificador de lectores.</p>`;
}
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
function showView(id){$$('.view').forEach(x=>x.classList.toggle('active',x.id===id));$$('.nav').forEach(x=>x.classList.toggle('active',x.dataset.view===id));$('#pageTitle').textContent={dashboard:'Buenos días',calendar:'Calendario',readers:'Lectores',masses:'Misas',assign:'Asignaciones',report:'Reporte mensual'}[id];$('.sidebar').classList.remove('open');window.scrollTo(0,0)}

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
  if (!isAdmin && e.target.closest('#newReader,#newMass,#randomAssign,.edit-reader,.edit-mass,.delete-reader,.delete-mass,.reset-reader-password')) return;
  if(e.target.closest('#newReader')) openReader();
  if(e.target.closest('#newMass')) openMass();
  if(e.target.closest('#randomAssign')) {
    if(!confirm(`¿Reemplazar las asignaciones de ${monthLabel(state.month)} y generar titulares y suplentes según disponibilidad?`)) return;
    const button=e.target.closest('#randomAssign'),label=button.textContent;button.disabled=true;button.textContent='Generando…';
    try{await request('/api/random-assignments',{method:'POST',body:JSON.stringify({month:state.month})});toast('Titulares y suplentes generados');await load()}catch(x){toast(x.message,true)}finally{button.disabled=false;button.textContent=label}
  }
  if(e.target.closest('.close')) e.target.closest('dialog').close();
  const er=e.target.closest('.edit-reader'); if(er) openReader(state.readers.find(x=>x.id===er.dataset.id));
  const em=e.target.closest('.edit-mass'); if(em) openMass(state.masses.find(x=>x.id===em.dataset.id));
  const del=e.target.closest('.delete-reader,.delete-mass');
  if(del){const resource=del.classList.contains('delete-reader')?'readers':'masses';if(confirm('¿Eliminar este registro y sus asignaciones?')){try{await request(`/api/${resource}/${del.dataset.id}`,{method:'DELETE'});toast('Registro eliminado');await load()}catch(x){toast(x.message,true)}}}
  if(e.target.closest('#printReport')) window.print();
});
$('#upcoming').addEventListener('change',async e=>{if(!e.target.matches('.admin-replacement')||!e.target.value)return;const {id,mass,role,date}=e.target.dataset;try{await request(`/api/replacement/${id||'new'}`,{method:'POST',body:JSON.stringify({readerId:e.target.value,massId:mass,role,date,month:date.slice(0,7)})});toast('Lector asignado; queda pendiente de confirmar');await load()}catch(x){toast(x.message,true)}});
function openReader(r={},selfMode=false) { const f=$('#readerForm'), x=f.elements; f.reset(); x.id.value=r.id||'';x.name.value=r.name||'';x.phone.value=r.phone||'';x.notes.value=r.notes||'';x.active.checked=r.active!==false;x.active.closest('label').hidden=selfMode;x.substituteOnly.checked=r.substituteOnly===true;$('#readerAvailability').innerHTML=state.masses.filter(m=>m.active).map(m=>`<label class="check"><input type="checkbox" name="availability" value="${m.id}" ${(r.availability||[]).includes(m.id)?'checked':''}> ${esc(massSchedule(m))}</label>`).join('')||'<span class="hint">Primero agrega una misa activa.</span>';$('#readerDialogTitle').textContent=selfMode?'Editar mis datos':r.id?'Editar lector':'Nuevo lector';$('#readerDialog').showModal(); }
function openMass(m={}) { const f=$('#massForm'),x=f.elements;f.reset();x.id.value=m.id||'';x.name.value=m.name||'';x.time.value=m.time||'';x.type.value=m.type||'weekly';x.weekday.value=m.weekday??0;x.date.value=m.date||'';x.roles.value=(m.roles||['Primera lectura','Segunda lectura','Salmo','Moniciones']).join(', ');x.active.checked=m.active!==false;toggleMassType();$('#massDialogTitle').textContent=m.id?'Editar misa':'Nueva misa';$('#massDialog').showModal(); }
function toggleMassType(){const f=$('#massForm').elements,once=f.type.value==='once';$('#dateField').hidden=!once;$('#weekdayField').hidden=once;f.date.required=once}
$('#massForm').elements.type.addEventListener('change',toggleMassType);
$('#readerForm').addEventListener('submit',async e=>{e.preventDefault();const f=e.currentTarget,x=f.elements,id=x.id.value,payload={name:x.name.value,phone:x.phone.value,notes:x.notes.value,availability:$$('input[name="availability"]:checked',f).map(input=>input.value),active:x.active.checked,substituteOnly:x.substituteOnly.checked};try{let result;if(selfEditingReader&&selfEditingReader.id===id){result=await request(`/api/readers/${id}/profile`,{method:'POST',body:JSON.stringify({password:selfEditingReader.password,profile:payload})});selfEditingReader=null}else result=await request(`/api/readers${id?'/'+id:''}`,{method:id?'PUT':'POST',body:JSON.stringify(payload)});f.closest('dialog').close();if(!id&&result.temporaryPassword)showTemporaryPassword(payload.name,result.temporaryPassword);else toast('Lector guardado');await load()}catch(x){toast(x.message,true)}});
$('#readerPasswordForm').addEventListener('submit',async e=>{e.preventDefault();const f=e.currentTarget,x=f.elements;if(x.newPassword.value!==x.confirmPassword.value){toast('Las contraseñas nuevas no coinciden',true);return}try{await request(`/api/readers/${x.id.value}/password`,{method:'POST',body:JSON.stringify({currentPassword:x.currentPassword.value,newPassword:x.newPassword.value,confirmPassword:x.confirmPassword.value})});f.closest('dialog').close();f.reset();toast('Contraseña actualizada')}catch(error){toast(error.message,true)}});
$('#acceptConfirmationAction').addEventListener('click',()=>{if(!pendingConfirmation)return;$('#confirmationActionDialog').close();const form=$('#confirmationPasswordForm');form.reset();$('#confirmationPasswordTitle').textContent=pendingConfirmation.action==='confirm'?'Confirmar asistencia':'Indicar que no puedes asistir';$('#confirmationPasswordDialog').showModal();form.elements.password.focus()});
$('#confirmationPasswordForm').addEventListener('submit',async e=>{e.preventDefault();if(!pendingConfirmation)return;const f=e.currentTarget,{id,action}=pendingConfirmation;try{await request(`/api/confirmations/${id}`,{method:'POST',body:JSON.stringify({action,password:f.elements.password.value})});f.closest('dialog').close();f.reset();pendingConfirmation=null;toast(action==='confirm'?'Asistencia confirmada':'Se asignó el siguiente suplente');await load()}catch(error){toast(error.message,true);f.elements.password.select()}});
function openEucharistReport(massId,date){const mass=state.masses.find(item=>item.id===massId);if(!mass||!hasMassEnded(date,mass.time))return toast('El reporte estará disponible una hora después del inicio de la misa',true);const assignedReader=role=>state.assignments.find(item=>item.massId===mass.id&&item.role===role&&item.date===date)?.readerId;const form=$('#eucharistReportForm');form.reset();form.elements.massId.value=mass.id;form.elements.date.value=date;$('#eucharistReportHeading').textContent=mass.name;$('#eucharistReportSchedule').textContent=`${formatDate(date)} · ${mass.time}`;$('#eucharistRoleFields').innerHTML=mass.roles.map(role=>`<label>${esc(role)}<input class="eucharist-role" data-role="${esc(role)}" value="${esc(readerName(assignedReader(role)))}" required></label>`).join('');const monitorRole=mass.roles.find(role=>/monici|monitor/i.test(role.normalize('NFD').replace(/[\u0300-\u036f]/g,'')));form.elements.monitor.value=monitorRole?readerName(assignedReader(monitorRole)):'';$('#eucharistReportDialog').showModal()}
function eucharistReportText(){const form=$('#eucharistReportForm');if(!form.reportValidity())return null;const mass=state.masses.find(item=>item.id===form.elements.massId.value);const lines=[`📖 *Reporte de Eucaristía*`,``, `⛪ ${mass?.name||'Eucaristía'}`,`📅 ${formatDate(form.elements.date.value)} · ${mass?.time||''}`,''];$$('.eucharist-role',form).forEach(input=>lines.push(`*${input.dataset.role}:* ${input.value.trim()}`));lines.push(`*Sacerdote:* ${form.elements.priest.value.trim()}`,`*Monitor:* ${form.elements.monitor.value.trim()}`);if(form.elements.note.value.trim())lines.push('',`*Nota:* ${form.elements.note.value.trim()}`);if(form.elements.reflection.value.trim())lines.push('',`*Reflexión:* ${form.elements.reflection.value.trim()}`);return lines.join('\n')}
$('#copyEucharistReport').addEventListener('click',async()=>{const text=eucharistReportText();if(!text)return;try{await navigator.clipboard.writeText(text)}catch{const area=document.createElement('textarea');area.value=text;document.body.append(area);area.select();document.execCommand('copy');area.remove()}toast('Reporte copiado; ya puedes pegarlo en WhatsApp')});
$('#shareEucharistReport').addEventListener('click',()=>{const text=eucharistReportText();if(!text)return;window.open(`https://wa.me/?text=${encodeURIComponent(text)}`,'_blank','noopener,noreferrer')});
$('#massForm').addEventListener('submit',async e=>{e.preventDefault();const f=e.currentTarget,x=f.elements,id=x.id.value,payload={name:x.name.value,time:x.time.value,type:x.type.value,weekday:+x.weekday.value,date:x.date.value,roles:x.roles.value.split(',').map(v=>v.trim()).filter(Boolean),active:x.active.checked};try{await request(`/api/masses${id?'/'+id:''}`,{method:id?'PUT':'POST',body:JSON.stringify(payload)});f.closest('dialog').close();toast('Misa guardada');await load()}catch(x){toast(x.message,true)}});
$('#assignmentBoard').addEventListener('change',async e=>{if(!e.target.matches('.assign-select'))return;const {mass,role,date}=e.target.dataset;try{if(e.target.value){await request('/api/assignments',{method:'POST',body:JSON.stringify({massId:mass,role,readerId:e.target.value,month:state.month,date})})}else{const a=assignment(mass,role,date);if(a)await request(`/api/assignments/${a.id}`,{method:'DELETE'})}toast('Asignación actualizada');await load()}catch(x){toast(x.message,true)}});
$('#assignmentBoard').addEventListener('change',async e=>{if(!e.target.matches('.substitute-select'))return;const group=e.target.closest('.date-reserves'),substituteIds=[...group.querySelectorAll('.substitute-select')].map(select=>select.value).filter((id,index,all)=>id&&all.indexOf(id)===index);try{await request('/api/substitutes',{method:'POST',body:JSON.stringify({massId:group.dataset.mass,date:group.dataset.date,substituteIds})});toast('Lista de suplentes actualizada');await load()}catch(x){toast(x.message,true)}});
$('#month').value=state.month;$('#month').addEventListener('change',e=>{state.month=e.target.value||state.month;render()});
showView(initialView);
load();
