(() => {
  const eyeIcon =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.75"/></svg>';
  const hiddenEyeIcon =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18M10.6 6.1A10.9 10.9 0 0 1 12 6c6 0 9.5 6 9.5 6a16 16 0 0 1-2.3 3.1M6.3 7.4A16.6 16.6 0 0 0 2.5 12s3.5 6 9.5 6c1.2 0 2.3-.2 3.3-.7M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>';

  function setVisibility(input, button, visible) {
    input.type = visible ? 'text' : 'password';
    button.classList.toggle('showing', visible);
    button.setAttribute('aria-pressed', String(visible));
    button.setAttribute('aria-label', visible ? 'Ocultar contraseña' : 'Mostrar contraseña');
    button.title = visible ? 'Ocultar contraseña' : 'Mostrar contraseña';
    button.innerHTML = visible ? hiddenEyeIcon : eyeIcon;
  }

  function enhance(input) {
    if (input.dataset.passwordToggle === 'ready') return;
    input.dataset.passwordToggle = 'ready';
    input.type = 'password';

    let field = input.parentElement?.classList.contains('password-field') ? input.parentElement : null;
    if (!field) {
      field = document.createElement('span');
      field.className = 'password-field';
      input.before(field);
      field.append(input);
    }

    let button = field.querySelector('.password-visibility, #togglePassword');
    if (!button) {
      button = document.createElement('button');
      button.type = 'button';
      field.append(button);
    }
    button.className = 'password-visibility';
    button.removeAttribute('id');
    setVisibility(input, button, false);
  }

  function enhanceAll(root = document) {
    if (root.matches?.('input[type="password"]')) enhance(root);
    root.querySelectorAll?.('input[type="password"]').forEach(enhance);
  }

  document.addEventListener('click', event => {
    const button = event.target.closest('.password-visibility');
    if (!button) return;
    const input = button.closest('.password-field')?.querySelector('input[data-password-toggle="ready"]');
    if (!input) return;
    setVisibility(input, button, input.type === 'password');
    input.focus({ preventScroll: true });
  });
  document.addEventListener(
    'reset',
    event => {
      event.target.querySelectorAll?.('input[data-password-toggle="ready"]').forEach(input => {
        const button = input.closest('.password-field')?.querySelector('.password-visibility');
        if (button) setVisibility(input, button, false);
      });
    },
    true,
  );
  document.addEventListener(
    'close',
    event => {
      if (!(event.target instanceof HTMLDialogElement)) return;
      event.target.querySelectorAll('input[data-password-toggle="ready"]').forEach(input => {
        const button = input.closest('.password-field')?.querySelector('.password-visibility');
        if (button) setVisibility(input, button, false);
      });
    },
    true,
  );

  enhanceAll();
  new MutationObserver(records =>
    records.forEach(record =>
      record.addedNodes.forEach(node => {
        if (node.nodeType === Node.ELEMENT_NODE) enhanceAll(node);
      }),
    ),
  ).observe(document.body, { childList: true, subtree: true });
})();
