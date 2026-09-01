// Solo se piden los meses que la interfaz puede mostrar: el seleccionado y el actual, con sus vecinos.
function neededMonths() {
  const shift = (month, delta) => {
    const [year, number] = month.split('-').map(Number);
    const moved = new Date(year, number - 1 + delta, 1);
    return `${moved.getFullYear()}-${String(moved.getMonth() + 1).padStart(2, '0')}`;
  };
  const current = costaRicaToday().slice(0, 7);
  return [
    ...new Set([
      shift(state.month, -1),
      state.month,
      shift(state.month, 1),
      shift(current, -1),
      current,
      shift(current, 1),
    ]),
  ];
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
    [state.readers, state.masses, state.assignments, state.news] = await Promise.all(
      ['/api/readers', '/api/masses', `/api/assignments?months=${neededMonths().join(',')}`, '/api/news'].map(
        x => request(x),
      ),
    );
    render();
    if (!newsRefreshTimer)
      newsRefreshTimer = setInterval(async () => {
        try {
          state.news = await request('/api/news');
          renderNewsCarousel();
        } catch {}
      }, 60_000);
  } catch (error) {
    toast(error.message, true);
  }
}
function occurrences(mass, month = state.month) {
  const [year, mon] = month.split('-').map(Number);
  if (!mass.active) return [];
  if (mass.type === 'once') return mass.date?.startsWith(month) ? [mass.date] : [];
  const result = [],
    last = new Date(year, mon, 0).getDate();
  for (let d = 1; d <= last; d++) {
    const date = new Date(year, mon - 1, d);
    if (date.getDay() === mass.weekday) result.push(isoDate(date));
  }
  return result;
}
function assignment(massId, role, date) {
  return (
    state.assignments.find(
      x => x.massId === massId && x.role === role && x.month === state.month && x.date === date,
    ) ||
    state.assignments.find(x => x.massId === massId && x.role === role && x.month === state.month && !x.date)
  );
}
function readerName(id) {
  return state.readers.find(x => x.id === id)?.name || 'Sin asignar';
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
function readerMassPreferences(reader) {
  const activeMasses = state.masses.filter(mass => mass.active);
  return {
    preferred: activeMasses.filter(mass => readerPrefersMass(reader, mass.id)).map(massSchedule),
    flexible: activeMasses
      .filter(mass => readerCanServeMass(reader, mass.id) && !readerPrefersMass(reader, mass.id))
      .map(massSchedule),
    unavailable: activeMasses.filter(mass => !readerCanServeMass(reader, mass.id)).map(massSchedule),
  };
}
function allEvents() {
  return state.masses
    .flatMap(mass => occurrences(mass).map(date => ({ mass, date })))
    .sort((a, b) => `${a.date}${a.mass.time}`.localeCompare(`${b.date}${b.mass.time}`));
}
function currentWeekEvents() {
  const today = localDate(costaRicaToday()),
    monday = new Date(today);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const months = [...new Set([isoDate(monday).slice(0, 7), isoDate(sunday).slice(0, 7)])];
  return state.masses
    .flatMap(mass => months.flatMap(month => occurrences(mass, month).map(date => ({ mass, date }))))
    .filter(event => localDate(event.date) >= monday && localDate(event.date) <= sunday)
    .sort((a, b) => `${a.date}${a.mass.time}`.localeCompare(`${b.date}${b.mass.time}`));
}
