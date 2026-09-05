function traditionalRoleLabel(role) {
  const value = role
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  return value.includes('primera')
    ? 'Primera'
    : value.includes('segunda')
      ? 'Segunda'
      : value.includes('salmo')
        ? 'Salmo'
        : value.includes('monici') || value.includes('monitor')
          ? 'Monitor'
          : role;
}
function traditionalReportData() {
  return state.masses
    .filter(mass => mass.active && occurrences(mass).length)
    .sort((a, b) => `${occurrences(a)[0]}${a.time}`.localeCompare(`${occurrences(b)[0]}${b.time}`))
    .map(mass => {
      const dates = occurrences(mass),
        items = state.assignments.filter(
          item => item.month === state.month && item.massId === mass.id && dates.includes(item.date),
        ),
        readerIds = [...new Set(items.map(item => item.readerId).filter(Boolean))].slice(0, 4);
      while (readerIds.length < 4) readerIds.push('');
      const reserves = items.find(item => item.substituteIds?.length)?.substituteIds || [];
      return {
        mass,
        dates,
        readerIds,
        columns: readerIds.map(readerId => ({
          readerId,
          name: readerId ? readerName(readerId) : 'Sin asignar',
          rows: dates.map(date => {
            const item = items.find(value => value.date === date && value.readerId === readerId);
            return { date, label: item ? traditionalRoleLabel(item.role) : '—' };
          }),
        })),
        // Solo los suplentes que existen: el formato de la parroquia no rellena espacios vacíos.
        reserves: reserves.map(readerId => readerName(readerId)),
      };
    });
}
function traditionalMassTitle(mass) {
  const day = mass.type === 'weekly' ? weekdays[mass.weekday] : formatDate(mass.date);
  const [hour, minute] = mass.time.split(':').map(Number),
    suffix = hour >= 12 ? 'PM' : 'AM',
    displayHour = hour % 12 || 12;
  return `${day.toUpperCase()} ${displayHour}:${String(minute).padStart(2, '0')} ${suffix} - ${monthLabel(state.month).toUpperCase()}`;
}
function renderTraditionalReport() {
  const target = $('#traditionalReport');
  if (!target) return;
  const data = traditionalReportData();
  // La vista previa dibuja el mismo SVG que se exporta, para que lo que se ve en
  // pantalla sea exactamente lo que sale en el PDF y en la imagen.
  target.innerHTML = data.length
    ? buildTraditionalSvg(data)
    : '<p class="empty">No hay celebraciones para este mes.</p>';
}

