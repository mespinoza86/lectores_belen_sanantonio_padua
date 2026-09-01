function emptyCard(title, copy) {
  return `<article class="card"><h3>${title}</h3><p>${copy}</p></article>`;
}
function formatDate(iso) {
  if (!iso) return '';
  return localDate(iso)
    .toLocaleDateString('es-CR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    .replace(/^./, x => x.toUpperCase());
}
function toast(message, error = false) {
  const t = $('#toast');
  t.textContent = message;
  t.style.background = error ? '#8c4545' : '';
  t.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove('show'), 2800);
}
function clearFormMessage(form) {
  form?.querySelector('.form-message')?.remove();
}
function clearFormError(form) {
  clearFormMessage(form);
}
function showFormMessage(form, message, isError = false) {
  clearFormMessage(form);
  const error = document.createElement('p');
  error.className = `form-message${isError ? ' form-error' : ' form-success'}`;
  error.setAttribute('role', isError ? 'alert' : 'status');
  error.setAttribute('aria-live', 'polite');
  error.textContent = message;
  const actions = form.querySelector('.actions');
  if (actions) actions.before(error);
  else form.append(error);
}
function showFormError(form, message) {
  showFormMessage(form, message, true);
}
function showTemporaryPassword(readerNameValue, password) {
  let dialog = $('#temporaryPasswordDialog');
  if (!dialog) {
    dialog = document.createElement('dialog');
    dialog.id = 'temporaryPasswordDialog';
    dialog.innerHTML =
      '<form method="dialog"><div class="dialog-head"><div><p class="eyebrow">CREDENCIAL TEMPORAL</p><h3>Contraseña creada</h3></div><button class="icon-btn close" type="button">×</button></div><p id="temporaryPasswordReader"></p><label>Contraseña temporal<input id="temporaryPasswordValue" readonly></label><p class="hint">Cópiala ahora y entrégala de forma privada. No podrá volver a consultarse y el lector deberá cambiarla antes de confirmar una asignación.</p><div class="actions"><button class="secondary" id="copyTemporaryPassword" type="button">Copiar</button><button class="primary" value="close">Entendido</button></div></form>';
    document.body.append(dialog);
  }
  $('#temporaryPasswordReader').textContent = readerNameValue;
  $('#temporaryPasswordValue').value = password;
  clearFormMessage(dialog.querySelector('form'));
  dialog.showModal();
}
function openSelfEditAccess(id, name) {
  let dialog = $('#selfEditAccessDialog');
  if (!dialog) {
    dialog = document.createElement('dialog');
    dialog.id = 'selfEditAccessDialog';
    dialog.innerHTML =
      '<form id="selfEditAccessForm"><div class="dialog-head"><div><p class="eyebrow">SEGURIDAD</p><h3>Editar mis datos</h3><span id="selfEditReaderName" class="hint"></span></div><button type="button" class="icon-btn close">×</button></div><input type="hidden" name="id"><label>Contraseña del lector<input type="password" name="password" autocomplete="current-password" required></label><div class="actions"><button type="button" class="secondary close">Cancelar</button><button class="primary">Continuar</button></div></form>';
    document.body.append(dialog);
    $('#selfEditAccessForm').addEventListener('submit', async event => {
      event.preventDefault();
      const form = event.currentTarget,
        idValue = form.elements.id.value,
        password = form.elements.password.value;
      try {
        const reader = await request(`/api/readers/${idValue}/profile`, {
          method: 'POST',
          body: JSON.stringify({ password }),
        });
        selfEditingReader = { id: idValue, password };
        dialog.close();
        form.reset();
        openReader(reader, true);
      } catch (error) {
        showFormError(form, error.message);
        form.elements.password.select();
      }
    });
  }
  const form = $('#selfEditAccessForm');
  form.reset();
  clearFormError(form);
  form.elements.id.value = id;
  $('#selfEditReaderName').textContent = name;
  dialog.showModal();
  form.elements.password.focus();
}
function showView(id) {
  $$('.view').forEach(x => x.classList.toggle('active', x.id === id));
  $$('.nav').forEach(x => x.classList.toggle('active', x.dataset.view === id));
  $('#pageTitle').textContent = {
    dashboard: 'Buenos días',
    readers: 'Lectores',
    masses: 'Misas',
    assign: 'Asignaciones',
    coverage: 'Cobertura por misa',
    report: 'Reporte mensual',
  }[id];
  $('.sidebar').classList.remove('open');
  window.scrollTo(0, 0);
}
