# Continuidad del proyecto Lectores

Última actualización: 16 de julio de 2026

## Objetivo

Aplicación web para administrar los lectores de una iglesia, las celebraciones y la planificación mensual de las funciones litúrgicas.

## Tecnología

- Node.js 18 o superior.
- JavaScript, HTML y CSS sin framework en el cliente.
- Servidor principal en `server.js`.
- MongoDB Atlas como almacenamiento exclusivo.
- Paquetes `mongodb` y `dotenv`.

## Funcionalidad implementada

- Modo público de solo lectura para consultar lectores, misas, asignaciones, calendario y reporte PDF.
- Inicio de sesión administrativo mediante `ADMIN_PASSWORD`, configurado exclusivamente en `.env`.
- Modo administrador protegido para crear, editar y eliminar información.
- Panel principal con resumen del mes.
- Creación, edición, activación y eliminación de lectores.
- Creación y edición de misas recurrentes semanales.
- Creación de misas especiales para una fecha concreta.
- Funciones dinámicas por misa, por ejemplo:
  - Primera lectura.
  - Segunda lectura.
  - Salmo.
  - Moniciones.
- Asignaciones mensuales de lectores por misa y función.
- Calendario mensual con celebraciones y puestos pendientes.
- Reporte mensual preparado para imprimir o guardar como PDF.
- Diseño claro, moderno, adaptable a celulares e inspirado en una interfaz Android.

## Persistencia

La información se guarda en la base `lectores_parroquia`, en estas colecciones:

- `readers`
- `masses`
- `assignments`

La cadena de conexión se encuentra en `.env`. Ese archivo está excluido de Git y no debe publicarse.

Se comprobó la conexión real a MongoDB, incluyendo lectura, creación y eliminación de datos. También existen índices para identificadores y asignaciones.

## Archivos principales

- `server.js`: servidor HTTP, API y conexión con MongoDB.
- `public/index.html`: estructura de la interfaz.
- `public/app.js`: comportamiento, calendario y consumo de la API.
- `public/styles.css`: diseño adaptable e impresión del reporte.
- `.env`: configuración privada.
- `.env.example`: ejemplo seguro de configuración.
- `package.json`: comandos y dependencias.

## Cómo ejecutar

```powershell
npm start
```

Abrir `http://localhost:3000`.

La página principal funciona en modo de solo lectura. El botón **Administrador** abre `login.html`; después de validar la contraseña se ingresa a `adminmode.html`. La sesión administrativa dura ocho horas y puede cerrarse desde el menú lateral.

Para desarrollo con reinicio automático:

```powershell
npm run dev
```

## Decisiones funcionales actuales

- Una asignación mensual aplica a todas las fechas de la misa recurrente durante ese mes.
- Una misa especial aparece únicamente en su fecha configurada.
- Cada misa puede tener cualquier cantidad de funciones.
- El reporte usa el diálogo de impresión del navegador para generar el PDF.
- Al eliminar un lector o una misa también se eliminan sus asignaciones relacionadas.

## Seguridad pendiente

La contraseña inicial de MongoDB fue compartida en la conversación. Conviene rotarla en MongoDB Atlas y actualizar `MONGODB_URI` en `.env` antes de publicar la aplicación.

## Posibles próximos pasos

- Agregar inicio de sesión y modo administrador protegido.
- Permitir reemplazos o excepciones en una fecha concreta.
- Detectar conflictos de horario de un mismo lector.
- Duplicar la planificación de un mes anterior.
- Agregar teléfonos, disponibilidad y ausencias con mayor detalle.
- Generar el PDF directamente desde el servidor.
- Publicar la aplicación en internet y configurar las variables de entorno del alojamiento.

## Actualización del 16 de julio de 2026

Esta sección conserva y amplía el contexto anterior con todo lo implementado y revisado durante la sesión más reciente.

### Estructura actual de la interfaz

- Las páginas principales son:
  - `public/index.html`
  - `public/lectores.html`
  - `public/misas.html`
  - `public/asignar.html`
  - `public/reporte.html`
  - `public/login.html`
- La lógica compartida se encuentra principalmente en `private/js/common.js`.
- El diseño compartido se encuentra en `private/styles.css`.
- Los archivos pequeños de `private/js/index.js`, `lectores.js`, `misas.js`, `asignar.js` y `reporte.js` cargan la lógica común.
- Aunque la carpeta se llama `private`, sus recursos de navegador no contienen secretos y deben considerarse públicos. La seguridad real se aplica en el servidor y la API.

### Modo público y modo administrador