// Maquetación única del formato tradicional.
// El reporte se dibuja una sola vez en SVG y de ahí salen las dos exportaciones:
// el PDF imprime ese vector con texto real y el PNG rasteriza ese mismo SVG.
// Tener una sola maquetación evita que las dos salidas vuelvan a desincronizarse.
const TRADITIONAL_TITLE = 'Lectores Diaconía San Antonio de Belén de Padua';
const TRADITIONAL_FONT = 'Arial, Helvetica, sans-serif';
const TRADITIONAL_LAYOUT = {
  width: 1600,
  pad: 24,
  titleH: 104,
  massGap: 22,
  headerH: 54,
  nameH: 46,
  rowH: 38,
  colGap: 14,
  reserveLabelH: 36,
  reserveRowH: 32,
  reservePad: 12,
  // Área útil de una A4 vertical con 8 mm de margen, 194 x 281 mm, menos un 1 % de
  // holgura. El SVG se emite con estas medidas en milímetros para que el mes completo
  // entre siempre en una sola hoja. La holgura importa: al ocupar el alto exacto,
  // cualquier redondeo del navegador empuja el dibujo a una segunda página.
  pageWidthMm: 192,
  pageHeightMm: 278,
};
let traditionalMeasureContext = null;
// Se mide con un lienzo que nunca se dibuja: solo hace falta para saber cuánto
// ocupa un nombre y bajarle el tamaño hasta que quepa dentro de su columna.
function traditionalFitSize(text, maxWidth, startSize, weight = 700) {
  if (!traditionalMeasureContext)
    traditionalMeasureContext = document.createElement('canvas').getContext('2d');
  let size = startSize;
  while (size > 9) {
    traditionalMeasureContext.font = `${weight} ${size}px Arial`;
    if (traditionalMeasureContext.measureText(text).width <= maxWidth) break;
    size--;
  }
  return size;
}
function traditionalTextSvg(text, x, y, { size, weight = 400, fill = '#111', anchor = 'middle' }) {
  return `<text x="${x}" y="${y}" text-anchor="${anchor}" dominant-baseline="central" font-family="${TRADITIONAL_FONT}" font-size="${size}" font-weight="${weight}" fill="${fill}">${esc(text)}</text>`;
}
function traditionalBlockWidth() {
  const layout = TRADITIONAL_LAYOUT;
  return (layout.width - layout.pad * 2 - layout.colGap * 3) / 4;
}
function traditionalReserveRows(item) {
  return Math.max(1, Math.ceil(item.reserves.length / 4));
}
function traditionalSectionHeight(item) {
  const layout = TRADITIONAL_LAYOUT;
  return (
    layout.headerH +
    layout.nameH +
    (item.columns[0]?.rows.length || 0) * layout.rowH +
    layout.reserveLabelH +
    traditionalReserveRows(item) * layout.reserveRowH +
    layout.reservePad
  );
}
function traditionalSectionSvg(item, top) {
  const layout = TRADITIONAL_LAYOUT,
    left = layout.pad,
    inner = layout.width - layout.pad * 2,
    blockW = traditionalBlockWidth(),
    title = traditionalMassTitle(item.mass),
    parts = [`<rect x="${left}" y="${top}" width="${inner}" height="${layout.headerH}" fill="#3f66a3"/>`];
  parts.push(
    traditionalTextSvg(title, left + inner / 2, top + layout.headerH / 2, {
      size: traditionalFitSize(title, inner - 40, 30),
      weight: 700,
      fill: '#fff',
    }),
  );
  const namesTop = top + layout.headerH,
    rows = item.columns[0]?.rows.length || 0,
    // Un solo tamaño para los cuatro nombres: si cada uno se ajustara por su cuenta,
    // la fila quedaría con letras de distinto tamaño y se vería desordenada.
    nameSize = Math.min(...item.columns.map(column => traditionalFitSize(column.name, blockW - 16, 21)));
  item.columns.forEach((column, index) => {
    const x = left + index * (blockW + layout.colGap);
    parts.push(
      `<rect x="${x}" y="${namesTop}" width="${blockW}" height="${layout.nameH}" fill="#5d9bd3" stroke="#1d2733"/>`,
      traditionalTextSvg(column.name, x + blockW / 2, namesTop + layout.nameH / 2, {
        size: nameSize,
        weight: 700,
        fill: '#fff',
      }),
    );
    column.rows.forEach((row, rowIndex) => {
      const y = namesTop + layout.nameH + rowIndex * layout.rowH;
      parts.push(
        `<rect x="${x}" y="${y}" width="${blockW}" height="${layout.rowH}" fill="${rowIndex % 2 ? '#fff' : '#d9e3f3'}" stroke="#68717b"/>`,
        traditionalTextSvg(
          `${localDate(row.date).getDate()} ${months[localDate(row.date).getMonth()]}`,
          x + 10,
          y + layout.rowH / 2,
          { size: 18, anchor: 'start' },
        ),
        traditionalTextSvg(row.label, x + blockW - 10, y + layout.rowH / 2, {
          size: 19,
          weight: 700,
          anchor: 'end',
        }),
      );
    });
  });
  const reservesTop = namesTop + layout.nameH + rows * layout.rowH,
    reservesH = layout.reserveLabelH + traditionalReserveRows(item) * layout.reserveRowH + layout.reservePad;
  parts.push(
    `<rect x="${left}" y="${reservesTop}" width="${inner}" height="${reservesH}" fill="#eef2f8" stroke="#1d2733"/>`,
    traditionalTextSvg('Suplentes', left + 14, reservesTop + layout.reserveLabelH / 2, {
      size: 19,
      weight: 700,
      anchor: 'start',
    }),
  );
  if (item.reserves.length)
    item.reserves.forEach((name, index) => {
      const label = `${index + 1}. ${name}`,
        x = left + (index % 4) * (blockW + layout.colGap),
        y =
          reservesTop +
          layout.reserveLabelH +
          Math.floor(index / 4) * layout.reserveRowH +
          layout.reserveRowH / 2;
      parts.push(
        traditionalTextSvg(label, x + blockW / 2, y, {
          size: traditionalFitSize(label, blockW - 12, 18),
          weight: 700,
        }),
      );
    });
  else
    parts.push(
      traditionalTextSvg(
        'Sin suplentes asignados',
        left + inner / 2,
        reservesTop + layout.reserveLabelH + layout.reserveRowH / 2,
        { size: 18, fill: '#5c6670' },
      ),
    );
  return parts.join('');
}
function buildTraditionalSvg(items, fitToPage = false) {
  const layout = TRADITIONAL_LAYOUT,
    parts = [];
  let top = layout.pad;
  parts.push(
    traditionalTextSvg(TRADITIONAL_TITLE, layout.width / 2, top + 30, {
      size: traditionalFitSize(TRADITIONAL_TITLE, layout.width - layout.pad * 2, 38),
      weight: 700,
      fill: '#24405f',
    }),
    traditionalTextSvg(monthLabel(state.month), layout.width / 2, top + 74, {
      size: 27,
      weight: 700,
      fill: '#3f66a3',
    }),
  );
  top += layout.titleH;
  items.forEach((item, index) => {
    parts.push(traditionalSectionSvg(item, top));
    top += traditionalSectionHeight(item);
    if (index < items.length - 1) top += layout.massGap;
  });
  const height = Math.round(top + layout.pad);
  // Al imprimir se fija el tamaño en milímetros en vez de dejar que el navegador
  // escale al ancho: así el mes entero cabe siempre en una hoja, por alta que sea
  // la planificacion, en lugar de desbordar a una segunda pagina.
  const scale = Math.min(layout.pageWidthMm / layout.width, layout.pageHeightMm / height),
    size = fitToPage
      ? `width="${(layout.width * scale).toFixed(2)}mm" height="${(height * scale).toFixed(2)}mm"`
      : `width="${layout.width}" height="${height}"`;
  return `<svg xmlns="http://www.w3.org/2000/svg" ${size} viewBox="0 0 ${layout.width} ${height}"><rect width="${layout.width}" height="${height}" fill="#ffffff"/>${parts.join('')}</svg>`;
}
// La política de seguridad del servidor declara `img-src 'self' data:`, sin `blob:`,
// así que el SVG se entrega a la imagen como URL data: en base64. Se codifica por
// trozos porque pasar el arreglo completo a fromCharCode desborda la pila.
function traditionalSvgDataUrl(svg) {
  const bytes = new TextEncoder().encode(svg);
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000)
    binary += String.fromCharCode.apply(null, bytes.subarray(index, index + 0x8000));
  return 'data:image/svg+xml;base64,' + btoa(binary);
}
function printTraditionalReport() {
  const data = traditionalReportData();
  if (!data.length) return toast('No hay celebraciones para exportar', true);
  let target = $('#traditionalPrintPages');
  if (!target) {
    target = document.createElement('div');
    target.id = 'traditionalPrintPages';
    document.body.append(target);
  }
  target.innerHTML = `<div class="traditional-print-page">${buildTraditionalSvg(data, true)}</div>`;
  // La orientación se inyecta solo mientras se imprime: una regla @page fija en la
  // hoja de estilos afectaría también al PDF actual, que es vertical.
  const pageRule = document.createElement('style');
  pageRule.textContent = '@page{size:A4 portrait;margin:8mm}';
  document.head.append(pageRule);
  document.body.classList.add('print-traditional-svg');
  window.addEventListener(
    'afterprint',
    () => {
      document.body.classList.remove('print-traditional-svg');
      target.remove();
      pageRule.remove();
    },
    { once: true },
  );
  window.print();
}
function downloadTraditionalImage() {
  const data = traditionalReportData();
  if (!data.length) return toast('No hay celebraciones para exportar', true);
  const scale = 2,
    url = traditionalSvgDataUrl(buildTraditionalSvg(data)),
    image = new Image();
  image.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = image.width * scale;
    canvas.height = image.height * scale;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(blob => {
      if (!blob) return toast('No se pudo crear la imagen', true);
      const link = document.createElement('a'),
        objectUrl = URL.createObjectURL(blob);
      link.href = objectUrl;
      link.download = `lectores-formato-tradicional-${state.month}.png`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    }, 'image/png');
  };
  image.onerror = () => toast('No se pudo crear la imagen', true);
  image.src = url;
}

