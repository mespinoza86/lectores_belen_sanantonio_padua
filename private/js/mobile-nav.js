(() => {
  const isAdmin = document.body.dataset.mode === 'admin' || location.pathname === '/adminmode.html' || location.pathname.startsWith('/admin/');
  const currentPage = location.pathname.endsWith('/cobertura.html')
    ? 'coverage'
    : (document.body.dataset.page || 'dashboard');
  const destination = path => isAdmin
    ? (path === '/index.html' ? '/adminmode.html' : `/admin${path}`)
    : path;
  const items = [
    { page: 'dashboard', label: 'Inicio', icon: '&#8962;', path: '/index.html' },
    { page: 'readers', label: 'Lectores', icon: '&#9817;', path: '/lectores.html' },
    { page: 'coverage', label: 'Cobertura', icon: '&#8981;', path: '/cobertura.html' },
    { page: 'assign', label: 'Asignaciones', icon: '&#10003;', path: '/asignar.html' }
  ];

  const navigation = document.createElement('nav');
  navigation.className = 'mobile-bottom-nav no-print';
  navigation.setAttribute('aria-label', 'Navegación principal');
  navigation.innerHTML = items.map(item => {
    const active = item.page === currentPage;
    return `<a class="mobile-bottom-link${active ? ' active' : ''}" href="${destination(item.path)}"${active ? ' aria-current="page"' : ''}><span aria-hidden="true">${item.icon}</span><small>${item.label}</small></a>`;
  }).join('');
  document.body.append(navigation);
})();
