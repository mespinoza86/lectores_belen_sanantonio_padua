const isAdmin = document.body.dataset.mode === 'admin';
const initialView = location.pathname.endsWith('/cobertura.html')
  ? 'coverage'
  : document.body.dataset.page || 'dashboard';
const APP_TIME_ZONE = 'America/Costa_Rica';
const MASS_DURATION_MINUTES = 60;
function costaRicaParts(date = new Date()) {
  return Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: APP_TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(date)
      .filter(part => part.type !== 'literal')
      .map(part => [part.type, part.value]),
  );
}
function costaRicaDateTime(date = new Date()) {
  const value = costaRicaParts(date);
  return `${value.year}-${value.month}-${value.day}T${value.hour}:${value.minute}`;
}
const costaRicaToday = () => costaRicaDateTime().slice(0, 10);
const massEndTime = (date, time) =>
  new Date(`${date}T${time}:00-06:00`).getTime() + MASS_DURATION_MINUTES * 60_000;
const hasMassEnded = (date, time) => Date.now() >= massEndTime(date, time);
const state = { readers: [], masses: [], assignments: [], news: [], month: costaRicaToday().slice(0, 7) };
let pendingConfirmation = null;
let selfEditingReader = null;
let readerListFilter = '';
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
const weekdays = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const months = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];
const esc = value =>
  String(value ?? '').replace(
    /[&<>'"]/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[c],
  );
const localDate = iso => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const isoDate = date =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const monthLabel = month => {
  const [y, m] = month.split('-').map(Number);
  return `${months[m - 1][0].toUpperCase() + months[m - 1].slice(1)} ${y}`;
};

async function request(url, options) {
  const response = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...options });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'No se pudo completar la operación');
  return data;
}