// Una sola maquetación para la vista previa, el PDF y el PNG de suplentes y
// lectores disponibles. Igual que en el formato tradicional, el SVG evita que
// las tres salidas se desincronicen y conserva texto vectorial en el PDF.
const AVAILABILITY_LAYOUT = {
  width: 1400,
  pad: 64,
  gap: 22,
  headerH: 250,
  pageWidthMm: 186,
  pageHeightMm: 273,
};

function availabilityReportData() {
  const assignments = state.assignments.filter(item => item.month === state.month);
  const titularIds = new Set(assignments.map(item => item.readerId).filter(Boolean));
  const substitutesByMass = new Map();
  assignments.forEach(item => {
    const ids = substitutesByMass.get(item.massId) || new Set();
    (item.substituteIds || []).forEach(readerId => {
      // El reporte nunca incluye titulares, incluso si un dato antiguo fuera inconsistente.
      if (!titularIds.has(readerId)) ids.add(readerId);
    });
    if (ids.size) substitutesByMass.set(item.massId, ids);
  });
  const substituteIds = new Set([...substitutesByMass.values()].flatMap(ids => [...ids]));
  const substituteGroups = state.masses
    .filter(mass => substitutesByMass.has(mass.id))
    .sort((a, b) =>
      `${occurrences(a)[0] || ''}${a.time}`.localeCompare(`${occurrences(b)[0] || ''}${b.time}`),
    )
    .map(mass => ({
      mass,
      readers: [...substitutesByMass.get(mass.id)]
        .map(readerId => ({ id: readerId, name: readerName(readerId) }))
        .sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' })),
    }));
  const activeMasses = state.masses.filter(mass => mass.active && occurrences(mass).length);
  const unassigned = state.readers
    .filter(reader => reader.active && !titularIds.has(reader.id) && !substituteIds.has(reader.id))
    .sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }))
    .map(reader => ({
      reader,
      preferred: activeMasses.filter(mass => readerPrefersMass(reader, mass.id)).map(mass => mass.name),
    }));
  return { titularIds, substituteIds, substituteGroups, unassigned };
}

