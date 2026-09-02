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
