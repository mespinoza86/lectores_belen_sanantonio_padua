const form = document.querySelector('#loginForm');
const password = document.querySelector('#password');
const error = document.querySelector('#loginError');

sessionStorage.removeItem('admin_access_verified');
const resetPreviousSession = fetch('/api/auth/logout', { method: 'POST' }).catch(() => null);

form.addEventListener('submit', async event => {
  event.preventDefault();
  const button = form.querySelector('button[type="submit"]');
  error.textContent = '';
  button.disabled = true;
  button.textContent = 'Comprobando…';
  try {
    await resetPreviousSession;
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: password.value }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'No se pudo iniciar sesión');
    sessionStorage.setItem('admin_access_verified', 'yes');
    location.replace('/adminmode.html');
  } catch (failure) {
    error.textContent = failure.message;
    password.select();
  } finally {
    button.disabled = false;
    button.textContent = 'Entrar como administrador';
  }
});
