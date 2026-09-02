document.addEventListener('click', async e => {
  const go = e.target.closest('[data-view]');
  if (go) {
    showView(go.dataset.view);
    return;
  }
  const confirmation = e.target.closest('.confirm-reader,.decline-reader');
  if (confirmation) {
    pendingConfirmation = {
      id: confirmation.dataset.id,
      action: confirmation.classList.contains('confirm-reader') ? 'confirm' : 'decline',
    };
    const isConfirm = pendingConfirmation.action === 'confirm';
    $('#confirmationActionTitle').textContent = isConfirm
      ? '¿Está seguro de que desea confirmar la misa?'
      : '¿Está seguro de que no podrá asistir?';
    $('#confirmationActionCopy').textContent = isConfirm
      ? 'Se registrará su asistencia a esta misa.'
      : 'Se retirará su asignación y se intentará llamar al siguiente suplente.';
    $('#confirmationActionDialog').showModal();
    return;
  }
  if (e.target.closest('#menuBtn')) $('.sidebar').classList.toggle('open');
  const reportButton = e.target.closest('.open-eucharist-report');
  if (reportButton) {
    openEucharistReport(reportButton.dataset.mass, reportButton.dataset.date);
    return;
  }
  const passwordButton = e.target.closest('.change-reader-password');
  if (passwordButton) {
    const form = $('#readerPasswordForm');
    form.reset();
    clearFormError(form);
    form.elements.id.value = passwordButton.dataset.id;
    $('#readerPasswordName').textContent = passwordButton.dataset.name;
    $('#readerPasswordDialog').showModal();
    return;
  }
  const selfEditButton = e.target.closest('.self-edit-reader');
  if (selfEditButton) {
    openSelfEditAccess(selfEditButton.dataset.id, selfEditButton.dataset.name);
    return;
  }
  const resetPasswordButton = e.target.closest('.reset-reader-password');
  if (resetPasswordButton) {
    if (
      !confirm(
        `¿Invalidar la contraseña actual de ${resetPasswordButton.dataset.name} y generar una temporal nueva?`,
      )
    )
      return;
    try {
      const result = await request(`/api/readers/${resetPasswordButton.dataset.id}/reset-password`, {
        method: 'POST',
        body: '{}',
      });
      showTemporaryPassword(resetPasswordButton.dataset.name, result.temporaryPassword);
      await load();
    } catch (error) {
      toast(error.message, true);
    }
    return;
  }
  if (e.target.closest('#copyTemporaryPassword')) {
    const input = $('#temporaryPasswordValue'),
      form = input.closest('form');
    try {
      await navigator.clipboard.writeText(input.value);
      showFormMessage(form, 'Contraseña copiada');
    } catch {
      input.select();
      showFormMessage(form, 'Contraseña seleccionada para copiar');
    }
    return;
  }
  if (e.target.closest('#logoutBtn')) {
    sessionStorage.removeItem('admin_access_verified');
    await request('/api/auth/logout', { method: 'POST' });
    return location.replace('/');
  }
  if (
    !isAdmin &&
    e.target.closest(
      '#newReader,#newMass,#randomAssign,#fillUnassigned,.edit-reader,.edit-mass,.delete-reader,.delete-mass,.reset-reader-password',
    )
  )
    return;
  if (e.target.closest('#newReader')) openReader();
  if (e.target.closest('#newMass')) openMass();
  if (e.target.closest('#randomAssign')) {
    if (
      !confirm(
        `¿Reemplazar las asignaciones de ${monthLabel(state.month)} y generar titulares y suplentes según disponibilidad?`,
      )
    )
      return;
    const button = e.target.closest('#randomAssign'),
      label = button.textContent;
    button.disabled = true;
    button.textContent = 'Generando…';
    try {
      await request('/api/random-assignments', {
        method: 'POST',
        body: JSON.stringify({ month: state.month }),
      });
      toast('Titulares y suplentes generados');
      await load();
    } catch (x) {
      toast(x.message, true);
    } finally {
      button.disabled = false;
      button.textContent = label;
    }
  }
  if (e.target.closest('#fillUnassigned')) {
    if (
      !confirm(
        `¿Completar únicamente las funciones sin asignar de ${monthLabel(state.month)}? Las asignaciones actuales se conservarán.`,
      )
    )
      return;
    const button = e.target.closest('#fillUnassigned'),
      label = button.textContent;
    button.disabled = true;
    button.textContent = 'Completando…';
    try {
      const result = await request('/api/fill-unassigned', {
        method: 'POST',
        body: JSON.stringify({ month: state.month }),
      });
      const detail = result.remaining ? ` Quedaron ${result.remaining} puestos sin lector disponible.` : '';
      toast(`Se completaron ${result.filled} puestos.${detail}`);
      await load();
    } catch (x) {
      toast(x.message, true);
    } finally {
      button.disabled = false;
      button.textContent = label;
    }
  }
  if (e.target.closest('.close')) e.target.closest('dialog').close();
  const er = e.target.closest('.edit-reader');
  if (er) openReader(state.readers.find(x => x.id === er.dataset.id));
  const em = e.target.closest('.edit-mass');
  if (em) openMass(state.masses.find(x => x.id === em.dataset.id));
  const del = e.target.closest('.delete-reader,.delete-mass');
  if (del) {
    const resource = del.classList.contains('delete-reader') ? 'readers' : 'masses';
    if (confirm('¿Eliminar este registro y sus asignaciones?')) {
      try {
        await request(`/api/${resource}/${del.dataset.id}`, { method: 'DELETE' });
        toast('Registro eliminado');
        await load();
      } catch (x) {
        toast(x.message, true);
      }
    }
  }
  if (e.target.closest('#printReport')) {
    document.body.classList.remove('print-traditional');
    window.print();
  }
  if (e.target.closest('#printTraditionalReport')) printTraditionalReport();
  if (e.target.closest('#downloadTraditionalImage')) downloadTraditionalImage();
});
$('#upcoming').addEventListener('change', async e => {
  if (!e.target.matches('.admin-replacement') || !e.target.value) return;
  const { id, mass, role, date } = e.target.dataset;
  try {
    await request(`/api/replacement/${id || 'new'}`, {
      method: 'POST',
      body: JSON.stringify({ readerId: e.target.value, massId: mass, role, date, month: date.slice(0, 7) }),
    });
    toast('Lector asignado; queda pendiente de confirmar');
    await load();
  } catch (x) {
    toast(x.message, true);
  }
});
function openReader(r = {}, selfMode = false) {
  const f = $('#readerForm'),
    x = f.elements,
    availability = $('#readerAvailability'),
    fieldset = availability.closest('fieldset');
  f.reset();
  clearFormMessage(f);
  x.id.value = r.id || '';
  x.name.value = r.name || '';
  x.phone.value = r.phone || '';
  x.notes.value = r.notes || '';
  x.active.checked = r.active !== false;
  x.active.closest('label').hidden = selfMode;
  x.substituteOnly.checked = r.substituteOnly === true;
  fieldset.querySelector('legend').textContent = 'Preferencia por misa';
  let help = fieldset.querySelector('.mass-preference-help');
  if (!help) {
    help = document.createElement('p');
    help.className = 'hint mass-preference-help';
    fieldset.querySelector('legend').after(help);
  }
  help.textContent =
    'Elige una opción por horario. “Puedo asistir” se usará cuando falten personas en las misas preferidas.';
  availability.innerHTML =
    state.masses
      .filter(m => m.active)
      .map(m => {
        const value = !r.id
          ? 'flexible'
          : readerPrefersMass(r, m.id)
            ? 'preferred'
            : readerCanServeMass(r, m.id)
              ? 'flexible'
              : 'unavailable';
        return `<div class="mass-preference-row"><b>${esc(massSchedule(m))}</b><div class="mass-preference-options"><label><input type="radio" name="massPreference_${esc(m.id)}" data-mass-preference="${esc(m.id)}" value="preferred" ${value === 'preferred' ? 'checked' : ''}> Preferida</label><label><input type="radio" name="massPreference_${esc(m.id)}" data-mass-preference="${esc(m.id)}" value="flexible" ${value === 'flexible' ? 'checked' : ''}> Puedo asistir</label><label><input type="radio" name="massPreference_${esc(m.id)}" data-mass-preference="${esc(m.id)}" value="unavailable" ${value === 'unavailable' ? 'checked' : ''}> No puedo asistir</label></div></div>`;
      })
      .join('') || '<span class="hint">Primero agrega una misa activa.</span>';
  $('#readerDialogTitle').textContent = selfMode
    ? 'Editar mis datos'
    : r.id
      ? 'Editar lector'
      : 'Nuevo lector';
  $('#readerDialog').showModal();
}
function openMass(m = {}) {
  const f = $('#massForm'),
    x = f.elements;
  f.reset();
  clearFormMessage(f);
  x.id.value = m.id || '';
  x.name.value = m.name || '';
  x.time.value = m.time || '';
  x.type.value = m.type || 'weekly';
  x.weekday.value = m.weekday ?? 0;
  x.date.value = m.date || '';
  x.roles.value = (m.roles || ['Primera lectura', 'Segunda lectura', 'Salmo', 'Moniciones']).join(', ');
  x.active.checked = m.active !== false;
  toggleMassType();
  $('#massDialogTitle').textContent = m.id ? 'Editar misa' : 'Nueva misa';
  $('#massDialog').showModal();
}
function toggleMassType() {
  const f = $('#massForm').elements,
    once = f.type.value === 'once';
  $('#dateField').hidden = !once;
  $('#weekdayField').hidden = once;
  f.date.required = once;
}
$('#massForm').elements.type.addEventListener('change', toggleMassType);
$('#readerForm').addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.currentTarget,
    x = f.elements,
    id = x.id.value,
    preferences = $$('input[data-mass-preference]:checked', f),
    preferredMassIds = preferences
      .filter(input => input.value === 'preferred')
      .map(input => input.dataset.massPreference),
    unavailableMassIds = preferences
      .filter(input => input.value === 'unavailable')
      .map(input => input.dataset.massPreference),
    payload = {
      name: x.name.value,
      phone: x.phone.value,
      notes: x.notes.value,
      preferredMassIds,
      unavailableMassIds,
      active: x.active.checked,
      substituteOnly: x.substituteOnly.checked,
    };
  clearFormMessage(f);
  try {
    let result;
    if (selfEditingReader && selfEditingReader.id === id) {
      result = await request(`/api/readers/${id}/profile`, {
        method: 'POST',
        body: JSON.stringify({ password: selfEditingReader.password, profile: payload }),
      });
      selfEditingReader = null;
    } else
      result = await request(`/api/readers${id ? '/' + id : ''}`, {
        method: id ? 'PUT' : 'POST',
        body: JSON.stringify(payload),
      });
    f.closest('dialog').close();
    if (!id && result.temporaryPassword) showTemporaryPassword(payload.name, result.temporaryPassword);
    else toast('Lector guardado');
    await load();
  } catch (x) {
    showFormError(f, x.message);
  }
});
$('#readerPasswordForm').addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.currentTarget,
    x = f.elements;
  clearFormError(f);
  if (x.newPassword.value !== x.confirmPassword.value) {
    showFormError(f, 'Las contraseñas nuevas no coinciden');
    return;
  }
  try {
    await request(`/api/readers/${x.id.value}/password`, {
      method: 'POST',
      body: JSON.stringify({
        currentPassword: x.currentPassword.value,
        newPassword: x.newPassword.value,
        confirmPassword: x.confirmPassword.value,
      }),
    });
    f.closest('dialog').close();
    f.reset();
    toast('Contraseña actualizada');
  } catch (error) {
    showFormError(f, error.message);
    x.currentPassword.select();
  }
});
$('#acceptConfirmationAction').addEventListener('click', () => {
  if (!pendingConfirmation) return;
  $('#confirmationActionDialog').close();
  const form = $('#confirmationPasswordForm');
  form.reset();
  clearFormError(form);
  $('#confirmationPasswordTitle').textContent =
    pendingConfirmation.action === 'confirm' ? 'Confirmar asistencia' : 'Indicar que no puedes asistir';
  $('#confirmationPasswordDialog').showModal();
  form.elements.password.focus();
});
$('#confirmationPasswordForm').addEventListener('submit', async e => {
  e.preventDefault();
  if (!pendingConfirmation) return;
  const f = e.currentTarget,
    { id, action } = pendingConfirmation;
  clearFormError(f);
  try {
    await request(`/api/confirmations/${id}`, {
      method: 'POST',
      body: JSON.stringify({ action, password: f.elements.password.value }),
    });
    f.closest('dialog').close();
    f.reset();
    pendingConfirmation = null;
    toast(action === 'confirm' ? 'Asistencia confirmada' : 'Se asignó el siguiente suplente');
    await load();
  } catch (error) {
    showFormError(f, error.message);
    f.elements.password.select();
  }
});
function openEucharistReport(massId, date) {
  const mass = state.masses.find(item => item.id === massId);
  if (!mass || !hasMassEnded(date, mass.time))
    return toast('El reporte estará disponible una hora después del inicio de la misa', true);
  const assignedReader = role =>
      state.assignments.find(item => item.massId === mass.id && item.role === role && item.date === date)
        ?.readerId,
    isMonitorRole = role => /monici|monitor/i.test(role.normalize('NFD').replace(/[\u0300-\u036f]/g, '')),
    monitorRole = mass.roles.find(isMonitorRole),
    reportRoles = mass.roles.filter(role => !isMonitorRole(role));
  const form = $('#eucharistReportForm');
  form.reset();
  clearFormMessage(form);
  form.elements.massId.value = mass.id;
  form.elements.date.value = date;
  $('#eucharistReportHeading').textContent = mass.name;
  $('#eucharistReportSchedule').textContent = `${formatDate(date)} · ${mass.time}`;
  $('#eucharistRoleFields').innerHTML = reportRoles
    .map(
      role =>
        `<label>${esc(role)}<input class="eucharist-role" data-role="${esc(role)}" value="${esc(readerName(assignedReader(role)))}" required></label>`,
    )
    .join('');
  form.elements.monitor.value = monitorRole ? readerName(assignedReader(monitorRole)) : '';
  $('#eucharistReportDialog').showModal();
}
function eucharistReportText() {
  const form = $('#eucharistReportForm');
  if (!form.reportValidity()) return null;
  const mass = state.masses.find(item => item.id === form.elements.massId.value);
  const lines = [
    `📖 *Reporte de Eucaristía*`,
    ``,
    `⛪ ${mass?.name || 'Eucaristía'}`,
    `📅 ${formatDate(form.elements.date.value)} · ${mass?.time || ''}`,
    '',
  ];
  $$('.eucharist-role', form).forEach(input => lines.push(`*${input.dataset.role}:* ${input.value.trim()}`));
  lines.push(
    `*Sacerdote:* ${form.elements.priest.value.trim()}`,
    `*Monitor:* ${form.elements.monitor.value.trim()}`,
  );
  if (form.elements.note.value.trim()) lines.push('', `*Nota:* ${form.elements.note.value.trim()}`);
  if (form.elements.reflection.value.trim())
    lines.push('', `*Reflexión:* ${form.elements.reflection.value.trim()}`);
  return lines.join('\n');
}
function showReportCopiedDialog() {
  let dialog = $('#reportCopiedDialog');
  if (!dialog) {
    dialog = document.createElement('dialog');
    dialog.id = 'reportCopiedDialog';
    dialog.innerHTML =
      '<form method="dialog"><div class="dialog-head"><div><p class="eyebrow">REPORTE DE EUCARISTÍA</p><h3>Reporte copiado</h3></div></div><p>Ya puedes pegarlo en WhatsApp.</p><div class="actions"><button class="primary" value="close" autofocus>Aceptar</button></div></form>';
    document.body.append(dialog);
  }
  dialog.showModal();
}
$('#copyEucharistReport').addEventListener('click', async () => {
  const text = eucharistReportText();
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    document.body.append(area);
    area.select();
    document.execCommand('copy');
    area.remove();
  }
  showReportCopiedDialog();
});
$('#shareEucharistReport').addEventListener('click', () => {
  const text = eucharistReportText();
  if (!text) return;
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
});
$('#massForm').addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.currentTarget,
    x = f.elements,
    id = x.id.value,
    payload = {
      name: x.name.value,
      time: x.time.value,
      type: x.type.value,
      weekday: +x.weekday.value,
      date: x.date.value,
      roles: x.roles.value
        .split(',')
        .map(v => v.trim())
        .filter(Boolean),
      active: x.active.checked,
    };
  clearFormMessage(f);
  try {
    await request(`/api/masses${id ? '/' + id : ''}`, {
      method: id ? 'PUT' : 'POST',
      body: JSON.stringify(payload),
    });
    f.closest('dialog').close();
    toast('Misa guardada');
    await load();
  } catch (x) {
    showFormError(f, x.message);
  }
});
function chooseAssignmentScope(select) {
  const dialog = $('#assignmentScopeDialog');
  if (!dialog) return Promise.resolve('single');
  const previousName = readerName(select.dataset.reader),
    nextName = readerName(select.value);
  $('#assignmentScopeCopy').textContent = select.value
    ? select.dataset.reader
      ? `Reemplazarás a ${previousName} por ${nextName}. Si eliges las fechas restantes, el reemplazo seguirá las apariciones posteriores de ${previousName} en esta misa.`
      : `Asignarás a ${nextName}. Si eliges las fechas restantes, también ocupará un puesto sin asignar en cada celebración posterior de esta misa.`
    : `Quitarás a ${previousName}. Si eliges las fechas restantes, se eliminarán sus apariciones posteriores en esta misa, aunque cambie de función.`;
  dialog.showModal();
  return new Promise(resolve => {
    let settled = false;
    const finish = scope => {
      if (settled) return;
      settled = true;
      dialog.removeEventListener('close', cancel);
      if (dialog.open) dialog.close();
      resolve(scope);
    };
    const cancel = () => finish(null);
    $('#singleAssignmentScope').onclick = () => finish('single');
    $('#remainingAssignmentScope').onclick = () => finish('remaining');
    $('#cancelAssignmentScope').onclick = cancel;
    dialog.addEventListener('close', cancel, { once: true });
  });
}
$('#assignmentBoard')?.addEventListener('change', async e => {
  if (!e.target.matches('.assign-select')) return;
  const select = e.target,
    { mass, role, date, reader: previousReaderId } = select.dataset;
  const scope = await chooseAssignmentScope(select);
  if (!scope) {
    select.value = previousReaderId;
    return;
  }
  try {
    const result = await request('/api/assignment-change', {
      method: 'POST',
      body: JSON.stringify({
        massId: mass,
        role,
        date,
        month: state.month,
        readerId: select.value,
        previousReaderId,
        scope,
      }),
    });
    const detail = scope === 'remaining' && result.changed > 1 ? ` en ${result.changed} celebraciones` : '';
    toast(`Asignación actualizada${detail}`);
    await load();
  } catch (x) {
    toast(x.message, true);
    await load();
  }
});
$('#assignmentBoard')?.addEventListener('change', async e => {
  if (!e.target.matches('.substitute-select')) return;
  const group = e.target.closest('.date-reserves'),
    substituteIds = [...group.querySelectorAll('.substitute-select')]
      .map(select => select.value)
      .filter((id, index, all) => id && all.indexOf(id) === index);
  try {
    await request('/api/substitutes', {
      method: 'POST',
      body: JSON.stringify({ massId: group.dataset.mass, date: group.dataset.date, substituteIds }),
    });
    toast('Lista de suplentes actualizada');
    await load();
  } catch (x) {
    toast(x.message, true);
  }
});
$('#month').value = state.month;
$('#month').addEventListener('change', e => {
  state.month = e.target.value || state.month;
  load();
});
$('#assignmentReaderFilter')?.addEventListener('change', e => {
  assignmentReaderFilter = e.target.value;
  renderAssignments();
  if (!isAdmin)
    $$('.assign-select').forEach(select => {
      select.disabled = true;
    });
});
$('#readerListFilter')?.addEventListener('change', e => {
  readerListFilter = e.target.value;
  renderReaders();
});
$('#clearReaderListFilter')?.addEventListener('click', () => {
  readerListFilter = '';
  renderReaders();
});
$('#assignmentMassFilter')?.addEventListener('change', e => {
  assignmentMassFilter = e.target.value;
  renderAssignments();
  if (!isAdmin)
    $$('.assign-select').forEach(select => {
      select.disabled = true;
    });
});
$('#clearAssignmentReaderFilter')?.addEventListener('click', () => {
  assignmentReaderFilter = '';
  assignmentMassFilter = '';
  renderAssignments();
  if (!isAdmin)
    $$('.assign-select').forEach(select => {
      select.disabled = true;
    });
});
$('#coverageMass')?.addEventListener('change', event => {
  coverageMassId = event.target.value;
  renderCoverage();
});
$('#coverageSearch')?.addEventListener('input', event => {
  coverageSearch = event.target.value;
  renderCoverage();
});
showView(initialView);
load();
