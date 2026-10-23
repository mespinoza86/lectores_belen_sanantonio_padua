const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function fixture() {
  const state = {
    month: '2026-10',
    masses: [{ id: 'm', name: 'Misa', active: true, time: '07:00' }],
    readers: [
      { id: 'p', name: 'Preferida', active: true, preferredMassIds: ['m'] },
      { id: 'a', name: 'Alternativa', active: true, substituteOnly: true },
      { id: 't', name: 'Titular', active: true },
      { id: 's', name: 'Apoyo', active: true },
      { id: 'i', name: 'Inactiva', active: false },
      { id: 'n', name: 'Imposible', active: true, unavailableMassIds: ['m'] },
    ],
    assignments: [{ month: '2026-10', massId: 'otra', readerId: 't', substituteIds: ['s'] }],
  };
  const context = vm.createContext({
    state,
    document: {
      createElement: () => ({ getContext: () => ({ measureText: value => ({ width: value.length * 10 }) }) }),
    },
    readerCanServeMass: (r, id) => !(r.unavailableMassIds || []).includes(id),
    readerPrefersMass: (r, id) => (r.preferredMassIds || []).includes(id),
    readerName: id => state.readers.find(r => r.id === id)?.name || id,
    occurrences: () => ['2026-10-04'],
    monthLabel: () => 'Octubre 2026',
    massSchedule: () => 'Domingo 07:00',
    weekdays: ['Domingo'],
    formatDate: () => 'Domingo',
    localDate: value => new Date(`${value}T12:00:00`),
    months: Array(12).fill('octubre'),
    esc: value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;'),
  });
  vm.runInContext(fs.readFileSync('private/js/common-reporte-tradicional.js', 'utf8'), context);
  return context;
}

test('Disponibles: activos sin ningún puesto mensual, separados por preferencia', () => {
  const c = fixture();
  assert.deepEqual(JSON.parse(JSON.stringify(c.reportAvailableReaders('m'))), {
    preferred: ['Preferida'],
    alternative: ['Alternativa'],
  });
  c.state.month = '2026-11';
  assert.ok(c.reportAvailableReaders('m').alternative.includes('Titular'));
  assert.ok(c.reportAvailableReaders('m').alternative.includes('Apoyo'));
});

test('Reporte incluye misa sin apoyo y ambos grupos; SVG impreso dentro de una A4', () => {
  const c = fixture();
  const data = c.availabilityReportData();
  assert.equal(data.substituteGroups.length, 1);
  const svg = c.buildAvailabilityReportSvg(data, true);
  assert.match(svg, /Prefieren esta misa/);
  assert.match(svg, /Pueden ayudar/);
  assert.match(svg, /Preferida/);
  assert.match(svg, /Alternativa/);
  const dimensions = svg.match(/width="([\d.]+)mm" height="([\d.]+)mm"/);
  assert.ok(Number(dimensions[1]) <= 186);
  assert.ok(Number(dimensions[2]) <= 273);
});

test('Tradicional conserva los dos grupos y ajusta incluso listas extensas a una hoja', () => {
  const c = fixture();
  for (let i = 0; i < 40; i++) {
    c.state.readers.push({ id: `libre${i}`, name: `Persona disponible de nombre largo ${i}`, active: true });
  }
  const svg = c.buildTraditionalSvg(c.traditionalReportData(), true);
  assert.match(svg, /Prefieren esta misa/);
  assert.match(svg, /Pueden ayudar/);
  assert.match(svg.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '), /Persona disponible de nombre largo 39/);
  const dimensions = svg.match(/width="([\d.]+)mm" height="([\d.]+)mm"/);
  assert.ok(Number(dimensions[1]) <= 192);
  assert.ok(Number(dimensions[2]) <= 278);
});

test('La pantalla Reporte incluye disponibles directamente y se recalcula al cambiar el mes', () => {
  const c = fixture();
  const target = { innerHTML: '' };
  c.$ = selector => (selector === '#reportContent' ? target : null);
  c.state.masses[0].roles = [];
  c.allEvents = () => [{ mass: c.state.masses[0], date: '2026-10-04' }];
  vm.runInContext(fs.readFileSync('private/js/common-vistas.js', 'utf8'), c);
  c.renderReport();
  assert.match(target.innerHTML, /Sin asignación · Prefieren esta misa:/);
  assert.match(target.innerHTML, /Sin asignación · Pueden ayudar:/);
  assert.match(target.innerHTML, /<b>Preferida<\/b>/);
  assert.match(target.innerHTML, /<b>Alternativa<\/b>/);
  assert.doesNotMatch(target.innerHTML, /Inactiva|Imposible/);
  c.state.month = '2026-11';
  c.renderReport();
  assert.match(target.innerHTML, /Alternativa · Apoyo · Titular/);
});

test('PDF actual imprime sin copia reducida ni ajuste a una sola hoja', () => {
  const c = fixture();
  let prints = 0;
  c.window = { print: () => prints++ };
  c.document.createElement = () => {
    throw new Error('No debe crear un contenedor escalado');
  };
  c.printCurrentReport();
  assert.equal(prints, 1);
});
