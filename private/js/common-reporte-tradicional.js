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
        reserves: Array.from({ length: 4 }, (_, index) =>
          reserves[index] ? readerName(reserves[index]) : 'Sin asignar',
        ),
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
  target.innerHTML = data.length
    ? data
        .map(
          ({ mass, columns, reserves }) =>
            `<section class="traditional-mass"><h3>${esc(traditionalMassTitle(mass))}</h3><div class="traditional-columns">${columns.map(column => `<div class="traditional-column"><h4>${esc(column.name)}</h4>${column.rows.map(row => `<div><span>${esc(`${localDate(row.date).getDate()} ${months[localDate(row.date).getMonth()]}`)}</span><b>${esc(row.label)}</b></div>`).join('')}</div>`).join('')}</div><div class="traditional-reserves"><b>Suplentes:</b>${reserves.map((name, index) => `<span>${index + 1}. ${esc(name)}</span>`).join('')}</div></section>`,
        )
        .join('')
    : '<p class="empty">No hay celebraciones para este mes.</p>';
}
function drawFittedText(ctx, text, x, y, maxWidth, fontSize = 22) {
  let size = fontSize;
  do {
    ctx.font = `700 ${size}px Arial`;
    if (ctx.measureText(text).width <= maxWidth) break;
    size--;
  } while (size > 12);
  ctx.fillText(text, x, y);
}
function createTraditionalCanvas() {
  const data = traditionalReportData();
  if (!data.length) return null;
  const width = 1600,
    margin = 2,
    headerH = 54,
    nameH = 42,
    rowH = 38,
    reserveH = 66,
    gap = 18,
    sectionH =
      headerH +
      nameH +
      Math.max(...data.flatMap(item => item.columns.map(column => column.rows.length))) * rowH +
      reserveH,
    height = margin * 2 + data.length * sectionH + (data.length - 1) * gap,
    canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, width, height);
  ctx.textBaseline = 'middle';
  let top = margin;
  for (const item of data) {
    const rows = item.columns[0]?.rows.length || 0,
      colW = (width - margin * 2) / 4;
    ctx.fillStyle = '#3f66a3';
    ctx.fillRect(margin, top, width - margin * 2, headerH);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    drawFittedText(ctx, traditionalMassTitle(item.mass), width / 2, top + headerH / 2, width - 40, 30);
    top += headerH;
    item.columns.forEach((column, index) => {
      const x = margin + index * colW;
      ctx.fillStyle = '#5d9bd3';
      ctx.fillRect(x, top, colW, nameH);
      ctx.strokeStyle = '#1d2733';
      ctx.strokeRect(x, top, colW, nameH);
      ctx.fillStyle = '#fff';
      drawFittedText(ctx, column.name, x + colW / 2, top + nameH / 2, colW - 16, 20);
      column.rows.forEach((row, rowIndex) => {
        const y = top + nameH + rowIndex * rowH;
        ctx.fillStyle = rowIndex % 2 ? '#fff' : '#d9e3f3';
        ctx.fillRect(x, y, colW, rowH);
        ctx.strokeStyle = '#68717b';
        ctx.strokeRect(x, y, colW, rowH);
        ctx.fillStyle = '#111';
        ctx.textAlign = 'left';
        ctx.font = '18px Arial';
        ctx.fillText(
          `${localDate(row.date).getDate()} ${months[localDate(row.date).getMonth()]}`,
          x + 8,
          y + rowH / 2,
        );
        ctx.textAlign = 'right';
        ctx.font = '19px Arial';
        ctx.fillText(row.label, x + colW - 8, y + rowH / 2);
      });
    });
    top += nameH + rows * rowH;
    ctx.fillStyle = '#eef2f8';
    ctx.fillRect(margin, top, width - margin * 2, reserveH);
    ctx.strokeStyle = '#1d2733';
    ctx.strokeRect(margin, top, width - margin * 2, reserveH);
    ctx.fillStyle = '#111';
    ctx.textAlign = 'left';
    ctx.font = '700 19px Arial';
    ctx.fillText('Suplentes:', margin + 12, top + reserveH / 2);
    const reserveStart = margin + 125,
      reserveW = (width - reserveStart - margin) / 4;
    item.reserves.forEach((name, index) => {
      ctx.textAlign = 'center';
      drawFittedText(
        ctx,
        `${index + 1}. ${name}`,
        reserveStart + index * reserveW + reserveW / 2,
        top + reserveH / 2,
        reserveW - 12,
        17,
      );
    });
    top += reserveH + gap;
  }
  return canvas;
}
function downloadTraditionalImage() {
  const canvas = createTraditionalCanvas();
  if (!canvas) return toast('No hay celebraciones para exportar', true);
  canvas.toBlob(blob => {
    if (!blob) return toast('No se pudo crear la imagen', true);
    const url = URL.createObjectURL(blob),
      link = document.createElement('a');
    link.href = url;
    link.download = `lectores-formato-tradicional-${state.month}.png`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, 'image/png');
}
function printTraditionalImage() {
  const canvas = createTraditionalCanvas();
  if (!canvas) return toast('No hay celebraciones para exportar', true);
  let target = $('#traditionalPrintImage');
  if (!target) {
    target = document.createElement('div');
    target.id = 'traditionalPrintImage';
    document.body.append(target);
  }
  target.innerHTML = '';
  const image = document.createElement('img');
  image.alt = `Programación tradicional de ${monthLabel(state.month)}`;
  target.append(image);
  document.body.classList.add('print-traditional-image');
  let opened = false;
  const openPrint = () => {
    if (opened) return;
    opened = true;
    window.addEventListener(
      'afterprint',
      () => {
        document.body.classList.remove('print-traditional-image');
        target.remove();
      },
      { once: true },
    );
    window.print();
  };
  image.onload = openPrint;
  image.src = canvas.toDataURL('image/png');
  if (image.complete) setTimeout(openPrint, 0);
}