- El modo público permite consultar la información sin modificar lectores, misas o asignaciones administrativas.
- Las operaciones administrativas `POST`, `PUT` y `DELETE` se validan en el servidor mediante una sesión administrativa; ocultar botones no es la única protección.
- El modo administrador permite crear, editar, activar, desactivar y eliminar lectores y misas, administrar asignaciones, sustituciones y generar la planificación aleatoria.
- Los teléfonos de los lectores ya no se incluyen en la respuesta pública de la API ni se muestran en modo público. Continúan disponibles para administración.
- Las notas de los lectores todavía son públicas y debe decidirse antes del release si también deben ocultarse.

### Contraseñas de lectores

- Los lectores nuevos conservan temporalmente la contraseña inicial `11111111`.
- Cada tarjeta de lector contiene la opción **Cambiar contraseña**.
- Para cambiarla se solicita:
  - Contraseña actual.
  - Nueva contraseña.
  - Repetición de la nueva contraseña.
- La nueva contraseña debe tener entre 8 y 72 caracteres, coincidir en ambos campos y ser diferente de la actual.
- Las contraseñas nuevas se almacenan con `bcrypt`, costo 12.
- Los hashes SHA-256 heredados continúan siendo válidos para no bloquear lectores existentes. Cuando cambian su contraseña quedan migrados a bcrypt.
- Los hashes nunca se devuelven en la API.
- El paquete `bcrypt` fue agregado a `package.json` y `package-lock.json`.

### Confirmación de asistencia

- Un lector puede confirmar o indicar que no podrá asistir usando su contraseña personal.
- La contraseña se solicita en un diálogo con campo protegido `type="password"`; ya no se utiliza un `prompt()` visible.
- Antes de pedir la contraseña aparece una confirmación con **Aceptar** y **Cancelar**.
- Los mensajes distinguen entre confirmar asistencia y rechazar la asignación.
- Se advierte que la decisión no podrá revertirse una vez confirmada.
- La irreversibilidad también se valida en la API para impedir que se evite manipulando el cliente.
- Si el lector rechaza, el sistema intenta asignar el siguiente suplente disponible y retira a ese suplente de la banca de la celebración.

### Zona horaria y cierre de confirmaciones

- Las decisiones temporales usan explícitamente `America/Costa_Rica`.
- El mes actual, la fecha de hoy, la semana actual y el cierre de confirmaciones se calculan con hora de Costa Rica.
- Desde la hora exacta de inicio de una misa ya no se puede confirmar ni indicar que no se podrá asistir.
- El bloqueo se aplica tanto en la interfaz como en el servidor, por lo que cambiar el reloj del dispositivo no permite evitarlo.
- Los instantes de auditoría siguen almacenándose como fechas UTC de MongoDB, lo cual es correcto; se interpretan en Costa Rica cuando corresponde.

### Reporte de Eucaristía para WhatsApp

- Una misa se considera concluida una hora después de su hora programada. La duración estimada actual está definida por `MASS_DURATION_MINUTES = 60` en `private/js/common.js`.
- Después de concluir aparece la opción **Crear reporte de Eucaristía**.
- El formulario precarga los lectores que estaban asignados a cada función de la misa.
- Todos los nombres son campos editables por si otra persona realizó la lectura o función.
- El formulario incluye:
  - Todas las funciones dinámicas configuradas en la misa.
  - Sacerdote que presidió.
  - Monitor.
  - Nota o mensaje opcional.
  - Reflexión opcional.
- El monitor se intenta precargar desde una función cuyo nombre contenga Moniciones o Monitor.
- **Copiar** genera el mensaje y lo coloca en el portapapeles para pegarlo en WhatsApp.
- **Enviar por WhatsApp** abre WhatsApp con el texto preparado y permite seleccionar el grupo o contacto.
- El mensaje usa formato compatible con WhatsApp, incluyendo negritas, fecha, misa, participantes y apartados opcionales solo cuando tienen contenido.
- Estos reportes no se guardan todavía en MongoDB ni se marcan como enviados.

### Reportes pendientes

- En el panel principal, debajo de **Misas de esta semana**, existe la sección **Reportes pendientes**.
- Muestra las celebraciones que concluyeron durante las últimas 168 horas, equivalentes a siete días.
- Cada tarjeta muestra misa, fecha, hora, lectores previstos y el botón para crear el reporte.
- Una misa dominical a las 6:00 p. m. aparece aproximadamente a las 7:00 p. m. y permanece disponible hasta el domingo siguiente alrededor de las 7:00 p. m.
- Como todavía no existe persistencia de reportes, copiar o abrir WhatsApp no retira la celebración de la lista de pendientes.

