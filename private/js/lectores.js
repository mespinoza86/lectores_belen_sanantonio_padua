// La logica compartida se carga por partes, en este orden obligatorio:
// base -> datos -> vistas -> reporte-tradicional -> ui -> eventos.
['base', 'datos', 'vistas', 'reporte-tradicional', 'ui', 'eventos'].forEach(parte =>
  document.write(`<script src="/private/js/common-${parte}.js"><\/script>`),
);