function availabilityWrapText(text, maxWidth, size = 21, weight = 400) {
  if (!traditionalMeasureContext)
    traditionalMeasureContext = document.createElement('canvas').getContext('2d');
  traditionalMeasureContext.font = `${weight} ${size}px Arial`;
  const words = String(text).split(/\s+/),
    lines = [];
  let current = '';
  words.forEach(word => {
    const candidate = current ? `${current} ${word}` : word;
    if (current && traditionalMeasureContext.measureText(candidate).width > maxWidth) {
      lines.push(current);
      current = word;
    } else current = candidate;
  });
  if (current) lines.push(current);
  return lines.length ? lines : [''];
}

function availabilityLinesSvg(lines, x, y, options = {}) {
  const { size = 21, weight = 400, fill = '#526783', lineHeight = 29, anchor = 'start' } = options;
  return lines
    .map((line, index) => traditionalTextSvg(line, x, y + index * lineHeight, { size, weight, fill, anchor }))
    .join('');
}

function buildAvailabilityReportSvg(data, fitToPage = false) {
  const width = 1600,
    pad = 24,
    inner = width - pad * 2;
  const parts = [];
  let top = 134;
  const text = (value, x, y, maxWidth, size = 23, fill = '#111', weight = 400, anchor = 'start') =>
    traditionalTextSvg(value, x, y, {
      size: traditionalFitSize(value, maxWidth, size, weight),
      fill,
      weight,
      anchor,
    });
  const rect = (x, y, w, h, fill) =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" stroke="#68717b"/>`;
  parts.push(
    text(TRADITIONAL_TITLE, width / 2, 42, inner, 38, '#24405f', 700, 'middle'),
    text(monthLabel(state.month), width / 2, 82, inner, 28, '#3f66a3', 700, 'middle'),
    text('Suplentes y lectores sin asignación', width / 2, 113, inner, 23, '#24405f', 700, 'middle'),
  );
  const heading = label => {
    parts.push(
      rect(pad, top, inner, 54, '#3f66a3'),
      text(label, width / 2, top + 27, inner - 24, 28, '#fff', 700, 'middle'),
    );
    top += 54;
  };
  const row = (cells, widths, fill = '#d9e3f3', header = false) => {
    const lines = cells.map((value, i) =>
      availabilityWrapText(value, widths[i] - 28, 22, header ? 700 : 400),
    );
    const height = Math.max(46, 18 + Math.max(...lines.map(list => list.length)) * 29);
    let x = pad;
    cells.forEach((value, i) => {
      parts.push(rect(x, top, widths[i], height, fill));
      lines[i].forEach((line, j) =>
        parts.push(
          text(
            line,
            x + 14,
            top + 24 + j * 29,
            widths[i] - 28,
            22,
            header ? '#fff' : '#111',
            header ? 700 : 400,
          ),
        ),
      );
      x += widths[i];
    });
    top += height;
  };
  heading('SUPLENTES ASIGNADOS POR MISA');
  if (!data.substituteGroups.length) row(['Sin suplentes asignados durante este mes.'], [inner], '#eef2f8');
  data.substituteGroups.forEach(group => {
    row([`${group.mass.name} · ${massSchedule(group.mass)}`], [inner], '#5d9bd3', true);
    group.readers.forEach((reader, index) =>
      row([`${index + 1}. ${reader.name}`], [inner], index % 2 ? '#fff' : '#d9e3f3'),
    );
  });
  top += 24;
  heading('LECTORES SIN ASIGNACIÓN');
  const columns = [inner * 0.34, inner * 0.19, inner * 0.47];
  row(['Lector', 'Condición', 'Misas preferidas'], columns, '#5d9bd3', true);
  if (!data.unassigned.length)
    row(['Todos los lectores activos tienen asignación este mes.'], [inner], '#eef2f8');
  data.unassigned.forEach((item, index) =>
    row(
      [
        item.reader.name,
        item.reader.substituteOnly ? 'Solo suplente' : 'Lector normal',
        item.preferred.join(' · ') || 'Ninguna misa',
      ],
      columns,
      index % 2 ? '#fff' : '#d9e3f3',
    ),
  );
  top += 30;
  parts.push(
    text('Este reporte no incluye lectores titulares.', width / 2, top, inner, 18, '#60748e', 400, 'middle'),
  );
  const height = Math.ceil(top + pad);
  const scale = Math.min(AVAILABILITY_LAYOUT.pageWidthMm / width, AVAILABILITY_LAYOUT.pageHeightMm / height);
  const size = fitToPage
    ? `width="${(width * scale).toFixed(2)}mm" height="${(height * scale).toFixed(2)}mm"`
    : `width="${width}" height="${height}"`;
  return `<svg xmlns="http://www.w3.org/2000/svg" ${size} viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="#fff"/>${parts.join('')}</svg>`;
}

