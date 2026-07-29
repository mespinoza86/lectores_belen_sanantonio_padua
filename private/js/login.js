const form = document.querySelector('#loginForm');
const password = document.querySelector('#password');
const error = document.querySelector('#loginError');
const toggle = document.querySelector('#togglePassword');

fetch('/api/auth/status').then(response => response.json()).then(auth => {
  if (auth.authenticated) location.replace('/adminmode.html');
});

toggle.addEventListener('click', () => {
  const visible = password.type === 'text';
  password.type = visible ? 'password' : 'text';
  toggle.textContent = visible ? 'Mostrar' : 'Ocultar';
  password.focus();
});

form.addEventListener('submit', async event => {
  event.preventDefault();
  const button = form.querySelector('button[type="submit"]');
  error.textContent = '';
  button.disabled = true;
  button.textContent = 'Comprobando…';
  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: password.value })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'No se pudo iniciar sesión');
    location.replace('/adminmode.html');
  } catch (failure) {
    error.textContent = failure.message;
    password.select();
  } finally {
    button.disabled = false;
    button.textContent = 'Entrar como administrador';
  }
});
