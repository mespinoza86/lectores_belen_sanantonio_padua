// Registra el trabajador de servicio para que Chrome ofrezca instalar la aplicación.
// Va en un archivo aparte porque la política de seguridad es `script-src 'self'` y no
// admite scripts en línea.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(error => {
      // No poder registrarlo solo significa que no se podrá instalar; la aplicación
      // funciona igual, así que no se molesta al usuario con un aviso.
      console.warn('No se pudo registrar el trabajador de servicio:', error.message);
    });
  });
}