function renderAvailabilityReport() {
  const target = $('#availabilityReport');
  if (!target) return;
  target.innerHTML = buildAvailabilityReportSvg(availabilityReportData());
}

function printAvailabilityReport() {
  const target = document.createElement('div');
  target.id = 'availabilityPrintReport';
  target.innerHTML = buildAvailabilityReportSvg(availabilityReportData(), true);
  document.body.append(target);
  const pageRule = document.createElement('style');
  pageRule.textContent = '@page{size:A4 portrait;margin:12mm}';
  document.head.append(pageRule);
  document.body.classList.add('print-availability-report');
  window.addEventListener(
    'afterprint',
    () => {
      document.body.classList.remove('print-availability-report');
      target.remove();
      pageRule.remove();
    },
    { once: true },
  );
  window.print();
}

function downloadAvailabilityImage() {
  const svg = buildAvailabilityReportSvg(availabilityReportData()),
    image = new Image();
  image.onload = () => {
    const scale = 2,
      canvas = document.createElement('canvas');
    canvas.width = image.width * scale;
    canvas.height = image.height * scale;
    const context = canvas.getContext('2d');
    context.fillStyle = '#f3f6fb';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(blob => {
      if (!blob) return toast('No se pudo crear la imagen', true);
      const link = document.createElement('a'),
        objectUrl = URL.createObjectURL(blob);
      link.href = objectUrl;
      link.download = `suplentes-y-disponibles-${state.month}.png`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    }, 'image/png');
  };
  image.onerror = () => toast('No se pudo crear la imagen', true);
  image.src = traditionalSvgDataUrl(svg);
}