### Consistencia de datos

- Al eliminar un lector se eliminan sus asignaciones como titular y también se retira su identificador de todas las listas de suplentes.
- Al cambiar la disponibilidad de un lector o desactivarlo se limpian sus asignaciones y suplencias futuras incompatibles.
- El historial pasado se conserva.
- Al eliminar funciones de una misa se eliminan las asignaciones futuras que correspondían a esas funciones.
- Al eliminar una misa continúan eliminándose sus asignaciones relacionadas.
- La generación aleatoria mensual ahora usa una transacción de MongoDB: eliminar la planificación anterior e insertar la nueva es una sola operación atómica.
- El rechazo de un lector y la retirada del suplente seleccionado también se ejecutan dentro de una transacción.

### Sesiones administrativas

- Las sesiones administrativas ya no se almacenan en un `Map` en memoria.
- Se utilizan tokens autocontenidos firmados mediante HMAC con `ADMIN_PASSWORD`.
- El token contiene vencimiento y un valor aleatorio, pero no contiene la contraseña.
- Las sesiones duran ocho horas.
- Funcionan entre reinicios y entre varias instancias que compartan el mismo `ADMIN_PASSWORD`.
- Cambiar `ADMIN_PASSWORD` invalida automáticamente todos los tokens anteriores.
- La cookie usa `HttpOnly`, `SameSite=Strict` y, cuando `NODE_ENV=production`, también `Secure`.
- En producción se debe configurar `NODE_ENV=production` y servir exclusivamente mediante HTTPS.

### Endurecimiento HTTP

- Las respuestas incluyen actualmente:
  - `Content-Security-Policy`.
  - `X-Content-Type-Options: nosniff`.
  - `X-Frame-Options: DENY`.
  - `Referrer-Policy: no-referrer`.
  - `Permissions-Policy` para desactivar cámara, micrófono y geolocalización.
  - `Strict-Transport-Security` cuando `NODE_ENV=production`.
- La política CSP limita scripts, estilos, imágenes, conexiones, formularios, URL base e inclusión en marcos.
- Se reforzó la comprobación de rutas estáticas mediante `path.relative` para impedir recorridos fuera de las carpetas permitidas.
- Los cuerpos JSON tienen un límite de 1 MB y dejan de acumularse en memoria al superar el límite.

### Pruebas y verificación

- Existe una suite inicial en `test/server.test.js`.
- `npm test` ejecuta actualmente siete pruebas sobre:
  - Tokens administrativos válidos y manipulados.
  - Vencimiento de sesiones.
  - Bcrypt y compatibilidad con hashes heredados.
  - Ocultamiento de teléfono, hash e identificador interno.
  - Cabeceras defensivas.
  - Rechazo de cuerpos mayores de 1 MB.
  - Conversión de fecha y hora a Costa Rica.
- Resultado de la última ejecución: 7 aprobadas, 0 fallidas.
- `npm audit --omit=dev` reportó 0 vulnerabilidades conocidas.
- `npm outdated` no reportó dependencias desactualizadas.
- Se verificó la sintaxis de `server.js`, los JavaScript del cliente y `scripts/seed-demo.js`.

### Riesgos pendientes antes del release

- La contraseña inicial compartida `11111111` continúa siendo el principal riesgo: cualquier lector que no la haya cambiado puede ser suplantado.
- Las rutas de confirmación y cambio de contraseña de lectores todavía no tienen limitación de intentos.
- Debe rotarse la credencial de MongoDB que fue compartida previamente.
- Debe decidirse si las notas, lectores inactivos y todo el historial de asignaciones deben continuar visibles públicamente.
- Debe configurarse `NODE_ENV=production`, HTTPS y las variables de entorno del alojamiento.
- La carpeta `.git` existente no es reconocida actualmente como un repositorio válido por `git status`; conviene corregir o reinicializar Git antes de publicar.
- La suite actual es inicial. Todavía conviene agregar pruebas de integración con una base de datos de prueba para permisos, transacciones, asignaciones y sustituciones.

### Decisiones que pueden revisarse después

- Hacer configurable la duración estimada de cada misa en lugar de usar 60 minutos globales.
- Guardar reportes de Eucaristía en MongoDB.
- Marcar un reporte como enviado para retirarlo de pendientes.
- Mantener un historial de reportes enviados.
- Permitir configurar un enlace o mecanismo específico para el grupo de WhatsApp.
- Generar contraseñas iniciales diferentes para cada lector u obligar el cambio en el primer uso.
