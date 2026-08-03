const isAdmin=document.body.dataset.mode==='admin';
const APP_TIME_ZONE='America/Costa_Rica';
const $=(selector,root=document)=>root.querySelector(selector);
const esc=value=>String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
let news=[];

if(isAdmin)document.querySelectorAll('[data-page-link]').forEach(link=>{link.href=`/admin${new URL(link.href).pathname}`});
function costaRicaDateTime(date=new Date()){const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:APP_TIME_ZONE,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date).filter(part=>part.type!=='literal').map(part=>[part.type,part.value]));return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`}
function formatDateTime(value){if(!value)return'';const [date,time]=value.split('T'),[year,month,day]=date.split('-').map(Number);return `${new Intl.DateTimeFormat('es-CR',{day:'numeric',month:'long',year:'numeric'}).format(new Date(year,month-1,day))} · ${time}`}
function statusOf(item){const now=costaRicaDateTime();if(!item.active)return{key:'inactive',label:'Inactiva'};if(item.startsAt>now)return{key:'scheduled',label:'Programada'};if(item.expiresAt<=now)return{key:'expired',label:'Vencida'};return{key:'current',label:'Activa'}}
async function request(url,options){const response=await fetch(url,{headers:{'Content-Type':'application/json'},...options});const data=await response.json();if(!response.ok)throw new Error(data.error||'No se pudo completar la operación');return data}
function toast(message,error=false){const element=$('#toast');element.textContent=message;element.style.background=error?'#9b4848':'';element.classList.add('show');setTimeout(()=>element.classList.remove('show'),2800)}
function render(){
  const list=$('#newsList');
  if(!news.length){list.innerHTML='<div class="news-empty"><span>✦</span><h3>No hay noticias activas por ahora</h3><p>Cuando haya una formación, reunión o aviso importante, lo encontrarás aquí.</p></div>';if(isAdmin)$('#newsSummary').innerHTML='<span>No hay noticias creadas todavía.</span>';return}
  if(isAdmin){const counts={current:0,scheduled:0,expired:0,inactive:0};news.forEach(item=>counts[statusOf(item).key]++);$('#newsSummary').innerHTML=`<div><b>${counts.current}</b><span>Activas</span></div><div><b>${counts.scheduled}</b><span>Programadas</span></div><div><b>${counts.expired}</b><span>Vencidas</span></div><div><b>${counts.inactive}</b><span>Inactivas</span></div>`}
  list.innerHTML=news.map(item=>{const status=statusOf(item);return `<article class="news-card ${status.key}"><div class="news-card-head"><div><span class="news-status ${status.key}">${status.label}</span><h3>${esc(item.title)}</h3></div>${isAdmin?`<div class="card-actions"><button class="small-btn edit-news" data-id="${esc(item.id)}">Editar</button><button class="small-btn danger delete-news" data-id="${esc(item.id)}">Eliminar</button></div>`:''}</div><p>${esc(item.message)}</p><div class="news-dates"><span><b>Desde:</b> ${esc(formatDateTime(item.startsAt))}</span><span><b>Hasta:</b> ${esc(formatDateTime(item.expiresAt))}</span></div></article>`}).join('')
}
async function load(){try{if(isAdmin){if(sessionStorage.getItem('admin_access_verified')!=='yes')return location.replace('/login.html');const auth=await request('/api/auth/status');if(!auth.authenticated)return location.replace('/login.html')}news=await request('/api/news');render()}catch(error){toast(error.message,true)}}
function openNews(item={}){const form=$('#newsForm'),now=costaRicaDateTime(),defaultEnd=new Date(Date.now()+7*24*60*60*1000);form.reset();form.elements.id.value=item.id||'';form.elements.title.value=item.title||'';form.elements.message.value=item.message||'';form.elements.startsAt.value=item.startsAt||now;form.elements.expiresAt.value=item.expiresAt||`${costaRicaDateTime(defaultEnd).slice(0,10)}T23:59`;form.elements.active.checked=item.active!==false;$('#newsDialogTitle').textContent=item.id?'Editar noticia':'Nueva noticia';$('#newsDialog').showModal()}
document.addEventListener('click',async event=>{
  if(event.target.closest('#menuBtn'))$('.sidebar').classList.toggle('open');
  if(event.target.closest('.close'))event.target.closest('dialog')?.close();
  if(event.target.closest('#newNews'))openNews();
  const edit=event.target.closest('.edit-news');if(edit)openNews(news.find(item=>item.id===edit.dataset.id));
  const remove=event.target.closest('.delete-news');if(remove&&confirm('¿Eliminar esta noticia definitivamente?')){try{await request(`/api/news/${remove.dataset.id}`,{method:'DELETE'});toast('Noticia eliminada');await load()}catch(error){toast(error.message,true)}}
  if(event.target.closest('#logoutBtn')){sessionStorage.removeItem('admin_access_verified');await request('/api/auth/logout',{method:'POST'});location.replace('/')}
});
$('#newsForm').addEventListener('submit',async event=>{event.preventDefault();const form=event.currentTarget,id=form.elements.id.value,payload={title:form.elements.title.value,message:form.elements.message.value,startsAt:form.elements.startsAt.value,expiresAt:form.elements.expiresAt.value,active:form.elements.active.checked};try{await request(`/api/news${id?`/${id}`:''}`,{method:id?'PUT':'POST',body:JSON.stringify(payload)});form.closest('dialog').close();toast('Noticia guardada');await load()}catch(error){toast(error.message,true)}});
load();
setInterval(load,60_000);
