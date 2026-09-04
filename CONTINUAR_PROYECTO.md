# Continuidad del proyecto Lectores

Última actualización: 1 de septiembre de 2026

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

## Actualización del 29 de julio de 2026

- Se intentó iniciar el servidor mediante `node server.js`.
- El servidor no pudo iniciar porque Node.js no encontró la dependencia `dotenv`.
- El error exacto fue `MODULE_NOT_FOUND: Cannot find module 'dotenv'`, originado en la primera línea de `server.js`.
- La versión de Node.js utilizada en el intento fue `v24.18.0`.
- No se instalaron dependencias ni se realizaron cambios en el código.
- Posteriormente se autorizó instalar lo necesario y se ejecutó `npm.cmd install`.
- Se instalaron 16 paquetes y `npm audit` indicó 0 vulnerabilidades conocidas.
- PowerShell no permitió ejecutar el envoltorio `npm.ps1` por la política de ejecución, por lo que se utilizó `npm.cmd` sin modificar dicha política.
- Después de instalar las dependencias, `dotenv` y el archivo `.env` cargaron correctamente.
- El servidor todavía no logró iniciar porque la conexión a MongoDB Atlas falló primero con `read ECONNRESET` y luego con `Server selection timed out after 10000 ms`.
- `server.js` espera completar la conexión con MongoDB antes de abrir el puerto 3000, por lo que la aplicación aún no responde en `http://localhost:3000`.
- El próximo diagnóstico debe revisar la conectividad con Atlas, la lista de acceso de red/IP del clúster y la vigencia de `MONGODB_URI`.

### Corrección de titulares y suplentes en la asignación aleatoria

- Se reportó que una misma persona aparecía como suplente en varias misas después de usar **Asignar aleatoriamente**.
- Se reforzó `randomAssignments` con un registro único de persona a misa que incluye tanto titulares como suplentes.
- Una persona solo puede pertenecer a una misa durante el mes, independientemente de si participa como titular, suplente o en una combinación de ambos roles.
- La misma persona puede aparecer en las distintas fechas de una misa semanal recurrente porque todas corresponden a la misma misa y horario configurados.
- Antes de reemplazar la planificación mensual se ejecuta una validación final de todos los resultados generados. Si encuentra una persona asociada a dos identificadores de misa distintos, cancela la operación y no guarda una planificación inconsistente.
- Cada documento generado recibe una copia independiente de la lista de suplentes de su misa.
- `node --check server.js` finalizó correctamente.
- `npm test` no pudo ejecutarse porque en esta copia no existe `test/server.test.js`, aunque `package.json` todavía apunta a ese archivo.

### Regla definitiva de participación mensual

- Se aclaró que cada fecha de una misa recurrente cuenta como una celebración diferente.
- Cada persona puede participar una sola vez en toda la planificación del mes.
- Esa única participación puede ser como titular o como suplente, pero nunca en ambas categorías.
- Un titular no puede ocupar otra función, otra fecha ni ser suplente durante ese mes.
- Un suplente no puede ser titular ni suplente de otra celebración durante ese mes.
- La asignación aleatoria ahora crea los puestos por misa y fecha concreta, en vez de elegir titulares para una plantilla semanal y repetirlos en todas sus fechas.
- Cada lector tiene capacidad máxima de un puesto titular mensual dentro del algoritmo.
- Los lectores que no quedaron como titulares se distribuyen como suplentes, con un máximo de un suplente por celebración.
- Si quedan menos lectores disponibles que celebraciones, algunas celebraciones quedan sin suplente; no se repite ninguna persona para llenar espacios.
- La validación final impide titulares duplicados, personas usadas simultáneamente como titulares y suplentes, y suplentes asociados a más de una celebración.
- Las rutas de asignación manual, reemplazo y edición de suplentes también aplican la exclusividad mensual.
- La interfaz muestra un solo selector de suplente por celebración y oculta como candidatos a quienes ya participan en otra parte del mes.
- El reporte mensual ahora busca suplentes mediante misa y fecha exactas; anteriormente podía mostrar el suplente de una fecha en otras fechas de la misma misa recurrente.
- `node --check server.js` y `node --check private/js/common.js` finalizaron correctamente.

### Corrección de la interpretación por misa y horario

- La interpretación anterior de limitar a cada persona a una sola fecha del mes fue incorrecta y provocaba celebraciones con funciones vacías.
- La unidad correcta de exclusividad es la misa u horario configurado, no cada fecha individual de una recurrencia semanal.
- Una persona puede servir en las distintas fechas mensuales de la misma misa recurrente, pero no puede pertenecer a otra misa u horario.
- Cada misa debe quedar completa con todas sus funciones configuradas, incluyendo Primera lectura, Segunda lectura, Salmo y Moniciones, además de exactamente un suplente.
- El suplente se incorporó como un puesto obligatorio dentro del mismo emparejamiento que calcula los titulares.
- El algoritmo busca simultáneamente una combinación completa para todas las funciones y un suplente de cada misa, evitando consumir lectores necesarios para suplencias.
- Una persona solo puede pertenecer a una misa: si es titular no puede ser suplente, y si es suplente no puede ser titular ni suplente de otro horario.
- El mismo suplente se aplica a todas las fechas de la misa recurrente correspondiente.
- La edición manual de un suplente actualiza todas las fechas de esa misa durante el mes y mantiene un máximo de un suplente.
- Antes de abrir la transacción se comprueba que estén cubiertas todas las funciones y todos los suplentes. Si la cantidad de lectores o sus disponibilidades no permiten una solución completa, se devuelve un error y se conserva intacta la planificación anterior.
- `node --check server.js` y `node --check private/js/common.js` volvieron a finalizar correctamente después de esta corrección.

### Distribución de varios suplentes

- Se aclaró que un suplente por misa es el mínimo obligatorio, no el máximo.
- El emparejamiento principal sigue garantizando todas las funciones titulares y al menos un suplente compatible para cada misa.
- Después de cubrir ese mínimo, todos los lectores activos y disponibles que no sean titulares ni suplentes todavía se reparten como suplentes adicionales.
- La distribución se equilibra por rondas: se favorecen primero las misas con menos suplentes, de modo que reciban un segundo antes de comenzar a acumular terceros o cuartos cuando la disponibilidad lo permita.
- Una misa puede quedar con uno, dos, tres, cuatro o más suplentes según la cantidad de lectores restantes y sus horarios disponibles.
- Cada persona continúa perteneciendo a una sola misa y no puede ser simultáneamente titular y suplente.
- La interfaz volvió a permitir administrar listas de varios suplentes y agrega una fila vacía para incorporar el siguiente.
- El reporte mensual volvió a mostrar todos los suplentes en su orden de llamada.
- La edición manual exige conservar al menos un suplente y comprueba que cada suplente esté activo y disponible para esa misa.
- `node --check server.js` y `node --check private/js/common.js` finalizaron correctamente.

### Reautenticación obligatoria al entrar como administrador

- Se reportó que cerrar una ventana y volver a abrir el modo administrador permitía continuar sin escribir nuevamente la contraseña.
- La página de login ya no redirige automáticamente a `adminmode.html` cuando encuentra una sesión administrativa anterior.
- Cada vez que se abre `login.html`, se elimina la verificación administrativa de la pestaña y se invalida la cookie anterior mediante `/api/auth/logout`.
- Solo después de validar nuevamente la contraseña se crea la cookie administrativa y una marca de acceso dentro de `sessionStorage` para esa pestaña.
- Las páginas administrativas comprueban primero la marca de la pestaña y después la validez criptográfica de la cookie antes de cargar datos.
- Abrir una página administrativa en otra pestaña o ventana sin esa verificación redirige al formulario de contraseña.
- La cookie administrativa dejó de incluir `Max-Age`, por lo que ahora es una cookie de sesión del navegador y no una cookie persistente en disco.
- El token conserva su vencimiento interno como defensa adicional, pero ese vencimiento ya no permite omitir el formulario al volver a entrar.
- Cerrar sesión también elimina explícitamente la marca administrativa de la pestaña.
- `node --check server.js`, `node --check private/js/login.js` y `node --check private/js/common.js` finalizaron correctamente.

### Auditoría de vulnerabilidades del 29 de julio de 2026

Se realizó una revisión de solo lectura del servidor, cliente, autenticación, autorización, exposición de datos, archivos estáticos y dependencias. No se corrigió código durante esta auditoría.

#### Hallazgos críticos o altos

- `.env` existe y contiene la configuración privada, pero `.gitignore` no existe actualmente. Git muestra `.env` como archivo nuevo sin seguimiento, por lo que existe un riesgo alto de incluir credenciales accidentalmente en un commit.
- Todos los lectores nuevos reciben por defecto la misma contraseña conocida `11111111`. Cualquier cuenta que todavía la conserve puede ser suplantada por alguien que conozca el identificador de su asignación.
- Las rutas públicas de confirmación de asistencia y cambio de contraseña de lectores no tienen limitación de intentos. Un atacante puede realizar intentos repetidos de contraseña; bcrypt ralentiza el cambio de contraseña, pero la confirmación también acepta hashes heredados rápidos.
- Los tokens administrativos son autocontenidos y válidos durante ocho horas. Cerrar sesión borra la cookie del navegador, pero no existe una lista de revocación en el servidor; una copia robada del token continúa siendo válida hasta vencer o hasta cambiar `ADMIN_PASSWORD`.

#### Hallazgos medios

- La API pública `GET /api/readers` oculta teléfono y hash, pero todavía expone nombres, notas, disponibilidad e incluso lectores inactivos.
- La API pública `GET /api/assignments` devuelve documentos completos salvo `_id` y `passwordHash`. Esto puede exponer estados de confirmación, fechas de confirmación, historial de rechazos e identificadores originales, además de toda la planificación histórica.
- La exigencia reciente de contraseña al volver a entrar incluye una marca en `sessionStorage`, pero esa marca es una defensa de interfaz. La autorización real de la API continúa dependiendo exclusivamente de la cookie administrativa.
- El limitador del login administrativo vive en un `Map` en memoria: se pierde al reiniciar, no se comparte entre instancias y utiliza `req.socket.remoteAddress`. Detrás de un proxy puede agrupar a muchos usuarios bajo una sola dirección y permitir un bloqueo compartido.
- No existen tokens CSRF ni validación de cabeceras `Origin`/`Referer`. `SameSite=Strict` reduce sustancialmente el riesgo, pero la defensa depende de la cookie y de una configuración correcta del navegador y del alojamiento.
- El servidor no configura explícitamente `requestTimeout`, `headersTimeout`, `keepAliveTimeout`, límites de conexiones ni manejo de `clientError`. Un cliente lento o muchas conexiones pueden consumir recursos.
- El límite JSON de 1 MB se comprueba después de concatenar cada fragmento recibido y no destruye inmediatamente la solicitud al excederlo. Reduce el riesgo, pero no es una defensa completa contra agotamiento de recursos.
- El constructor `new URL()` y el análisis de cookies se ejecutan sin una protección global. Una cabecera `Host` o una cookie con codificación inválida podría provocar una excepción no controlada y potencialmente afectar el proceso.
- El manejador HTTP invoca la función asíncrona `api()` sin esperarla ni adjuntar un `.catch()` global. Un error no capturado dentro de una ruta puede convertirse en un rechazo no manejado.
- En producción, `Secure` y HSTS solo se activan si `NODE_ENV=production`. La aplicación no exige HTTPS por sí misma ni valida que el proxy haya recibido la solicitud mediante HTTPS.

#### Hallazgos bajos y endurecimiento

- `ADMIN_PASSWORD` sirve tanto para comprobar el login como para firmar tokens HMAC. Conviene separar el secreto de sesión de la credencial administrativa y almacenar la contraseña administrativa mediante un hash lento.
- La CSP es buena, pero permite `style-src 'unsafe-inline'`. No habilita scripts inline, por lo que el riesgo XSS principal permanece reducido.
- No hay registro persistente de intentos de login, accesos administrativos ni cambios sensibles, lo que dificulta detectar abuso o investigar incidentes.
- Algunos atributos HTML construidos mediante plantillas usan identificadores sin escapar. Actualmente los identificadores normales son UUID generados por el servidor, por lo que el riesgo práctico es bajo mientras la base no contenga datos manipulados externamente.
- Las notas de lectores se escapan antes de insertarse en HTML, lo cual mitiga XSS, pero su publicación sigue siendo un asunto de privacidad.
- No existe actualmente `test/server.test.js`, aunque `package.json` lo referencia. Esto impide ejecutar la suite de regresión de seguridad descrita anteriormente.

#### Controles favorables comprobados

- Las operaciones administrativas `POST`, `PUT` y `DELETE` pasan por autorización en el servidor, salvo las rutas públicas intencionales de confirmación y cambio de contraseña.
- Las contraseñas nuevas de lectores usan bcrypt con costo 12 y los hashes no se devuelven en la API.
- La cookie administrativa usa `HttpOnly`, `SameSite=Strict`, `Path=/` y `Secure` cuando se configura producción.
- Existen CSP, `nosniff`, protección contra marcos, política de referencia, política de permisos y HSTS condicional.
- Los textos controlados por usuarios se escapan de forma consistente en las vistas principales.
- La resolución de archivos estáticos comprueba que la ruta permanezca dentro de las carpetas permitidas.
- Los valores usados en consultas se convierten a texto y se limitan, reduciendo el riesgo de inyección de operadores MongoDB.
- `npm audit --omit=dev` reportó 0 vulnerabilidades conocidas: 0 críticas, altas, moderadas, bajas o informativas.

#### Prioridad recomendada

1. Restaurar `.gitignore`, excluir `.env` y rotar cualquier credencial que haya sido compartida o publicada.
2. Eliminar la contraseña inicial común, generar credenciales únicas y obligar el cambio en el primer uso.
3. Añadir limitación persistente de intentos a confirmaciones, cambios de contraseña y login administrativo.
4. Reducir los campos y el historial expuestos por las API públicas.
5. Implementar sesiones administrativas revocables, un secreto de sesión separado y auditoría de acciones.
6. Endurecer el servidor HTTP frente a solicitudes lentas, entradas malformadas y errores asíncronos no controlados.
7. Restaurar y ampliar las pruebas automatizadas de seguridad e integración.

#### Aclaración sobre `.gitignore`

- `.gitignore` indica a Git qué archivos o carpetas locales no debe incluir normalmente en commits.
- En este proyecto debe excluir al menos `.env` y `node_modules/`.
- Excluir `.env` evita publicar accidentalmente contraseñas, credenciales de MongoDB y otras variables privadas.
- Excluir `node_modules/` evita guardar miles de archivos de dependencias que pueden reconstruirse con `npm install`.
- `.gitignore` no cifra, elimina ni protege directamente los archivos; solo evita que Git empiece a rastrearlos cuando todavía no están versionados.

#### Restauración de `.gitignore`

- Se restauró `.gitignore` usando su contenido anterior almacenado en Git.
- Actualmente excluye `node_modules/`, `data/*.tmp`, `.env` y `.DS_Store`.
- `git check-ignore` confirmó que `.env` y `node_modules/` están siendo ignorados correctamente.
- No se leyó, modificó ni eliminó `.env`, y todavía no se rotaron credenciales.

### Contraseñas temporales únicas para lectores

- Se eliminó el uso de `11111111` al crear lectores nuevos.
- Cada lector nuevo recibe una contraseña temporal aleatoria de 12 caracteres generada mediante `crypto.randomInt`.
- El alfabeto evita caracteres visualmente ambiguos y combina mayúsculas, minúsculas y números.
- La contraseña temporal se almacena únicamente como hash bcrypt con costo 12.
- El valor legible se devuelve y muestra al administrador una sola vez después de crear el lector; no puede consultarse posteriormente.
- La ventana de credencial permite copiar la contraseña y advierte que debe entregarse de forma privada.
- Los lectores creados o restablecidos quedan con `mustChangePassword: true`.
- Un lector con contraseña temporal pendiente no puede confirmar ni rechazar una asignación hasta cambiarla.
- Al cambiar correctamente la contraseña personal se establece `mustChangePassword: false` y se registra `passwordChangedAt`.
- En las tarjetas administrativas aparece **Generar contraseña temporal** para restablecer individualmente lectores existentes.
- El restablecimiento requiere sesión administrativa, invalida inmediatamente la contraseña anterior, genera una distinta y la muestra una sola vez.
- Las tarjetas muestran **Cambio de contraseña pendiente** cuando corresponde.
- Los campos `mustChangePassword`, `passwordChangedAt` y `passwordResetAt` se eliminan de la respuesta pública de lectores.
- La edición común de un lector ya no acepta una contraseña enviada dentro del formulario; todos los restablecimientos administrativos pasan por la ruta protegida específica.
- `11111111` continúa temporalmente en el servidor solo para comprobar hashes heredados durante la migración; ya no se asigna a cuentas nuevas.
- No se cambiaron automáticamente las contraseñas de lectores existentes para evitar invalidarlas antes de poder entregar las credenciales. El administrador debe restablecerlas individualmente desde la interfaz.
- `node --check server.js` y `node --check private/js/common.js` finalizaron correctamente.
- No se realizó una prueba dinámica contra MongoDB porque la conexión con Atlas continúa sin estar disponible en este entorno.

### Limitación de intentos sin utilizar IP

- Se decidió no utilizar direcciones IP, `X-Forwarded-For` ni configuración de confianza en proxies para las confirmaciones y cambios de contraseña de lectores.
- Cada asignación mantiene su propio contador de contraseñas incorrectas para confirmar o rechazar asistencia.
- Cada lector mantiene otro contador independiente para cambiar su contraseña personal.
- Después de 10 contraseñas incorrectas, el objetivo correspondiente queda bloqueado durante 10 minutos.
- Durante el bloqueo la API responde con HTTP 429 y la cabecera `Retry-After` con los segundos restantes.
- Una contraseña correcta elimina inmediatamente el contador correspondiente.
- Cuando vence un bloqueo, el contador se reinicia antes de registrar un nuevo fallo.
- Los contadores se almacenan en la colección `auth_rate_limits` de MongoDB y sobreviven reinicios o varias instancias del servidor.
- Se agregó un índice único por `action + targetId` y un índice TTL para limpiar automáticamente registros antiguos.
- Un restablecimiento administrativo de contraseña elimina cualquier bloqueo existente para cambiar la contraseña de ese lector.
- Los errores de validación de la contraseña nueva no cuentan como fallos; solamente una contraseña actual incorrecta incrementa el contador.
- Esta decisión permite que alguien que conozca un identificador provoque deliberadamente un bloqueo de 10 minutos al fallar 10 veces. Se aceptó este compromiso para evitar completamente el uso de IP.
- El limitador preexistente del login administrativo continúa usando `req.socket.remoteAddress`; no fue modificado como parte de este cambio.
- `node --check server.js` finalizó correctamente.
- No se ejecutaron pruebas dinámicas contra MongoDB porque Atlas continúa inaccesible desde este entorno.

#### Aclaración sobre `DNS_SERVERS`

- `DNS_SERVERS` permite indicar servidores DNS personalizados separados por comas.
- Al arrancar, `server.js` lee esa variable y llama a `dns.setServers(...)` cuando contiene valores.
- Su uso principal en este proyecto es ayudar a resolver el registro SRV de una conexión `mongodb+srv://` de MongoDB Atlas.
- Si la variable no existe o está vacía, Node.js utiliza la resolución DNS normal del sistema o del proveedor de alojamiento.
- Un servidor DNS incorrecto, bloqueado o lento puede impedir resolver MongoDB Atlas y provocar que la aplicación no inicie.
- En Render normalmente conviene probar primero el DNS proporcionado por la plataforma y conservar `DNS_SERVERS` únicamente si existe un problema real de resolución.

#### Eliminación de `DNS_SERVERS`

- Se eliminó la variable `DNS_SERVERS` de `.env` sin mostrar ni modificar las demás variables privadas.
- Se retiraron de `server.js` la importación del módulo `dns`, la lectura de `DNS_SERVERS` y la llamada a `dns.setServers`.
- La conexión `mongodb+srv://` utiliza ahora exclusivamente la resolución DNS normal del sistema en desarrollo y la proporcionada por Render en producción.
- Se verificó que no quedan referencias a `DNS_SERVERS`, `dns.setServers` ni `require('dns')` en el servidor.
- `node --check server.js` finalizó correctamente.

#### Diagnóstico de `querySrv ECONNREFUSED`

- Después de eliminar `DNS_SERVERS`, `node server.js` falla al resolver `_mongodb._tcp.cluster0.5uov4sm.mongodb.net`.
- `Resolve-DnsName` de Windows resolvió correctamente el registro SRV y devolvió los tres nodos de MongoDB Atlas, por lo que el dominio y el clúster existen.
- `dns.resolveSrv` de Node.js reprodujo exactamente `querySrv ECONNREFUSED`.
- `dns.getServers()` de Node.js mostró únicamente `127.0.0.1`.
- No hay un resolvedor DNS local aceptando las consultas de Node en `127.0.0.1`, por lo que la conexión DNS es rechazada antes de intentar conectar con MongoDB.
- Una consulta directa mediante `nslookup` a `8.8.8.8` también agotó el tiempo, señal de que la red, VPN, antivirus, firewall o configuración local no permite actualmente esa consulta DNS directa.
- Windows consigue resolver mediante su propia capa de resolución, caché o mecanismo de red, pero el controlador de MongoDB necesita una consulta SRV que pasa por el resolvedor DNS interno de Node.
- Este es un problema del entorno DNS local, no de la contraseña de MongoDB ni de la existencia del clúster.
- No se restauró `DNS_SERVERS` ni se modificó `.env` durante el diagnóstico.

### Protocolo de continuidad acordado el 29 de julio de 2026

- `continuar_proyecto.md` se usará como memoria persistente y fuente principal de contexto del proyecto.
- A partir de esta sesión, cada tarea realizada debe dejar aquí un resumen de las decisiones, cambios, archivos afectados, verificaciones ejecutadas, resultados y pendientes relevantes.
- No se registrarán contraseñas, cadenas de conexión, tokens ni otros secretos.
- Se evitará guardar pasos triviales o transitorios que no ayuden a retomar el proyecto; el objetivo es conservar contexto técnico y funcional útil.
- Antes de trabajar en solicitudes posteriores se tendrá en cuenta el contenido acumulado de este documento.

### Cambio manual de lectores después de la asignación aleatoria

- Las reglas de disponibilidad y exclusividad continúan aplicándose sin cambios al botón **Asignar aleatoriamente**.
- En modo administrador, los selectores de titulares muestran ahora todos los lectores activos, aunque ya pertenezcan a otra misa o no tengan marcado el nuevo horario en su disponibilidad.
- Esto permite atender excepciones posteriores, por ejemplo mover manualmente a un lector de la misa de las 4:00 p. m. a la de las 6:00 p. m.
- Al seleccionar manualmente a un lector, el servidor elimina sus puestos de titular en otra misa durante ese mes y lo retira de cualquier lista de suplentes antes de guardarlo en el puesto nuevo.
- Si el lector tenía otra función dentro de la misma misa, también se libera esa función; se conservan únicamente sus apariciones en la misma misa y la misma función.
- La sustitución del lector y la limpieza de sus usos anteriores se ejecutan dentro de una transacción de MongoDB para evitar duplicidades o cambios parciales.
- El lector reemplazado en el puesto de destino queda libre para ser colocado manualmente en el puesto que corresponda.
- Los lectores inactivos no aparecen como opciones y no pueden asignarse.
- `node --check server.js` y `node --check private/js/common.js` finalizaron correctamente.
- No se realizó una prueba dinámica contra MongoDB porque la conectividad con Atlas continúa siendo una limitación conocida de este entorno.

### Lectores configurados únicamente como suplentes

- El formulario de lectores incluye ahora la casilla **Solo suplente**, además de **Lector activo**.
- Un lector activo sin **Solo suplente** puede participar como titular o como suplente.
- Un lector activo con **Solo suplente** puede participar únicamente en las listas de suplentes y no puede recibir una función titular.
- Un lector inactivo no participa como titular ni como suplente, independientemente del valor conservado en **Solo suplente**.
- La asignación aleatoria excluye a los lectores de solo suplencia de todas las funciones titulares, pero los considera para el suplente obligatorio y para las suplencias adicionales según su disponibilidad.
- Los selectores manuales de funciones titulares ocultan a los lectores de solo suplencia; los selectores de suplentes sí los incluyen.
- El servidor también rechaza cualquier intento de colocar como titular a un lector configurado únicamente como suplente.
- Las tarjetas de lectores activos muestran la etiqueta **Solo suplente** cuando corresponde.
- Al editar un lector y activar **Solo suplente**, se eliminan sus titularidades futuras. Sus suplencias compatibles pueden conservarse.
- Al desactivar un lector se continúan eliminando tanto sus titularidades como sus suplencias futuras.
- Los lectores existentes que no tengan todavía el nuevo campo `substituteOnly` se interpretan como lectores normales y pueden ser titulares o suplentes.
- Se actualizaron `server.js`, `private/js/common.js` y los formularios compartidos de `public/index.html`, `public/lectores.html`, `public/misas.html`, `public/asignar.html` y `public/reporte.html`.
- `node --check server.js` y `node --check private/js/common.js` finalizaron correctamente.
- No se realizó una prueba dinámica contra MongoDB debido a la limitación de conectividad con Atlas ya documentada.

### Edición personal de datos y resumen administrativo de lectores

- Cada lector activo dispone ahora de la opción **Editar mis datos** en su tarjeta pública.
- Para abrir la edición debe escribir correctamente su contraseña personal.
- La contraseña se valida otra vez al guardar; no basta con haber abierto el formulario.
- Después de autenticarse, el lector puede modificar su nombre, teléfono, notas, disponibilidad de misas y la casilla **Solo suplente**.
- El lector no puede modificar por sí mismo su estado activo o inactivo. Este control continúa reservado al administrador.
- Los lectores con contraseña temporal pendiente deben cambiarla antes de poder editar sus datos.
- Los intentos incorrectos de acceso a la edición utilizan el limitador persistente de MongoDB, separado mediante la acción `profile-edit`.
- Los datos privados, incluido el teléfono, solo se entregan desde la ruta de perfil después de validar la contraseña.
- Cuando un lector elimina una misa de su disponibilidad, se limpian sus titularidades y suplencias futuras incompatibles.
- Cuando un lector activa **Solo suplente**, se eliminan todas sus titularidades futuras; sus suplencias compatibles se conservan.
- La vista administrativa de lectores muestra un resumen con tres cantidades: **Activos normales**, **Solo suplentes** e **Inactivos**.
- Las operaciones administrativas existentes continúan funcionando sin cambios y el administrador conserva el control total.
- Se agregaron la ruta protegida `POST /api/readers/:id/profile`, el flujo de autenticación y edición en `private/js/common.js`, y el resumen administrativo.
- `node --check server.js` y `node --check private/js/common.js` finalizaron correctamente.
- No se ejecutó una prueba dinámica con MongoDB por la limitación de conectividad con Atlas documentada anteriormente.

### Diagnóstico de diferencia entre localhost y Render del 30 de julio de 2026

- En localhost aparece **Editar mis datos**, mientras que la versión publicada en Render solamente muestra **Cambiar contraseña**.
- El repositorio local está en el commit `a191e2c` (`Adding latest changes`), donde sí existen el botón, el flujo del cliente y la ruta de perfil para editar los datos personales.
- La rama local `main` está un commit por delante de `origin/main`: `git status -sb` mostró `main...origin/main [ahead 1]`.
- GitHub y Render continúan en el commit anterior `31d389a6d0443b159f30b8d2977295f0a8fea07c`.
- El commit `31d389a` no contiene los textos ni el flujo de **Editar mis datos** en `private/js/common.js`.
- Por tanto, la diferencia no se debe al caché del navegador: el cambio existe únicamente en el commit local `a191e2c` y todavía no ha sido enviado a GitHub.
- Para publicarlo será necesario subir el commit local a `origin/main` y verificar que Render complete un despliegue del nuevo SHA.
- No se modificó el código de la aplicación ni se realizó el `push` durante este diagnóstico.

### Cambio solicitado: asignar únicamente puestos vacíos

- Se propuso agregar en `asignar.html`, visible en modo administrador, una acción **Asignar no asignados** junto a la asignación aleatoria existente.
- Esta acción no debe reemplazar ni rehacer toda la planificación mensual; debe conservar las asignaciones existentes y buscar lectores solamente para las funciones titulares que estén vacías.
- Debe mantenerse la regla de exclusividad por misa u horario: una persona que pertenece como titular o suplente a una misa no puede asignarse a otra misa distinta.
- Para cubrir una función vacía se puede utilizar:
  - Un lector activo, apto para titular y disponible en esa misa, que todavía no pertenezca a otra misa.
  - Un lector que actualmente sea suplente de esa misma misa, retirándolo de la lista de suplentes al convertirlo en titular.
- También se planteó permitir tomar un suplente de otra misa para cubrir el puesto, retirándolo primero de aquella misa; si es posible, se buscaría un suplente de reemplazo para la misa de origen y, si no existe, podría quedar con menos suplentes.
- La definición se encuentra pendiente de confirmación antes de implementar, especialmente respecto a cuándo se permite dejar una misa sin suplente y si el traslado desde otra misa debe respetar la disponibilidad del lector en la misa de destino.

### Implementación de Asignar no asignados

- Se confirmó e implementó la acción **Asignar no asignados** en `public/asignar.html`, visible únicamente en modo administrador junto a **Asignar aleatoriamente**.
- La nueva acción trabaja sobre el mes seleccionado, conserva todas las titularidades existentes y solamente intenta crear las funciones que estén vacías.
- Se agregó la ruta administrativa `POST /api/fill-unassigned` y la función transaccional `fillUnassigned` en `server.js`.
- Para cada puesto vacío se buscan candidatos en este orden:
  - Un suplente apto de la misma misa.
  - Un lector titular apto que todavía no pertenezca a ninguna misa.
  - Un suplente apto perteneciente a otra misa.
  - Un titular de la misma misa que no tenga otra función en esa fecha.
- Todo titular elegido debe estar activo, no estar configurado como **Solo suplente**, tener la misa de destino en su disponibilidad y no ocupar otra función de esa misma celebración.
- Cuando se promueve un suplente de la misma misa, se elimina de la lista de suplentes antes de convertirlo en titular.
- Cuando se traslada un suplente de otra misa, se elimina de todas las listas de suplentes de su misa de origen durante el mes. El sistema intenta reemplazarlo con un lector activo, libre y disponible para el horario de origen; si no existe, la misa puede quedar con menos suplentes o sin suplentes.
- Los lectores configurados como **Solo suplente** pueden utilizarse como reemplazo en una lista de suplentes, pero nunca para cubrir una función titular.
- La operación completa se ejecuta dentro de una transacción de MongoDB. Antes de guardar se valida nuevamente que ninguna persona pertenezca a dos misas ni figure simultáneamente como titular y suplente.
- La respuesta indica cuántos puestos se completaron, cuántos quedaron vacíos, cuántos suplentes se trasladaron y cuántos pudieron ser reemplazados.
- Se agregó una confirmación en la interfaz y un mensaje final que informa si quedaron puestos sin un lector compatible.
- Se añadió un contenedor adaptable específico para los dos botones de asignación en `private/styles.css`.
- `node --check server.js`, `node --check private/js/common.js` y `git diff --check` finalizaron correctamente.
- `npm test` no pudo ejecutarse porque `package.json` todavía apunta a `test/server.test.js`, archivo que no existe en esta copia del proyecto.
- No se realizó una prueba dinámica contra MongoDB Atlas debido a la limitación de conectividad ya documentada.

### Corrección solicitada para conservar el orden de suplentes

- Se detectó que **Asignar no asignados** agrupa las listas de suplentes por misa y las vuelve a escribir en todas las fechas del mes cuando promueve o traslada a uno de ellos.
- Este comportamiento descuadra y reordena suplentes de celebraciones posteriores que no participaron en la operación.
- La regla deseada es trabajar con la lista de suplentes de cada celebración o fecha concreta, sin normalizarla ni copiarla a las demás fechas de la misma misa.
- Si se promueve a titular un suplente de una celebración, únicamente debe retirarse ese identificador de la lista de esa celebración; todos los demás suplentes deben conservar exactamente su orden.
- Si se toma un suplente de otra misa y fecha, debe retirarse solamente de esa lista de origen. Los demás suplentes de esa lista permanecen en el mismo orden.
- Si se encuentra un suplente de reemplazo, debe colocarse en la posición liberada o, como mínimo, sin reordenar a los suplentes existentes.
- Las listas de suplentes de celebraciones que no fueron utilizadas deben permanecer idénticas.
- La corrección se encuentra pendiente de confirmación antes de modificar el código.

### Corrección implementada para suplentes por fecha

- Se corrigió `fillUnassigned` para administrar suplentes mediante la combinación exacta `massId + date`, en lugar de agruparlos por misa durante todo el mes.
- Las listas de suplentes que no participan en una promoción o traslado ya no se actualizan en MongoDB.
- Al promover un suplente de la misma celebración se elimina únicamente su posición de esa fecha. Los demás identificadores conservan el mismo orden.
- Si se traslada un suplente desde otra misa, se modifica únicamente su celebración de origen y el resto de esa lista mantiene su orden.
- El suplente de reemplazo, cuando existe, se inserta en el mismo índice que ocupaba la persona trasladada.
- Para mantener la exclusividad entre misas sin alterar fechas adicionales, un suplente de otra misa solo puede trasladarse automáticamente cuando aparece en una única celebración de origen. Si todavía figura como suplente en varias fechas de esa otra misa, no se utiliza para llenar el puesto.
- Se ajustó la validación final para permitir que una persona sea titular y suplente en fechas distintas de la misma misa, pero continúa rechazando cualquier pertenencia simultánea a misas diferentes.
- Los documentos nuevos reciben la lista final exacta de suplentes de su propia celebración.
- La actualización de suplentes utiliza filtros por `month`, `massId` y `date`; ya no ejecuta actualizaciones generales por misa y mes.
- `node --check server.js`, `node --check private/js/common.js` y `git diff --check` finalizaron correctamente después de la corrección.
- No se ejecutó una prueba dinámica con MongoDB Atlas debido a la limitación de conectividad documentada.

### Continuidad retomada el 30 de julio de 2026

- Se cargó y revisó nuevamente `continuar_proyecto.md` como fuente principal de contexto antes de continuar el trabajo.
- Se mantiene el protocolo acordado: cada tarea futura dejará en este archivo un resumen útil de decisiones, cambios, archivos afectados, verificaciones, resultados y pendientes.
- No se guardarán contraseñas, tokens, cadenas de conexión ni otros secretos.
- El último estado funcional considerado es la corrección de **Asignar no asignados** para conservar las listas y el orden de suplentes por celebración y fecha exacta.

### Alcance por fecha para cambios manuales de titulares

- En el modo administrador de `public/asignar.html`, cada cambio manual de titular abre ahora un diálogo para escoger entre **Solo esta celebración** y **Esta y las restantes**.
- El diálogo también se puede cerrar sin ejecutar el cambio; en ese caso el selector recupera su valor anterior.
- Al seleccionar **Sin asignar** para las fechas restantes, se elimina únicamente a la persona retirada de la misma misa y de las fechas iguales o posteriores a la seleccionada, aunque esa persona cambie de función entre celebraciones.
- La eliminación no vacía indiscriminadamente una función: los titulares diferentes que aparezcan en fechas posteriores permanecen intactos.
- Al seleccionar una persona para las fechas restantes, se actualiza la celebración elegida y esa persona se agrega a un puesto vacío de cada celebración posterior de la misma misa, respetando la función que se encuentre libre.
- Las funciones posteriores que ya tengan otro titular no se reemplazan.
- Las fechas anteriores nunca se modifican por esta propagación.
- La operación se implementó mediante la ruta administrativa `POST /api/assignment-change` y se ejecuta dentro de una transacción de MongoDB.
- Se mantiene el comportamiento previo de los cambios manuales respecto a la exclusividad: el lector seleccionado se retira de usos incompatibles en otras misas o funciones del mes y de las listas de suplentes antes de asignarlo.
- El servidor valida que la misa esté activa, que la función y la fecha correspondan a esa misa, que el lector esté activo y que no sea un lector configurado únicamente como suplente.
- También se agregó una comprobación de concurrencia: si el titular cambió después de mostrarse la pantalla, la operación se rechaza y la interfaz vuelve a cargar los datos actuales.
- Se actualizaron `server.js`, `private/js/common.js`, `private/styles.css` y `public/asignar.html`.
- `node --check server.js`, `node --check private/js/common.js` y `git diff --check` finalizaron correctamente.
- `npm test` no pudo ejecutarse porque continúa faltando `test/server.test.js`, aunque `package.json` todavía apunta a ese archivo.
- No se realizó una prueba dinámica contra MongoDB Atlas debido a la limitación de conectividad documentada.

#### Corrección de propagación sobre puestos sin asignar

- Se detectó que **Esta y las restantes** actualizaba la fecha seleccionada, pero podía omitir fechas posteriores mostradas como **Sin asignar**.
- La causa era que algunas fechas conservan un documento de asignación con `readerId: null`. El servidor interpretaba la mera existencia del documento como si el puesto ya tuviera titular.
- Se corrigió `changeManualAssignment` para considerar ocupado un puesto posterior únicamente cuando su documento contiene realmente un `readerId`.
- Los documentos existentes con titular continúan protegidos y no se reemplazan.
- Los documentos con `readerId: null`, igual que las fechas sin documento, ahora reciben correctamente a la persona seleccionada cuando se elige **Esta y las restantes**.
- La lógica para retirar únicamente a la persona elegida en fechas posteriores no necesitó cambios.
- `node --check server.js`, `node --check private/js/common.js` y `git diff --check` finalizaron correctamente.
- La comprobación dinámica con MongoDB Atlas continúa pendiente por la limitación de conectividad del entorno.

#### Verificación de la instancia utilizada para probar

- Al reportarse que el problema continuaba, se comprobó que no existe actualmente una aplicación respondiendo en `http://localhost:3000`.
- La rama local y `origin/main` apuntan al commit `11dbd86`, pero la corrección más reciente de `readerId: null` todavía forma parte de cambios locales sin commit.
- Por tanto, una prueba realizada en Render o en cualquier instancia basada en GitHub todavía ejecuta el código anterior y no puede incluir esa corrección.
- Para comprobar el arreglo en Render será necesario confirmar los cambios, enviarlos a GitHub y esperar el despliegue del nuevo commit.
- No se realizó un commit, `push` ni despliegue automáticamente porque esas acciones externas requieren confirmación del usuario.

#### Corrección definitiva del alcance por persona

- Se confirmó directamente que la aplicación estaba disponible en `http://localhost:3000` y que servía la interfaz y el JavaScript nuevos.
- Los datos reales de agosto muestran que los lectores rotan entre Primera lectura, Segunda lectura, Salmo y Moniciones en las distintas fechas de una misma misa.
- La implementación anterior filtraba las fechas restantes mediante `massId + role + readerId`; por eso solo encontraba nuevamente a la persona cuando repetía exactamente la misma función.
- La eliminación para **Esta y las restantes** ahora busca mediante `massId + readerId` desde la fecha seleccionada, sin limitarse a una función.
- Al asignar para las fechas restantes, el servidor busca un puesto realmente vacío en cada celebración posterior y conserva todos los puestos que ya pertenecen a otras personas.
- Solo se cubre un puesto por celebración para no asignar dos funciones a la misma persona en una misma fecha.
- El texto del diálogo fue actualizado para explicar que el alcance sigue a la persona aunque cambie de función.
- Se reinició exclusivamente el proceso de Node que escuchaba el puerto 3000. La aplicación volvió a responder con HTTP 200 y quedó ejecutándose con el proceso nuevo.

#### Propagación de un reemplazo directo

- Se detectó una diferencia entre quitar primero al titular y reemplazarlo directamente mediante el selector.
- Cuando se elegía directamente otra persona y luego **Esta y las restantes**, las fechas posteriores todavía contenían al titular anterior; como el servidor buscaba únicamente puestos vacíos, no propagaba el reemplazo.
- El servidor ahora conserva el identificador del titular anterior y busca sus apariciones posteriores dentro de la misma misa, aunque cambie de función entre fechas.
- En cada aparición futura encontrada, la persona nueva sustituye únicamente a la persona anterior. Los puestos pertenecientes a otros lectores no se modifican.
- Si el puesto inicial estaba vacío, se mantiene la regla anterior de colocar a la persona seleccionada en un puesto vacío de cada celebración posterior.
- Para evitar dos funciones en una misma celebración, los puestos futuros incompatibles que ya pertenecían a la persona nueva se liberan desde la fecha seleccionada antes de propagar el reemplazo.
- Los puestos de esa persona en fechas anteriores de la misma misa ya no se eliminan al aplicar el alcance restante.
- El texto del diálogo distingue ahora entre una asignación sobre un puesto vacío y un reemplazo directo de una persona por otra.
- `node --check server.js`, `node --check private/js/common.js` y `git diff --check` finalizaron correctamente.
- Se reinició el proceso de Node de `localhost:3000`; la aplicación volvió a responder con HTTP 200 mediante el proceso nuevo.

## Actualización del 2 de agosto de 2026

### Filtro de asignaciones por lector

- Se agregó en `public/asignar.html`, antes del listado de misas, un selector **Filtrar por lector** y un botón **Limpiar**.
- El selector incluye todos los lectores y filtra las asignaciones del mes actualmente seleccionado.
- Una misa coincide cuando el lector seleccionado participa en ella como titular o aparece en la lista de suplentes de alguna de sus celebraciones durante ese mes.
- Las misas coincidentes se muestran completas, con todas sus fechas, funciones, titulares y suplentes; el filtro no oculta a los demás integrantes.
- Si el lector no participa en ninguna misa del mes, se muestra un mensaje específico con su nombre y el mes consultado.
- **Limpiar** elimina el filtro y restaura el listado completo; permanece desactivado mientras no haya un lector seleccionado.
- El filtro es exclusivamente visual y no modifica asignaciones ni datos en MongoDB.
- Al cambiar de mes se conserva el lector elegido y se recalculan las misas coincidentes para el nuevo mes.
- Los lectores del selector se ordenan alfabéticamente y el diseño se adapta a pantallas pequeñas.
- Se actualizaron `public/asignar.html`, `private/js/common.js` y `private/styles.css`.
- `node --check private/js/common.js` y `git diff --check` finalizaron correctamente; este último solo informó las advertencias existentes de conversión futura de LF a CRLF.

### Estadísticas administrativas de disponibilidad por misa

- Se creó la página independiente `public/estadisticas.html`, disponible mediante `/admin/estadisticas.html` y visible únicamente para administradores.
- Se agregó el enlace **Estadísticas** a la navegación administrativa de las páginas principales; permanece oculto en modo público.
- El servidor protege la ruta `/admin/estadisticas.html` con la sesión administrativa y redirige al login cuando no existe una sesión válida.
- El acceso directo público a `/estadisticas.html` también se redirige al login, por lo que la protección no depende solamente de ocultar el enlace.
- La página utiliza `private/js/estadisticas.js` para consultar lectores y misas después de validar tanto la marca administrativa de la pestaña como la sesión del servidor.
- Las estadísticas incluyen únicamente lectores activos y misas activas.
- Cada misa muestra su nombre, día o fecha, hora, total de personas disponibles y el desglose entre lectores normales y lectores configurados como **Solo suplente**.
- Las tarjetas se ordenan empezando por las misas con menor disponibilidad para facilitar la detección de horarios con problemas.
- La cobertura mínima se calcula como la cantidad de funciones titulares configuradas más un suplente.
- Una misa se clasifica como **Insuficiente** si no tiene suficientes lectores normales para sus funciones o si el total no cubre las funciones más un suplente.
- Se clasifica como **Ajustada** cuando cubre el mínimo pero dispone de un margen de hasta dos personas adicionales, y como **Suficiente** cuando tiene un margen mayor.
- La vista incluye indicadores generales de lectores activos, misas activas, coberturas insuficientes y coberturas ajustadas, además de barras comparativas y colores verde, amarillo y rojo.
- Se actualizaron `server.js`, `private/styles.css` y la navegación de `public/index.html`, `public/lectores.html`, `public/misas.html`, `public/asignar.html` y `public/reporte.html`; se agregaron `public/estadisticas.html` y `private/js/estadisticas.js`.
- `node --check server.js`, `node --check private/js/estadisticas.js`, `node --check private/js/common.js` y `git diff --check` finalizaron correctamente.
- No se pudo realizar la comprobación HTTP dinámica porque no había una instancia local respondiendo en `localhost:3000` durante la verificación.

### Estadísticas mensuales de confirmación por lector

- Se amplió la página administrativa `public/estadisticas.html` con una sección independiente **Confirmaciones por lector**.
- La sección incluye un selector de mes, inicializado con el mes actual de `America/Costa_Rica`.
- Para cada lector con actividad en el mes se muestran las cantidades de asignaciones confirmadas, avisos de que no asistirá y respuestas pendientes.
- Las confirmaciones se calculan a partir de asignaciones con `confirmationStatus: confirmed`.
- Los avisos de no asistencia se calculan mediante las entradas `action: declined` conservadas en `confirmationHistory`; esto permite atribuir el rechazo al lector original aunque posteriormente haya entrado un suplente.
- La vista aclara que **No asistirá** representa una decisión comunicada antes de la misa y no una ausencia física comprobada después de la celebración, porque el sistema todavía no registra asistencia real posterior.
- También se muestra el porcentaje de confirmación entre las decisiones ya registradas. Las asignaciones pendientes no se incluyen en ese porcentaje.
- Los lectores se ordenan primero por mayor cantidad de rechazos, después por confirmaciones y finalmente por nombre.
- Solo aparecen lectores con confirmaciones, rechazos o asignaciones pendientes durante el mes consultado; si no existen registros se presenta un mensaje específico para ese mes.
- El resumen mensual muestra confirmaciones totales, avisos de no asistencia, respuestas pendientes y cantidad de lectores con al menos un rechazo.
- Se actualizaron `public/estadisticas.html`, `private/js/estadisticas.js` y `private/styles.css`.
- `node --check private/js/estadisticas.js`, `node --check server.js` y `git diff --check` finalizaron correctamente; las únicas advertencias fueron las conocidas sobre conversión futura de LF a CRLF.

### Preferencias, alternativas y restricciones de misa por lector

- El modelo de disponibilidad de cada lector pasó de una selección binaria a tres estados por misa: **Preferida**, **Puedo asistir** y **No puedo asistir**.
- Se agregaron los campos `preferredMassIds`, `unavailableMassIds` y `preferenceModel` a los lectores. `availability` se conserva temporalmente como copia de las preferencias para compatibilidad con datos y clientes anteriores.
- Los lectores antiguos que todavía no tengan los campos nuevos continúan interpretándose con la regla anterior: las misas incluidas en `availability` son posibles y las demás no lo son. Al guardarlos desde el formulario nuevo quedan migrados al modelo de tres estados.
- Los formularios administrativos y **Editar mis datos** muestran una sola elección por cada misa, lo cual impide marcar un mismo horario simultáneamente como preferido e imposible.
- Las tarjetas de lectores muestran por separado las misas preferidas, aquellas donde también pueden servir y aquellas a las que no pueden asistir.
- Las rutas del servidor rechazan titularidades, reemplazos y suplencias en una misa marcada como **No puedo asistir**. La restricción se aplica en el servidor además de ocultar esos candidatos en los selectores.
- Los selectores manuales muestran primero a quienes prefieren la misa y después a quienes pueden asistir como alternativa. Los lectores de **Solo suplente** continúan excluidos de puestos titulares.
- La asignación aleatoria conserva las reglas anteriores de rotación de titulares, suplentes, funciones e historial, pero agrega una penalización prioritaria muy alta a los horarios no preferidos.
- El emparejamiento intenta llenar todas las funciones y el suplente mínimo usando preferencias. Solamente recurre a una misa neutral cuando es necesario para conseguir una solución completa. Las misas imposibles nunca generan candidatos.
- Los suplentes adicionales se distribuyen primero entre las misas preferidas compatibles y luego, si hace falta, entre alternativas permitidas.
- **Asignar no asignados** realiza una búsqueda completa con candidatos preferidos antes de intentar cualquiera de las categorías de respaldo con lectores neutrales.
- Cuando se traslada un suplente y se busca reemplazo para la celebración de origen, también se prioriza a quienes prefieren ese horario.
- Al editar un lector, las titularidades y suplencias futuras se limpian únicamente para las misas que ahora haya marcado como imposibles, además de mantener las reglas existentes para inactividad y **Solo suplente**.
- Las estadísticas administrativas por misa ahora muestran cuántos lectores la prefieren, cuántos podrían servir como alternativa y cuántos no pueden asistir.
- La cobertura se clasifica como **Preferida suficiente** cuando las preferencias cubren todas las funciones y un suplente, **Requiere alternativas** cuando solo se completa usando horarios neutrales e **Insuficiente** cuando ni siquiera todas las personas permitidas alcanzan.
- Se agregó `scripts/migrate-reader-preferences.js` y el comando `npm run migrate:reader-preferences` para generar datos ficticios de preferencia y restricción en los lectores actuales.
- La migración distribuye una preferencia principal entre las misas activas, agrega aleatoriamente algunas preferencias y restricciones adicionales y conserva como preferida cualquier misa donde el lector ya aparezca asignado, evitando invalidar la planificación existente.
- Se intentó ejecutar la migración primero en el entorno restringido y después con acceso autorizado. MongoDB no llegó a modificarse porque la conexión falló antes de establecerse con `querySrv ECONNREFUSED _mongodb._tcp.cluster0.5uov4sm.mongodb.net`, el problema DNS local ya documentado.
- Por tanto, el código admite inmediatamente los lectores actuales mediante compatibilidad heredada, pero sus nuevos campos aleatorios continúan pendientes de aplicarse cuando Atlas sea accesible.
- Se actualizaron `server.js`, `private/js/common.js`, `private/js/estadisticas.js`, `private/styles.css` y `package.json`; se agregó `scripts/migrate-reader-preferences.js`.
- `node --check` finalizó correctamente para `server.js`, `private/js/common.js`, `private/js/estadisticas.js` y el script de migración. `git diff --check` no encontró errores, solo las advertencias conocidas de LF a CRLF.
- Durante la verificación inicial `npm test` informó que faltaba `test/server.test.js`. La carpeta apareció posteriormente en el espacio de trabajo sin ser creada ni modificada como parte de este cambio; al repetir la ejecución, las 7 pruebas existentes aprobaron y ninguna falló.

### Fase 1 de revisión del PDF de lectores reales

- Se leyó el PDF real `Ministros de la Palabra_San Antonio.pdf`; el archivo con prefijo `._` es únicamente metadata auxiliar de macOS.
- El documento contiene 31 respuestas de SurveyMonkey y seis horarios: sábado 4:00 p. m., sábado 6:30 p. m., domingo 7:00 a. m., domingo 11:00 a. m., domingo 4:00 p. m. y domingo 6:00 p. m.
- Se encontraron 30 nombres únicos porque una misma persona aparece dos veces con respuestas idénticas. Para la importación debe conservarse una sola copia.
- Treinta respuestas indican que la persona es lectora activa. Una persona omitió esa pregunta y debe confirmarse su estado antes de importar.
- Las 31 respuestas indican interés en continuar sirviendo.
- Veintiséis respuestas indican que la persona realiza moniciones y cinco indican que no.
- Existen tres nombres escritos únicamente con el primer nombre y deben confirmarse sus apellidos antes de importar.
- Una respuesta marca domingo 4:00 p. m. simultáneamente como horario preferido y como horario que no funciona; debe resolverse antes de importar.
- La fase 1 fue únicamente de lectura y análisis. No se modificaron lectores, asignaciones ni MongoDB y todavía no se generaron contraseñas.

#### CSV revisado para la futura importación

- Se creó `data/lectores_reales_revision.csv` con los 30 lectores únicos extraídos del PDF.
- El archivo contiene nombre, estado activo, teléfono vacío, estado de **Solo suplente**, misas preferidas, misas alternativas, misas no disponibles y capacidad para realizar moniciones.
- María Auxiliadora Rodríguez se conservó una sola vez; la respuesta duplicada idéntica no se incluyó.
- Para José Francisco Zumbado Arce, domingo 4:00 p. m. quedó únicamente como **No puede asistir** y se retiró de sus preferencias.
- Oscar Fdo. Arrieta Villalobos quedó marcado como lector activo por confirmación del usuario.
- El nombre incompleto `Lissette` fue reemplazado por `Lissete Salas`, respetando la escritura confirmada por el usuario.
- Los nombres `Ana` y `Patricia` permanecen temporalmente solo con su primer nombre.
- Todos los teléfonos permanecen vacíos y todos los lectores quedaron inicialmente como lectores normales, no como **Solo suplente**, porque el PDF no define esa condición.
- El CSV no contiene contraseñas. Las credenciales temporales se generarán únicamente durante la fase de importación aprobada posteriormente.
- `Import-Csv` confirmó 30 filas, las ocho columnas esperadas y las cuatro correcciones anteriores.
- MongoDB no fue modificado como parte de esta preparación.
- Se corrigió posteriormente el horario que el PDF mostraba como sábado 6:30 p. m.: el horario real es **sábado 6:00 p. m.**. Todas sus apariciones en preferencias, alternativas y restricciones del CSV fueron actualizadas.
- El resumen del CSV corregido contiene 30 lectores activos, 25 que realizan moniciones, 5 que no realizan moniciones y ninguno marcado inicialmente como **Solo suplente**.
- Distribución por misa en el orden preferida / alternativa / no disponible: sábado 4:00 p. m. = 12 / 5 / 13; sábado 6:00 p. m. = 16 / 5 / 9; domingo 7:00 a. m. = 8 / 3 / 19; domingo 11:00 a. m. = 10 / 4 / 16; domingo 4:00 p. m. = 8 / 7 / 15; domingo 6:00 p. m. = 14 / 7 / 9.
- Domingo 7:00 a. m. es el horario con menor cobertura posible, con 11 personas entre preferencias y alternativas. Sábado 6:00 p. m. y domingo 6:00 p. m. tienen la mayor cobertura posible, con 21 personas cada uno.

### Fase 2: importación de lectores reales

- La conexión `mongodb+srv://` continuó fallando desde el proceso administrado con `querySrv ECONNREFUSED`, pero se logró una conexión segura construida en memoria con los tres nodos semilla de Atlas, TLS y las mismas credenciales privadas, sin mostrar la URI.
- Antes de modificar datos se ejecutó `scripts/import-real-readers.js --check`. La validación confirmó 30 lectores y la coincidencia exacta de los seis horarios del CSV con las misas activas de MongoDB, incluido sábado 6:00 p. m.
- Se agregó `data/private/` a `.gitignore` para excluir respaldos y credenciales de Git.
- La importación se ejecutó mediante `scripts/import-real-readers.js --apply` dentro de una transacción de MongoDB.
- Antes de la transacción se creó el respaldo privado `data/private/respaldo-antes-lectores-reales-2026-08-02T18-59-58-331Z.json` con los lectores y asignaciones anteriores.
- Se eliminaron las asignaciones y lectores ficticios y se insertaron los 30 lectores reales aprobados. Las seis misas configuradas se conservaron intactas.
- Los 30 lectores quedaron activos, con teléfono vacío, como lectores normales, con el modelo de preferencias y restricciones, y con `mustChangePassword: true`.
- Cada lector recibió una contraseña temporal aleatoria de 12 caracteres y MongoDB conserva únicamente su hash bcrypt.
- Las credenciales legibles quedaron exclusivamente en el archivo privado ignorado por Git `data/private/credenciales-temporales-lectores-2026-08-02T18-59-58-331Z.csv`.
- Por decisión del usuario, el dato de moniciones del PDF no restringe funciones: todos los lectores continúan siendo candidatos para Moniciones según las reglas generales.
- La verificación posterior `scripts/import-real-readers.js --verify` confirmó 30 lectores, 30 activos, 30 cambios de contraseña pendientes y 0 asignaciones antiguas.
- La API local confirmó igualmente 30 lectores y 0 asignaciones.
- Antes de editar lectores o generar la nueva planificación debe reiniciarse `node server.js` desde la terminal de VS Code que sí conecta con Atlas, para asegurar que el proceso cargue las reglas nuevas de preferencias y restricciones implementadas en `server.js`.

### Planificación de agosto de 2026 importada desde imágenes

- Se revisaron tres imágenes con la planificación de las seis misas semanales de agosto de 2026 y se transcribieron sus titulares, fechas y rotaciones de funciones.
- **Monitor** en las imágenes se vinculó con la función **Moniciones** configurada en las misas.
- La columna rotulada `Marco y Lizzette` para sábado 6:00 p. m. se asignó únicamente a Marco Espinoza, según indicación expresa del usuario.
- Antes de escribir se confirmó en MongoDB que los siete lectores agregados por el usuario existen y están activos: John Corredor, Flor Maria Rosales, Evelia Ramirez, Vicky Murillo, Andrea Sanabria, Wendy Vargas y Ligia Zumbado.
- También se confirmó que Kary Hernández Gonzalez ya tiene domingo 7:00 a. m. como misa preferida y no como restricción.
- Se agregó `scripts/import-august-2026-plan.js` con modos `--check`, `--apply` y `--verify`.
- El modo de validación comprobó que existen todos los lectores, que cada titular puede servir en su misa, que cada celebración contiene las cuatro funciones únicas y que los suplentes pertenecen exclusivamente a horarios preferidos.
- La importación reemplazó únicamente las asignaciones de `2026-08` dentro de una transacción y conservó intactos lectores, misas y otros meses.
- Se guardaron 120 documentos de asignación: 6 misas × 5 fechas × 4 funciones titulares, equivalentes a 30 celebraciones completas.
- No fue posible colocar cuatro suplentes distintos en cada misa: las imágenes utilizan 24 titulares únicos y, con 37 lectores totales, solamente quedan 13 personas libres. Cuatro suplentes por seis horarios habrían requerido 24 lectores adicionales.
- Los 13 lectores libres se distribuyeron todos en misas preferidas, con dos suplentes por horario y tres en domingo 7:00 a. m., el horario de menor cobertura.
- Suplentes: sábado 4:00 p. m. = Rudy Juan José Villaseca Figueroa y Marisol Solano Campos; sábado 6:00 p. m. = Lissete Salas y Juan Sebastián Quirós Murillo; domingo 7:00 a. m. = Dominik Hodgson, Elvira Ortiz y María Chaves Casanova; domingo 11:00 a. m. = José Antonio González Vega y Mauricio Cartín; domingo 4:00 p. m. = Mauren Aguilar Villanea y Juan Luis Mena Soto; domingo 6:00 p. m. = Ana y Gloriela Mora.
- Las listas de suplentes se aplican a las cinco fechas de su misma misa y ninguna persona pertenece a dos horarios.
- Antes de reemplazar agosto se creó `data/private/respaldo-asignaciones-agosto-antes-imagenes-2026-08-02T22-14-34-730Z.json`, excluido de Git.
- La verificación posterior confirmó exactamente 120 asignaciones, 30 celebraciones y coincidencia completa de titulares, fechas, funciones y suplentes con el plan validado.

### Candidatos preferidos y alternativos en las asignaciones

- Los desplegables del modo administrador para titulares, suplentes y reemplazos muestran todos los lectores que pueden servir en la misa; solamente excluyen a quienes la marcaron como no disponible.
- Las opciones aparecen separadas en dos grupos: **Misa preferida** y **Disponible como alternativa**. Cada nombre indica además **Preferida** o **No preferida**.
- Los lectores configurados como **Solo suplente** continúan excluidos de los puestos titulares y de los reemplazos titulares, pero pueden aparecer en los desplegables de suplentes.
- La asignación aleatoria ya aplicaba el mismo criterio: da una prioridad muy alta a las misas preferidas y usa horarios neutrales únicamente cuando hacen falta para completar la planificación.
- La función para completar espacios sin asignar intenta primero lectores que prefieren la misa y después lectores que pueden asistir aunque no la tengan como preferida.
- Las validaciones del servidor rechazan únicamente lectores inactivos, incompatibles por función o que marcaron la misa como no disponible; una misa neutral es una selección válida.
- Se validó la sintaxis de `private/js/common.js` y `server.js`; las siete pruebas automatizadas terminaron correctamente.
- Ajuste posterior solicitado: el desplegable de suplentes también muestra candidatos preferidos y alternativos que ya estén como suplentes de otra misa del mes. Al seleccionarlos, el servidor los retira de la misa anterior y los traslada a la nueva dentro de una transacción, por lo que nunca quedan duplicados.
- Los lectores que ya son titulares durante el mes no aparecen como candidatos a suplente, ya que trasladarlos automáticamente dejaría funciones titulares vacías. Los lectores configurados como **Solo suplente** sí aparecen normalmente.

### Reasignación exclusiva de suplentes de agosto de 2026

- Por solicitud del usuario se recalcularon únicamente los suplentes de agosto, sin modificar ninguno de los 120 documentos titulares ni sus funciones.
- MongoDB confirmó 37 lectores activos, 24 titulares únicos y 13 lectores libres. Con la regla de una sola misa por persona durante el mes, el máximo posible es 13 suplentes; llegar a cuatro por cada una de las seis misas requeriría 24 personas libres.
- Se agregó `scripts/rebalance-august-2026-substitutes.js`, que intenta colocar hasta cuatro suplentes por misa, prioriza preferencias, equilibra las cantidades y verifica el resultado después de escribir.
- Se asignaron los 13 lectores libres y todos quedaron en una misa preferida: domingo 7:00 a. m. recibió tres suplentes y los otros cinco horarios recibieron dos cada uno.
- Distribución final: domingo 7:00 a. m. = Dominik Hodgson, Elvira Ortiz y María Chaves Casanova; domingo 11:00 a. m. = José Antonio González Vega y Mauricio Cartín; domingo 4:00 p. m. = Marisol Solano Campos y Mauren Aguilar Villanea; domingo 6:00 p. m. = Ana y Gloriela Mora; sábado 4:00 p. m. = Rudy Juan José Villaseca Figueroa y Juan Luis Mena Soto; sábado 6:00 p. m. = Lissete Salas y Juan Sebastián Quirós Murillo.
- Antes de aplicar se creó el respaldo privado e ignorado por Git `data/private/respaldo-suplentes-agosto-2026-08-02T22-45-38-593Z.json`.
- La interfaz administrativa muestra siempre un mínimo de cuatro espacios numerados para suplentes en cada misa. Cuando no hay suficientes personas, los espacios restantes permanecen como **Sin asignar**; si ya existen más de cuatro suplentes, todos continúan visibles.

### Reporte en formato tradicional

- Se conservó el reporte mensual existente y se añadió una segunda presentación inspirada en las imágenes de planificación que utiliza el ministerio.
- El formato tradicional agrupa cada misa en una tabla azul con cuatro columnas de titulares; debajo de cada nombre aparecen las fechas del mes y su función abreviada como Primera, Segunda, Salmo o Monitor.
- Debajo de cada misa aparecen cuatro espacios numerados para suplentes. Los espacios que no estén cubiertos muestran **Sin asignar**.
- La sección Reporte incluye tres acciones: **PDF actual**, **PDF tradicional** e **Imagen tradicional**.
- El PDF tradicional se prepara en orientación horizontal, con dos misas por página cuando el navegador respeta la configuración de impresión. El usuario puede elegir **Guardar como PDF** en el diálogo de impresión.
- La imagen tradicional se genera directamente en el navegador como un PNG de alta resolución que contiene todas las misas del mes seleccionado.
- La vista y las exportaciones son dinámicas: usan el mes seleccionado, las misas activas y las asignaciones guardadas, por lo que no están limitadas a agosto de 2026.
- El formato se agregó a `asignar.html`, `reporte.html` y las demás páginas compartidas que contienen la sección de reporte.
- Ajuste posterior: el botón **PDF tradicional** utiliza ahora exactamente el mismo lienzo gráfico que genera **Imagen tradicional**. El PDF y el PNG comparten colores, bordes, proporciones, tipografía, distribución y espacios de suplentes; el PDF ya no reconstruye el diseño con estilos de impresión separados.

### Sección pública de cobertura por misa

- Se añadió una nueva sección de solo lectura llamada **Cobertura**, disponible tanto para lectores como para administradores mediante `/cobertura.html` y `/admin/cobertura.html`.
- La vista utiliza por defecto el mes actual de Costa Rica, igual que el resto del planificador. El selector mensual del encabezado permite consultar otros meses.
- El usuario selecciona una misa y puede buscar lectores por nombre.
- Para la misa seleccionada se muestran totales de titulares, suplentes oficiales, lectores que la prefieren y lectores que pueden asistir como alternativa.
- Todos los lectores activos aparecen clasificados en tres grupos: **Prefieren esta misa**, **Pueden asistir como alternativa** y **No pueden asistir**.
- Junto a cada lector se indica dónde participa durante el mes: como titular o suplente y el nombre de la misa correspondiente. Si no participa, aparece **Sin asignación en este mes**.
- Los titulares y suplentes oficiales de la misa seleccionada tienen una etiqueta adicional para identificarlos rápidamente.
- La sección no contiene controles de edición y no muestra teléfonos, contraseñas ni otros datos privados. Cualquier modificación real continúa realizándose desde la sección administrativa de asignaciones.

## Actualización del 3 de agosto de 2026

### Filtro de asignaciones por misa

- Se agregó a `public/asignar.html` el selector **Filtrar por misa**, junto al filtro existente por lector.
- El selector incluye las misas activas que tienen celebraciones en el mes consultado y muestra el nombre y horario de cada una.
- Al escoger una misa, el tablero conserva visibles todas sus fechas, funciones, titulares y suplentes del mes.
- El filtro por misa puede combinarse con **Filtrar por lector**. Cuando ambos están seleccionados, la misa aparece únicamente si el lector participa en ella como titular o suplente durante ese mes.
- Cuando un lector no participa en la misa seleccionada se muestra un mensaje específico, sin alterar las asignaciones.
- El botón **Limpiar** restablece simultáneamente los filtros de lector y misa, y permanece desactivado cuando ninguno está activo.
- El filtro es exclusivamente visual, funciona en modo público y administrativo y no requiere cambios en MongoDB ni en la API.
- Se ajustó `private/styles.css` para que los dos selectores y el botón se apilen correctamente en pantallas de hasta 700 px.
- Se actualizaron `public/asignar.html`, `private/js/common.js` y `private/styles.css`.
- `node --check private/js/common.js` y `git diff --check` finalizaron correctamente. Las advertencias de Git corresponden solamente a la conversión conocida de LF a CRLF.
- `npm test` finalizó con las 7 pruebas aprobadas y 0 fallidas.

### Noticias y avisos pastorales

- Se creó la sección pública **Noticias**, disponible en `/noticias.html`, y su versión administrativa protegida en `/admin/noticias.html`.
- Se agregó el enlace **Noticias** a la navegación de las páginas principales y de Estadísticas.
- Las noticias se almacenan en la nueva colección `news` de MongoDB, con índices por identificador y vigencia.
- Cada noticia contiene título, mensaje, fecha y hora de inicio, fecha y hora de expiración, estado activo, fecha de creación y fecha de actualización.
- El servidor valida que título y mensaje existan, que las fechas sean reales y que la expiración sea posterior al inicio.
- La vigencia se calcula con la zona horaria `America/Costa_Rica`. La API pública devuelve únicamente noticias activas cuyo inicio ya llegó y cuya expiración todavía no ha pasado.
- En modo administrador se pueden crear, editar, activar, desactivar y eliminar noticias. Las noticias programadas, vencidas e inactivas permanecen visibles como historial administrativo con su estado correspondiente.
- La escritura y eliminación de noticias requieren una sesión administrativa válida; una comprobación HTTP confirmó que un `POST /api/news` sin sesión recibe HTTP 401.
- Cuando no existen noticias activas, `noticias.html` muestra un estado vacío amigable. En Inicio no se agrega ningún bloque y el contenido permanece igual.
- Cuando existe una noticia activa, Inicio muestra un aviso fijo. Cuando existen varias, se presenta un carrusel que cambia cada cinco segundos, con controles anterior/siguiente e indicadores para seleccionar una noticia.
- El carrusel se pausa durante la interacción con mouse o teclado y la lista pública se actualiza cada minuto para retirar noticias vencidas sin recargar manualmente la página.
- Los mensajes se insertan como texto escapado y no admiten HTML libre, evitando que el contenido administrativo introduzca scripts o marcado inseguro.
- Se agregaron `public/noticias.html` y `private/js/noticias.js`. Se actualizaron `server.js`, `private/js/common.js`, `private/styles.css`, las páginas principales de navegación y `test/server.test.js`.
- `node --check` finalizó correctamente para `server.js`, `private/js/common.js` y `private/js/noticias.js`; `git diff --check` no encontró errores, aparte de las advertencias conocidas de LF a CRLF.
- La suite aumentó a 8 pruebas: todas aprobaron y ninguna falló. La prueba nueva comprueba la validación de contenido, orden temporal y fechas imposibles.
- Se reinició la instancia local con el código actualizado. `/api/news` y `/noticias.html` respondieron HTTP 200; al momento de verificar existían 0 noticias activas y no se crearon datos ficticios.

### Diagnóstico del botón Ver asignaciones de Inicio

- El botón **Ver asignaciones** de `public/index.html` no navega a `/asignar.html`.
- Es un elemento `button` con `data-view="assign"` y no contiene un enlace `href`.
- El manejador compartido de `private/js/common.js` intercepta cualquier elemento con `data-view` y ejecuta `showView('assign')`.
- Esta función permanece en la misma URL y activa la sección interna `<section id="assign">` que todavía está incluida dentro de `public/index.html`.
- La causa es la arquitectura anterior de vistas internas: varias páginas conservan copias de las secciones compartidas, aunque la navegación lateral sí utiliza el archivo independiente `/asignar.html`.
- No se modificó el funcionamiento durante este diagnóstico.

### Navegación de Inicio a la página de asignaciones

- El botón principal **Ver asignaciones / Crear asignaciones** de `public/index.html` se convirtió en un enlace real hacia `/asignar.html`.
- El atributo compartido `data-page-link` transforma automáticamente el destino en `/admin/asignar.html` cuando la página está en modo administrador; en modo público conserva `/asignar.html`.
- Se eliminó de `public/index.html` la sección interna duplicada `#assign`, por lo que Inicio ya no genera ni muestra allí el tablero de asignaciones.
- La lógica compartida de `private/js/common.js` ahora renderiza y conecta los eventos del tablero únicamente cuando `#assignmentBoard` existe. Esto permite retirar el tablero de Inicio sin afectar la página independiente de asignaciones.
- Se agregó un estilo específico en `private/styles.css` para que el nuevo enlace conserve la apariencia del botón principal y no muestre subrayado.
- Se actualizaron `public/index.html`, `private/js/common.js` y `private/styles.css`.
- `node --check private/js/common.js` y `git diff --check` finalizaron correctamente.
- `npm test` finalizó con las 8 pruebas aprobadas y 0 fallidas.

### Mensajes visibles para errores de contraseña

- Se corrigió el problema por el cual los errores de contraseña se enviaban al aviso global y quedaban ocultos detrás de un diálogo modal abierto.
- Los errores de **Confirmar**, **No puedo asistir**, **Cambiar contraseña** y **Editar mis datos** aparecen ahora dentro del mismo formulario que solicita la credencial.
- También se muestra dentro del diálogo el mensaje cuando las dos contraseñas nuevas no coinciden o cuando falla la validación al guardar los datos personales.
- El mensaje permanece visible para permitir corregir el dato, se limpia al volver a intentar o abrir el formulario nuevamente y utiliza `role="alert"` con `aria-live="polite"` para accesibilidad.
- El acceso administrativo conserva su mensaje interno existente en `login.html`.
- Se actualizaron `private/js/common.js` y `private/styles.css`.
- `node --check private/js/common.js`, `git diff --check` y `npm test` finalizaron correctamente; las 8 pruebas aprobaron y ninguna falló.

### Mensajes internos en los demás diálogos

- Se extendió la corrección de mensajes ocultos a todos los casos detectados donde un diálogo modal permanecía abierto.
- Los errores al crear o editar lectores, misas y noticias aparecen ahora dentro de su formulario, en lugar de utilizar el aviso global situado detrás del modal.
- Si la actualización automática de Noticias falla mientras se está editando una noticia, el error también se presenta dentro de ese diálogo.
- Las acciones **Copiar** de la contraseña temporal y del reporte de Eucaristía muestran ahora una confirmación verde dentro del diálogo abierto.
- Los mensajes anteriores se eliminan al reabrir el formulario o antes de un nuevo intento.
- Se reutiliza un componente accesible con `role="alert"` para errores, `role="status"` para confirmaciones y `aria-live="polite"`.
- Se actualizaron `private/js/common.js`, `private/js/noticias.js` y `private/styles.css`.
- `node --check` finalizó correctamente para ambos JavaScript, `git diff --check` no encontró errores y `npm test` terminó con 8 pruebas aprobadas y 0 fallidas.

### Confirmación al copiar y unificación de Monitor

- Al pulsar **Copiar** en el reporte de Eucaristía se abre ahora un diálogo explícito con el texto **Reporte copiado**, una indicación de que ya puede pegarse en WhatsApp y el botón **Aceptar**.
- El diálogo de confirmación aparece encima del formulario del reporte y debe cerrarse de manera consciente; ya no se utiliza un aviso temporal para esta acción.
- Las funciones configuradas con nombres que contengan **Moniciones** o **Monitor** ya no se muestran como un campo dinámico adicional en el reporte.
- El lector asignado a esa función se precarga únicamente en el campo **Monitor**.
- El texto copiado para WhatsApp incluye una sola línea **Monitor**, eliminando la duplicación anterior entre **Moniciones** y **Monitor**.
- Se actualizó `private/js/common.js`.
- `node --check private/js/common.js`, `git diff --check` y `npm test` finalizaron correctamente; las 8 pruebas aprobaron y ninguna falló.
- La instancia local dejó de responder en el puerto 3000 durante la comprobación HTTP posterior; no se reinició automáticamente y la revisión final del cambio se completó de forma estática.

## Contexto adicional del 4 de agosto de 2026

### Proyecto separado: quiniela deportiva mundialista

- El usuario recordó que también se trabajó anteriormente en una quiniela deportiva mundialista.
- Ese proyecto es independiente de la aplicación Lectores y se encuentra en `https://github.com/mespinoza86/quinieladeportivamundialista.git`.
- El repositorio público contiene una aplicación principalmente en JavaScript, con servidor Node.js y archivos de equipos, jornadas, jugadores y resultados.
- Esta referencia se conserva solamente para recuperar el contexto en conversaciones futuras; no se modificó el repositorio de la quiniela ni el código de Lectores.

### Confirmaciones semanales en formato de acordeón

- La sección **Misas de esta semana** de Inicio ahora presenta cada celebración como un acordeón compacto.
- Todas las misas aparecen cerradas inicialmente y muestran únicamente su nombre, fecha, hora y una flecha de apertura.
- Al pulsar el encabezado o utilizarlo desde el teclado se despliegan las funciones, lectores, estados de confirmación, controles disponibles, suplentes y la acción de reporte cuando corresponda.
- Al pulsarlo nuevamente se contrae la información y la flecha gira para indicar visualmente el estado.
- Cada misa se abre y cierra de forma independiente; no se abre ninguna automáticamente.
- La implementación utiliza los elementos HTML nativos `details` y `summary`, manteniendo accesibilidad por teclado sin agregar estado manual innecesario en JavaScript.
- Se actualizaron `private/js/common.js` y `private/styles.css`.
- `node --check private/js/common.js` y `git diff --check` finalizaron correctamente.
- `npm test` finalizó con las 8 pruebas aprobadas y 0 fallidas.

### Propuesta pendiente: sustitución acordada para una celebración específica

- Se identificó un caso frecuente que los suplentes oficiales de una misa no siempre resuelven: el titular consigue por su cuenta a una persona asignada o suplente de otro horario que puede cubrirlo únicamente en una fecha concreta.
- La solución propuesta es un flujo de **sustitución acordada para una celebración específica**, independiente de la planificación mensual y sin requerir que ambas personas estén juntas ni utilicen el mismo teléfono.
- Flujo propuesto:
  - El titular pulsa **Solicitar sustitución** en su asignación concreta.
  - Valida su identidad mediante su contraseña personal.
  - Selecciona a la persona con quien previamente acordó el posible reemplazo.
  - El sistema crea una solicitud pendiente y genera un enlace único para compartir.
  - El titular utiliza una acción **Enviar por WhatsApp** para mandar el enlace al sustituto.
  - El sustituto abre el enlace desde su propio dispositivo, revisa la misa, fecha y función, y valida su identidad con su propia contraseña.
  - El sustituto puede aceptar o rechazar la solicitud.
  - Solo después de su aceptación se registra el reemplazo para esa misa, fecha y función exactas.
- El enlace por sí solo no debe autorizar el cambio. Debe contener un token aleatorio, ser de un solo uso, tener vencimiento y exigir la contraseña del sustituto seleccionado.
- El enlace debe quedar inválido después de aceptar, rechazar, vencer o alcanzar la hora de inicio de la misa.
- El titular debería poder consultar los estados **Esperando respuesta**, **Sustitución aceptada**, **Solicitud rechazada** y **Solicitud vencida**.
- Se recomienda conservar en el historial el titular original, el sustituto acordado, las fechas de solicitud y respuesta y las decisiones de ambas personas, en lugar de sobrescribir sin trazabilidad el `readerId` original.
- La interfaz podría mostrar el resultado como **Juan Pérez — sustituye a Marco Espinoza**.
- El sustituto conservaría sus asignaciones y suplencias habituales de otros horarios porque el cambio sería una excepción puntual, siempre que no tenga una celebración incompatible en la misma fecha y hora.
- Reglas propuestas: ambas personas deben estar activas; el sustituto no debe tener conflicto de horario; debe verificarse su disponibilidad para la misa; y el administrador debe conservar la capacidad de cancelar o corregir el acuerdo.
- Si el sustituto rechaza o no responde, la asignación original permanece y continúa disponible el procedimiento normal con suplentes oficiales.
- Esta funcionalidad se documentó únicamente como propuesta para una implementación futura. No se modificó el código ni MongoDB.

### Eliminación de la vista Calendario

- Se eliminó completamente la función **Calendario** porque no aportaba suficiente utilidad al flujo actual.
- Se retiró el acceso **Calendario** de la navegación compartida en `public/index.html`, `public/lectores.html`, `public/misas.html`, `public/asignar.html` y `public/reporte.html`.
- También se retiró el enlace administrativo al calendario de `public/estadisticas.html`.
- Se eliminó el botón **Ver calendario →** de la sección **Misas de esta semana** en todas las páginas que conservan la vista de Inicio.
- Se eliminaron las secciones internas `#calendar` y los contenedores `#calendarGrid` de las páginas compartidas.
- Se retiraron de `private/js/common.js` la función `renderCalendar`, su llamada durante el renderizado y el título de vista asociado.
- Se eliminaron de `private/styles.css` los estilos exclusivos de la cuadrícula mensual, días y eventos del calendario, incluidos sus ajustes móviles.
- Los textos generales del encabezado ahora hablan de **planificación** en lugar de calendario.
- Se conservaron las funciones de fechas y ocurrencias que siguen siendo necesarias para asignaciones, confirmaciones, cobertura y reportes.
- Una búsqueda completa confirmó que no quedan referencias a `calendar`, `calendario`, `calendarGrid`, `renderCalendar`, `cal-head` ni `cal-event` en `public`, `private` o `server.js`.
- `node --check private/js/common.js`, `node --check server.js` y `git diff --check` finalizaron correctamente.
- `npm test` finalizó con las 8 pruebas aprobadas y 0 fallidas.

### Menú completo en Noticias

- Se corrigió la navegación de `public/noticias.html`, que tenía un menú independiente y omitía los accesos **Lectores** y **Misas**.
- Se agregaron ambos enlaces en el mismo orden del menú principal: Inicio, Lectores, Misas, Asignar, Noticias, Cobertura y Reporte.
- Los nuevos enlaces utilizan `data-page-link`, por lo que `private/js/noticias.js` conserva `/lectores.html` y `/misas.html` en modo público y los transforma en `/admin/lectores.html` y `/admin/misas.html` en modo administrador.
- No fue necesario modificar el servidor ni MongoDB.
- `node --check private/js/noticias.js` y `git diff --check` finalizaron correctamente.
- `npm test` finalizó con las 8 pruebas aprobadas y 0 fallidas.

### Fechas de vigencia ocultas en Noticias públicas

- Las noticias en modo público ya no muestran los campos **Desde** y **Hasta**.
- Las fechas de inicio y expiración continúan visibles en modo administrador para permitir la gestión de la vigencia de cada aviso.
- La API conserva sin cambios su filtrado temporal: el público solo recibe noticias activas que ya comenzaron y todavía no vencieron.
- Se actualizó `private/js/noticias.js`.
- `node --check private/js/noticias.js` y `git diff --check` finalizaron correctamente.
- `npm test` finalizó con las 8 pruebas aprobadas y 0 fallidas.

### Intervalo del carrusel de Noticias

- El carrusel de noticias de Inicio ahora cambia automáticamente cada 10 segundos en lugar de cada 5 segundos.
- Se conservaron los controles anterior/siguiente, los indicadores y la pausa durante la interacción con mouse o teclado.
- Se actualizó `private/js/common.js`.
- `node --check private/js/common.js` y `git diff --check` finalizaron correctamente.
- `npm test` finalizó con las 8 pruebas aprobadas y 0 fallidas.

## Conversación del 4 de agosto de 2026

### Propuesta pendiente de barra de navegación inferior

- El usuario señaló como referencia la barra de la aplicación Quiniela Deportiva, que contiene los accesos **Inicio**, **Jornadas**, **Reglamento** y **Tabla**.
- El patrón entendido es una barra inferior compacta, siempre disponible y similar a la navegación de una aplicación móvil, con pocos destinos principales y una indicación visual de la sección activa.
- Se desea evaluar una barra equivalente para la aplicación Lectores, adaptada a sus propias secciones y a su diseño actual.
- La propuesta solamente fue revisada y documentada. Todavía no se decidió qué accesos incluir ni se modificaron HTML, CSS o JavaScript.

### Barra de navegación inferior para celulares

- Se implementó una barra inferior fija para pantallas de hasta 850 px, inspirada en la navegación de la Quiniela Deportiva.
- La barra contiene cuatro accesos: **Inicio**, **Lectores**, **Cobertura** y **Asignaciones**.
- Cada acceso muestra un icono y su texto; la sección actual queda resaltada y utiliza `aria-current="page"` para mejorar la accesibilidad.
- Las rutas se adaptan automáticamente al modo de uso: en modo público enlazan a las páginas públicas y en modo administrador conservan las rutas protegidas `/admin/...` y `/adminmode.html`.
- La barra aparece en las páginas principales, Noticias y Estadísticas, pero permanece oculta en escritorio, en el formulario de acceso y durante la impresión.
- Se reservó espacio al final del contenido para que la barra no tape información, se respetó `safe-area-inset-bottom` para teléfonos con zona segura y los avisos emergentes se muestran por encima de ella.
- Se agregó `private/js/mobile-nav.js` y se actualizó `private/styles.css`, además de incluir el nuevo script en `public/index.html`, `public/lectores.html`, `public/misas.html`, `public/asignar.html`, `public/reporte.html`, `public/noticias.html` y `public/estadisticas.html`.
- `node --check` finalizó correctamente para el nuevo script y los JavaScript compartidos; `git diff --check` no encontró errores, aparte de las advertencias conocidas de LF a CRLF.
- `npm test` finalizó con las 8 pruebas aprobadas y 0 fallidas.

### Filtro de la página Lectores por nombre

- Se agregó a `public/lectores.html` un selector **Filtrar por lector** y un botón **Limpiar** antes del listado de tarjetas.
- Los nombres del selector aparecen ordenados alfabéticamente en español, sin distinguir mayúsculas y minúsculas para el orden.
- Al seleccionar una persona se muestra únicamente su tarjeta; **Limpiar** restaura el listado completo.
- El botón permanece desactivado mientras no exista un filtro seleccionado.
- El filtro es exclusivamente visual, funciona tanto en modo público como administrador y no modifica lectores ni MongoDB.
- La lista completa de tarjetas también queda presentada alfabéticamente para mantener consistencia con el selector.
- Se actualizaron `public/lectores.html` y `private/js/common.js`; se reutilizó el diseño adaptable de los filtros de asignaciones.
- `node --check private/js/common.js` y `git diff --check` finalizaron correctamente; las advertencias corresponden solamente a la conversión conocida de LF a CRLF.
- `npm test` finalizó con las 8 pruebas aprobadas y 0 fallidas.

### Ojo para mostrar y ocultar contraseñas

- Todos los campos de contraseña de la aplicación muestran ahora un botón con icono de ojo dentro del campo.
- Las contraseñas permanecen ocultas inicialmente. Al pulsar el ojo se muestran y al pulsarlo nuevamente vuelven a ocultarse.
- El comportamiento cubre el acceso administrativo, la contraseña actual y las dos entradas de contraseña nueva, la confirmación o rechazo de asistencia y la autenticación para **Editar mis datos**.
- El componente compartido también detecta campos de contraseña creados dinámicamente después de cargar la página, por lo que cubre los diálogos generados mediante JavaScript y futuros campos equivalentes.
- Cada campo se controla de forma independiente. Al reiniciar un formulario o cerrar su diálogo, cualquier contraseña visible vuelve automáticamente al estado oculto.
- El botón tiene un área táctil de 44 px, estados de foco y textos accesibles **Mostrar contraseña** y **Ocultar contraseña** mediante `aria-label`, `aria-pressed` y `title`.
- Se agregó `private/js/password-toggle.js`, se retiró el control anterior basado en los textos **Mostrar/Ocultar** de `private/js/login.js` y se actualizó el campo de `public/login.html`.
- El script compartido se incluyó en todas las páginas principales, Noticias, Estadísticas y Login. Los estilos generales se actualizaron en `private/styles.css`.
- `node --check` finalizó correctamente para `private/js/password-toggle.js`, `private/js/login.js` y `private/js/common.js`; `git diff --check` no encontró errores, aparte de las advertencias conocidas de LF a CRLF.
- `npm test` finalizó con las 8 pruebas aprobadas y 0 fallidas.

## Continuidad retomada el 11 de agosto de 2026

### Revisión inicial de la sesión

- Se leyó completo `CONTINUAR_PROYECTO.md` para recuperar el historial funcional y técnico del proyecto.
- Se confirmó que la última sesión documentada fue la del 4 de agosto de 2026.
- El último trabajo implementado fue el control con icono de ojo para mostrar u ocultar contraseñas. En esa misma sesión también se agregaron la barra inferior para celulares y el filtro alfabético de lectores.
- La principal funcionalidad diseñada pero todavía no implementada es la **sustitución acordada para una celebración específica**, mediante una solicitud con enlace de un solo uso, vencimiento, autenticación de ambas personas y trazabilidad.
- La rama actual es `main`, está sincronizada con `origin/main` y al iniciar la revisión no tenía cambios locales pendientes.
- El commit más reciente es `9ed19f8`, del 4 de agosto de 2026, con el mensaje `arreglando reporte de misas`.
- Se comprobó correctamente la sintaxis de `server.js`, `private/js/common.js`, `private/js/noticias.js`, `private/js/mobile-nav.js` y `private/js/password-toggle.js`.
- `git diff --check` no reportó errores.
- `npm test` no pudo iniciar porque las dependencias locales no están instaladas: Node.js no encontró el paquete `dotenv`. No se modificó código ni se instalaron paquetes durante esta revisión.

### Punto exacto para continuar

- Antes de desarrollar otra función conviene ejecutar `npm.cmd install` y repetir `npm.cmd test` para recuperar una base verificable de 8 pruebas aprobadas.
- Después, la prioridad funcional recomendada es implementar la sustitución acordada por fecha, porque resuelve un caso real ya definido y actualmente no cubierto por los suplentes oficiales.
- Esa función debe diseñarse con persistencia e historial desde el inicio, sin sobrescribir al titular original, y debe validar vencimiento, contraseñas, disponibilidad y conflictos de horario en el servidor.
- Como prioridades de seguridad para un lanzamiento siguen pendientes la rotación de la credencial de MongoDB previamente compartida, la revisión de la contraseña inicial de los lectores y la confirmación de la configuración de producción con HTTPS y `NODE_ENV=production`.
- También sigue siendo recomendable ampliar las pruebas de integración para las rutas administrativas, asignaciones, sustituciones y transacciones de MongoDB.

### Acuerdo de documentación para esta sesión

- Por solicitud del usuario, todo cambio, diagnóstico, decisión y verificación realizados durante el 11 de agosto de 2026 se agregará a este documento conforme avance el trabajo.

## Continuidad retomada el 14 de agosto de 2026

### Revisión inicial de la sesión

- Se leyó nuevamente el contenido completo de `CONTINUAR_PROYECTO.md` y se contrastó con el estado actual del repositorio.
- No existen commits posteriores al 4 de agosto de 2026. El commit más reciente continúa siendo `9ed19f8`, con el mensaje `arreglando reporte de misas`.
- La rama actual continúa siendo `main` y aparece sincronizada con `origin/main`.
- El único cambio local al comenzar esta sesión era el propio `CONTINUAR_PROYECTO.md`, actualizado durante la revisión del 11 de agosto y todavía sin commit.
- A diferencia de la revisión del 11 de agosto, la carpeta `node_modules` ya está presente y las dependencias necesarias pueden cargarse correctamente.
- `npm.cmd test` finalizó con las 8 pruebas aprobadas y 0 fallidas.
- `node --check` finalizó correctamente para `server.js`, `private/js/common.js` y `private/js/noticias.js`.
- `git diff --check` no encontró errores; solamente mostró la advertencia conocida sobre una futura conversión de LF a CRLF en este documento.

### Punto actual y recomendación

- La base local está nuevamente verificable y no existe un fallo técnico inmediato que deba corregirse antes de desarrollar.
- El siguiente trabajo funcional recomendado continúa siendo la **sustitución acordada para una celebración específica**, ya definida conceptualmente pero aún no implementada.
- Conviene implementar esa funcionalidad por etapas: modelo persistente e índices; API segura para crear, consultar, aceptar, rechazar y cancelar solicitudes; validaciones de vencimiento y conflictos; interfaz del titular y del sustituto; integración con WhatsApp; y pruebas automatizadas.
- Antes de publicarla deben mantenerse las reglas ya acordadas: enlace aleatorio de un solo uso, contraseña obligatoria de cada participante, vencimiento al iniciar la misa, historial del titular original y del sustituto, y control administrativo.
- Si se prioriza preparación para producción en vez de una función nueva, el siguiente bloque recomendado es rotar la credencial de MongoDB, revisar la exposición pública de notas e historial, confirmar HTTPS y `NODE_ENV=production`, y ampliar las pruebas de integración.

### Acuerdo de documentación para esta sesión

- Por solicitud del usuario, todo cambio, diagnóstico, decisión y verificación realizados durante el 14 de agosto de 2026 se agregará a este documento conforme avance el trabajo.

## Continuidad retomada el 31 de agosto de 2026

### Revisión completa de código solicitada

- Se leyó nuevamente `CONTINUAR_PROYECTO.md` y se revisó todo el código: `server.js`, los JavaScript de `private/js`, las páginas de `public`, los scripts de importación y la suite de pruebas.
- Estado inicial verificado: rama `main` sincronizada con `origin/main`, commit más reciente `9ed19f8`, `npm test` con 8 pruebas aprobadas y `.env` correctamente ignorado por Git.

### Hallazgo crítico: caída del proceso con una sola petición

- `server.js` construía `new URL(req.url, ...)` con la cabecera `Host` sin protección. Una cabecera malformada lanzaba una excepción síncrona dentro del manejador de `request`, que Node convertía en `uncaughtException` y terminaba el proceso.
- Se reprodujo con `GET / HTTP/1.1` y `Host: [`: el servidor respondía con `TypeError: Invalid URL` y salía con código 1.
- Se detectó un segundo vector idéntico en `cookies()`: `decodeURIComponent` lanzaba `URIError` ante una cookie como `admin_session=%`, y esa función se invoca desde `adminSession()` en casi todas las rutas y en cada página administrativa.
- Ambos permitían que cualquier persona con `curl` derribara la aplicación publicada de forma repetible.

### Correcciones aplicadas

- El manejador HTTP envuelve la construcción de la URL en `try/catch` y responde HTTP 400 con `Connection: close` ante una cabecera `Host` inválida.
- `cookies()` ignora individualmente las cookies con codificación inválida en lugar de interrumpir la petición.
- La llamada asíncrona `api(req, res, url)` ahora lleva `.catch()`, y `serve()` quedó dentro de `try/catch`. Ambos registran el fallo y responden HTTP 500 si todavía no se enviaron cabeceras.
- Se agregaron `process.on('uncaughtException')` y `process.on('unhandledRejection')` como última red: registran el error y mantienen el proceso sirviendo. Se aplicaron después de corregir las causas conocidas, no en lugar de ellas.
- Se eliminó la constante `DEFAULT_READER_PASSWORD` y los parámetros por defecto de `legacyReaderPasswordHash` y `readerPasswordHash`. `readerPasswordMatches` ahora devuelve `false` cuando el lector no tiene `passwordHash`; antes ese caso aceptaba la contraseña `11111111`, comportamiento que se comprobó ejecutando la función real.
- Se corrigieron dos mensajes con codificación UTF-8 dañada visibles para el usuario: `Debes iniciar sesión como administrador` y el `Contraseña incorrecta` del acceso administrativo. Una búsqueda posterior confirmó que no queda mojibake en el repositorio.

### Pruebas y verificación

- Se agregaron tres pruebas de regresión: la cabecera `Host` malformada responde 400 sin derribar el proceso, una cookie inválida no interrumpe la sesión administrativa y un lector sin hash almacenado nunca acepta una contraseña.
- La prueba del `Host` es de integración real: levanta el servidor exportado en un puerto libre y envía la petición cruda por socket.
- `npm test` finalizó con 11 pruebas aprobadas y 0 fallidas.
- `node --check` finalizó correctamente para `server.js`, todos los JavaScript de `private/js`, la suite de pruebas y los scripts de `scripts/`.
- `git diff --check` no encontró errores; solo la advertencia conocida de conversión LF a CRLF.
- Verificación directa contra el servidor real tras el arreglo: `Host: [` responde 400, `Cookie: admin_session=%` responde 200 y la petición normal responde 200, con el proceso vivo tras los tres intentos.
- MongoDB no fue consultado ni modificado durante esta sesión.

### Pendientes identificados y todavía sin corregir

- Se revisó que `data/lectores_reales_revision.csv` está rastreado por Git y contiene nombre y horarios de disponibilidad de los 30 lectores reales. Por decisión expresa del usuario el archivo se conserva donde está y no debe moverse ni retirarse del control de versiones. No es un pendiente.
- La credencial de MongoDB compartida en julio sigue sin rotarse.
- El limitador del login administrativo reinicia su contador al bloquear, por lo que concede cinco intentos nuevos cada minuto, y su `Map` en memoria crece sin límite. Detrás del proxy de Render agrupa a todos los visitantes bajo una sola dirección.
- `GET /api/assignments` continúa siendo público, sin filtro de mes y devolviendo `confirmationHistory` y `originalReaderId`. Un parámetro `?month=` resolvería la exposición y el crecimiento del payload.
- Duplicación del HTML: las cinco páginas principales repiten las mismas secciones y diálogos; `misas.html` y `reporte.html` tienen conjuntos de identificadores idénticos. Ya causó el fallo del botón **Ver asignaciones** diagnosticado el 3 de agosto.
- `private/js/common.js` tiene 56 KB en 364 líneas: 24 líneas superan los 500 caracteres y `renderCoverage` ocupa 2932 en una sola. Conviene pasarlo por un formateador y dividirlo en módulos antes de agregar funciones nuevas.
- La suite cubre funciones puras; las reglas de exclusividad mensual, propagación por alcance y traslado de suplentes siguen sin pruebas.
- Sigue pendiente la **sustitución acordada para una celebración específica**, que continúa siendo la prioridad funcional.

### Filtro de asignaciones por mes y ocultamiento del historial

- `GET /api/assignments` ya no devuelve siempre la colección completa. Acepta `?months=2026-08,2026-09` o `?month=2026-08`, valida cada valor contra `^\d{4}-\d{2}$` y descarta el resto, con un tope de doce meses por consulta.
- Sin parámetros, el administrador sigue recibiendo todo el historial, que es lo que necesita la vista de Estadísticas. El público recibe únicamente el mes actual de Costa Rica y el anterior.
- Un valor inválido, incluido un intento de inyectar un operador de MongoDB como `{"$ne":null}`, nunca llega a la consulta: cae en la ventana por defecto.
- Se agregó `publicAssignment`, que elimina `confirmationHistory` y `originalReaderId` de las respuestas al público. `confirmationStatus` sigue siendo público porque la interfaz lo muestra. El saneado trabaja sobre una copia y no altera el documento original.
- `estadisticas.js` es el único cliente que usa `confirmationHistory` y es una página administrativa, por lo que no se ve afectado.
- En el cliente se agregó `neededMonths()`, que pide solo el mes seleccionado y el actual con sus vecinos: como máximo seis meses. Cubre la semana en curso y los reportes pendientes de los últimos siete días cuando cruzan el cambio de mes.
- Cambiar el mes en el selector ahora ejecuta `load()` en vez de solo `render()`, porque los datos del mes nuevo ya no vienen en la carga inicial.
- Se comprobó el cruce de año en ambos sentidos: enero pide diciembre del año anterior y diciembre pide enero del siguiente.
- Se agregaron cinco pruebas del filtro y del saneado. `npm test` finalizó con 16 aprobadas y 0 fallidas.

### Formateo y división de `private/js/common.js`

- Se agregó Prettier como dependencia de desarrollo, con `.prettierrc` (ancho 110, comillas simples, CRLF) y `.prettierignore`. Se añadieron los comandos `npm run format` y `npm run format:check`.
- Se formatearon todos los JavaScript de `private/js`. `common.js` pasó de 364 líneas con 24 de más de 500 caracteres a 1502 líneas legibles. La línea más larga bajó de 2932 a 1558 caracteres.
- El archivo se dividió en seis partes que se cargan en este orden obligatorio: `common-base.js`, `common-datos.js`, `common-vistas.js`, `common-reporte-tradicional.js`, `common-ui.js` y `common-eventos.js`.
- Se mantienen como scripts clásicos, no como módulos ES, para conservar el ámbito léxico compartido y no cambiar la semántica. Los cinco cargadores por página (`index.js`, `lectores.js`, `misas.js`, `asignar.js`, `reporte.js`) escriben las seis etiquetas en orden y `common.js` fue retirado.
- El corte se hizo únicamente en fronteras de sentencia de nivel superior, arrastrando los comentarios que preceden a cada bloque.

### Verificación de que el formateo y la división no cambiaron el código

- Se comparó el AST del `common.js` original con el de la concatenación de las seis partes finales, podando posiciones y metadatos: **AST idéntico**.
- Se comprobó además que la concatenación de las seis partes era byte a byte idéntica al `common.js` formateado.
- Se verificó automáticamente el orden de carga: ninguna sentencia que se ejecuta al cargar referencia un identificador declarado en un archivo posterior. Esto importa porque el *hoisting* de funciones no cruza entre scripts clásicos separados. Casi todo lo ejecutable son registros de `addEventListener`, cuyos cuerpos corren mucho después de cargar las seis partes.
- Se comprobó también el AST de `estadisticas.js`, `noticias.js`, `login.js`, `mobile-nav.js` y `password-toggle.js` contra su versión en Git: idénticos en los cinco.
- Durante el proceso se detectaron y corrigieron dos errores propios del utilitario de división: Prettier devuelve posiciones sobre el texto normalizado a LF, lo que al cortar sobre el texto CRLF partía una función por la mitad; y la poda inicial del AST no excluía los campos posicionales con prefijo `__`, que producían un falso negativo en la comparación.
- `node --check` finalizó correctamente para `server.js`, las seis partes nuevas, el resto de `private/js`, la suite y los scripts de `scripts/`.
- `npm test` finalizó con 16 pruebas aprobadas y 0 fallidas.

### Limitaciones de esta verificación

- Toda la comprobación fue estática y sobre el AST. La aplicación no se ejecutó en un navegador ni contra MongoDB durante esta sesión, por lo que conviene abrir cada página una vez antes de publicar: Inicio, Lectores, Misas, Asignar, Cobertura, Reporte y Noticias, y probar el cambio de mes, que ahora recarga datos.
- `server.js` no se formateó a propósito, para no mezclar un diff mecánico enorme con las correcciones de seguridad de esta misma sesión. `npm run format:check` lo reportará como pendiente hasta que se decida hacerlo en un commit aparte.
- Quedan 25 líneas de más de 200 caracteres en las partes nuevas: son plantillas literales con HTML incrustado que Prettier no puede partir. Reducirlas requiere extraer esas plantillas a funciones, que es un cambio de código y no de formato.

### Deduplicación del HTML: una sola plantilla para todo el planificador

- Se confirmó que `index.html`, `lectores.html`, `misas.html`, `asignar.html` y `reporte.html` eran en la práctica el mismo documento: los cinco llevaban las seis secciones y los mismos diálogos.
- La causa raíz es que **Inicio** era el único elemento del menú lateral sin `href`: un `<button data-view="dashboard">` que cambia de vista en el cliente. Por eso cada página necesitaba llevar encima la sección `dashboard`. Las demás secciones eran peso muerto, porque el resto de enlaces navegan a su propia página.
- Comparando las cinco páginas normalizadas, las diferencias reales eran mínimas: `misas.html` y `reporte.html` se distinguían de `lectores.html` solo por el bloque del filtro por lector; `index.html` además no tenía la sección `assign`; y `asignar.html` era la más completa, con `fillUnassigned`, los dos filtros y `assignmentScopeDialog`.
- Se encontró de paso que la corrección del 3 de agosto del botón **Ver asignaciones** se había aplicado únicamente a `index.html`. Las otras cuatro páginas conservaban el `<button data-view="assign">` anterior, que cambiaba de vista en lugar de navegar.
- Se creó `public/app.html` como unión de las cinco: parte de `asignar.html`, incorpora el filtro por lector de `lectores.html` y adopta el enlace corregido de `index.html`, que así queda aplicado en todas.
- El servidor resuelve las seis rutas de página contra esa plantilla mediante el mapa `PAGE_VIEWS` e inyecta `data-page` junto al `data-mode` que ya inyectaba. El desvío puntual de `/cobertura.html` a `/asignar.html` desaparece: ahora recibe directamente `data-page="coverage"`.
- Los cinco cargadores de `private/js` eran ya idénticos entre sí tras la división de `common.js`, así que se unificaron en `private/js/app.js`.
- Resultado: nueve archivos de página y cargador quedan en dos. `public/` contiene ahora `app.html`, `login.html`, `noticias.html` y `estadisticas.html`.

### Verificación de la deduplicación

- Se comprobó que `app.html` es un superconjunto estricto: ninguno de los identificadores presentes en las cinco páginas anteriores falta en la plantilla.
- Se levantó el servidor real y se recorrieron todas las rutas. Las seis públicas responden 200 con la vista correcta y en modo público; `/adminmode.html` y `/admin/...` responden 200 en modo administrador con la vista correcta cuando hay cookie válida, y 302 a `/login.html` cuando no la hay. `login.html`, `noticias.html`, los JavaScript y la hoja de estilos siguen sirviéndose igual, y una ruta inexistente sigue devolviendo 404.
- Se comparó, para cada una de las cinco rutas, el conjunto de identificadores, nombres de campo, `data-view` y enlaces del HTML servido ahora contra el de la página correspondiente en el commit anterior: ninguna ruta pierde ninguna marca.
- Se agregaron dos pruebas de integración que levantan el servidor y comprueban la vista inicial de cada ruta y el control de acceso administrativo. `npm test` finalizó con 18 aprobadas y 0 fallidas.
- Se formatearon además la suite y los scripts de `scripts/`, con AST idéntico verificado en los cinco archivos. `npm run format:check` ya pasa limpio.
- `server.js`, `public/`, la hoja de estilos y esta bitácora quedan excluidos del formateo en `.prettierignore`, con el motivo anotado en el propio archivo. El HTML necesita revisión en navegador antes de reformatearlo porque el espacio entre elementos en línea afecta al render.

### Cambios de comportamiento que conviene mirar en el navegador

- En `lectores.html`, `misas.html`, `asignar.html` y `reporte.html`, el botón **Ver asignaciones** del panel ahora navega a la página de asignaciones en vez de cambiar de vista en la misma URL. Es la corrección del 3 de agosto, que antes solo estaba en Inicio.
- Inicio ahora incluye la sección `assign` oculta, por lo que `renderAssignments()` se ejecuta también allí. No es visible, pero supone trabajo de render adicional. Si se quiere recuperar la decisión del 3 de agosto de no montar el tablero en Inicio, basta con condicionar ese render a la vista activa.
- Las páginas que no tenían el filtro por lector ahora lo incluyen, dentro de la sección de lectores.

## Backlog al 31 de agosto de 2026

> **Superado.** Este backlog quedó en medio del documento al seguir creciendo la bitácora. El vigente está al final, en *Backlog al 1 de septiembre de 2026*. Se conserva como historial.

Lista viva de lo que queda pendiente. Está al final del documento a propósito, para no tener que leer toda la bitácora histórica y poder responder de un vistazo en qué punto está el proyecto.

### Aplazado por decisión del usuario

- **Sustitución acordada para una celebración específica.** Diseñada y documentada el 4 de agosto, sin implementar. El 31 de agosto el usuario decidió expresamente no abordarla todavía y dejarla en el backlog. El diseño completo está en la sección *Propuesta pendiente: sustitución acordada para una celebración específica*: solicitud del titular con su contraseña, enlace aleatorio de un solo uso con vencimiento, aceptación del sustituto con su propia contraseña, e historial que conserva al titular original. La deduplicación del HTML ya está hecha, así que ahora se construiría una sola vez en lugar de cinco.
- **`data/lectores_reales_revision.csv` se conserva rastreado por Git**, con los nombres y horarios de los 30 lectores reales. Decisión expresa del usuario el 31 de agosto. No es un pendiente.

### Seguridad, antes de considerar el proyecto listo para producción

- **Rotar la credencial de MongoDB** compartida en julio y actualizarla en `.env` y en las variables de entorno de Render. Solo puede hacerlo el usuario, desde Atlas.
- **Limitador del login administrativo.** En `server.js` reinicia el contador a cero al bloquear, así que concede cinco intentos nuevos cada minuto de forma indefinida. Su `Map` en memoria crece sin límite y usa `req.socket.remoteAddress`, que detrás del proxy de Render es la misma dirección para todos: cinco fallos de cualquier visitante bloquean el acceso al administrador. La solución encaja con la colección `auth_rate_limits` que ya se usa para lectores, con retroceso creciente.
- **Confirmar `NODE_ENV=production` y HTTPS** en el alojamiento, de lo que dependen `Secure` en la cookie y la cabecera HSTS.
- **Decidir si las notas de los lectores siguen siendo públicas.** Pendiente desde julio.

### Calidad

- **Pruebas de integración de las reglas de asignación**: exclusividad mensual, propagación por alcance, traslado de suplentes y transacciones. Es la parte más delicada del sistema y la única sin cobertura; se rehízo tres veces según el historial.
- **Formatear `server.js` y `public/app.html`** en un commit aparte. Están excluidos en `.prettierignore` con el motivo anotado. El HTML necesita revisión en navegador antes, porque el espacio entre elementos en línea afecta al render.
- **Decidir si Inicio debe montar la sección `assign` oculta.** Tras unificar la plantilla, `renderAssignments()` se ejecuta también en Inicio. No es visible, pero es trabajo de render innecesario y revierte parcialmente la decisión del 3 de agosto. Se resuelve condicionando ese render a la vista activa.

## Actualización del 1 de septiembre de 2026

### Sincronización de lectores con la encuesta de agosto

- Se recibió una nueva encuesta con 31 respuestas y 30 personas únicas. Rosario Castillo Vásquez respondió dos veces con contenido idéntico; se conservó una sola.
- Las seis franjas horarias del formulario coinciden exactamente con las seis misas semanales configuradas.
- Se comparó contra los 38 lectores de la base: 26 ya existían, 4 eran nuevos y 12 no respondieron.
- Se confirmó con el usuario que **Vicky Murillo** y **María Victoria Murillo Guzmán** son la misma persona. El emparejamiento automático no podía deducirlo porque solo comparten un apellido, así que se registró como equivalencia explícita en `KNOWN_MATCHES`.
- Las otras diez coincidencias parciales fueron confirmadas por el usuario: Yorleni/Yorleny Solórzano, Lissete/Lissette, Rita Mora/Rita Elena Mora, Flor Maria/Flor María, Dominik Hodgson/Hodgson Medal, Gloriela Mora/Mora Pereira, María Auxiliadora Rodríguez/Rodríguez Venegas, Mauricio Cartín/Cartín Herrera, Laura Cascante/Cascante Arias y Patricia/Patricia Delgado González.

### Decisiones tomadas por el usuario

- **Modelo de preferencias**: el formulario solo tiene dos estados y la base tiene tres. Se acordó **SI → misa preferida**, y **NO junto con lo no mencionado → no puede asistir**. No queda ninguna misa neutral.
- La indisponibilidad se registra únicamente sobre las seis misas semanales del formulario. Una misa creada más adelante no nace bloqueada para todo el mundo.
- **Gelsy Yeny Rojas Storck** marcó sábado 4:00 p. m. como posible e imposible a la vez. Se aplicó el precedente del 2 de agosto con José Francisco Zumbado: gana el **no puede asistir**.
- **Nombres**: se adopta la escritura del formulario, quitando espacios sobrantes y punto final y capitalizando palabras en minúscula, pero **conservando las tildes que la base ya tenía** cuando el formulario las perdió. Así se recuperaron `Solórzano`, `Cartín` y `Rodríguez`.
- Por indicación expresa del usuario, `Auxiliadora Rodríguez Venegas` se guardó como **María Auxiliadora Rodríguez Venegas**.
- La misa especial **Misa Domingo 9am** del 30 de agosto no continúa y se desactivó.
- Se mantienen activas **Ligia Zumbado**, **Ana** y **Elvira Ortiz** aunque no respondieron. Conservan las preferencias que ya tenían, porque el formulario no aporta datos nuevos sobre ellas.

### Hallazgo importante: puestos fantasma en la asignación aleatoria

- `randomAssignments` construye los puestos a partir de **todas las misas activas, sin comprobar si la misa ocurre en el mes solicitado**. `massOccurrences` solo se consulta después, al generar los documentos.
- La misa especial del 9 a. m. seguía activa con fecha del 30 de agosto. Para septiembre habría añadido 4 funciones más 1 suplente, es decir **5 puestos imposibles de llenar**, y la generación habría abortado entera sin explicar la causa.
- Desactivarla resuelve el caso concreto, pero **el fallo sigue presente** para cualquier misa especial futura. Queda en el backlog.

### Capacidad del mes, comprobada antes de aplicar

- Un mes completo exige **30 personas distintas**: 6 misas × 4 funciones = 24 titulares, más al menos 1 suplente por misa. Cada persona ocupa un solo puesto al mes.
- Con la regla elegida se simuló el emparejamiento antes de escribir nada. Con solo los 30 de la encuesta el mes salía **con margen cero**, sin ningún suplente adicional y sin tolerancia a una baja más.
- Al conservar activas a las tres personas indicadas por el usuario, quedan **33 activos para 30 puestos**, con margen 3.
- Disponibilidad por misa tras aplicar: sábado 4 p. m. = 14, sábado 6 p. m. = 20, domingo 7 a. m. = 10, domingo 11 a. m. = 12, domingo 4 p. m. = 12, domingo 6 p. m. = 11. El mínimo por misa es 5.

### Resultado aplicado

- Se agregó `scripts/sync-readers-from-survey.js` con los modos `--check`, `--apply` y `--verify`, siguiendo el patrón de los scripts anteriores.
- Antes de escribir se creó el respaldo privado `data/private/respaldo-antes-encuesta-2026-09-01T17-40-04-940Z.json` con lectores y misas.
- Todo se aplicó dentro de una transacción de MongoDB: 26 actualizaciones, 4 altas, 8 bajas y la desactivación de la misa especial.
- Verificación posterior: **42 lectores en total, 33 activos, 9 inactivos**, los 42 con modelo de preferencias, 6 misas semanales activas y ninguna misa especial activa.
- Los 4 lectores nuevos son Hannia Barrantes Solano, Elias González, Stephanie Aragón y Farid Campos. Sus contraseñas temporales quedaron solo en `data/private/credenciales-nuevos-lectores-2026-09-01T17-40-04-940Z.csv`, ignorado por Git, y deben entregarse en privado porque no vuelven a poder consultarse.
- Las 8 personas desactivadas conservan contraseña, notas e historial. Reactivarlas es marcar la casilla de lector activo.
- No había ninguna asignación con fecha de hoy en adelante, así que nada de esto rompió una planificación viva.

### Pendiente inmediato

- `Evelia Ramirez` quedó sin tilde porque ni el formulario ni la base la traían. Si el apellido correcto es `Ramírez`, debe corregirse a mano.
- Falta generar la planificación de septiembre de 2026, que era el objetivo de todo este ordenamiento.

### Corrección de los puestos exigidos por misas que no se celebran en el mes

- `randomAssignments` construía la lista de puestos recorriendo **todas las misas activas**, sin comprobar si cada una tenía fechas en el mes solicitado. `massOccurrences` solo se consultaba después, al escribir los documentos.
- Consecuencia: una misa especial de otro mes aportaba 4 funciones más 1 suplente que había que llenar, no generaba ninguna asignación, y al quedar esos puestos vacíos abortaba la planificación completa con el mensaje *"No hay suficientes lectores disponibles"*, que culpa a la falta de personas cuando el problema es otro.
- Se agregó `massesForMonth(masses, month)` junto a `massOccurrences` y se aplicó el filtro justo después de leer las misas activas. Como `masses` se usa en cinco puntos de la función (puestos de función, puestos de suplente, mapa de planes, reparto de suplentes adicionales y bucle de generación), filtrar en el origen deja los cinco consistentes.
- Comprobación sobre los datos reales: con la misa del 9 a. m. activa, septiembre exigía **35 puestos** con 33 lectores activos, lo que habría abortado la generación. Con el filtro exige **30**, que es lo correcto.
- Se agregaron dos pruebas que reproducen el caso exacto de la Misa Domingo 9am y comprueban que una misa semanal cuenta en cualquier mes, que una especial cuenta solo en el suyo, y que un mes sin celebraciones devuelve una lista vacía en vez de fallar.
- `npm test` finalizó con 20 pruebas aprobadas y 0 fallidas.
- `fillUnassigned` no necesitaba corrección: ya deriva sus puestos de `massOccurrences`, así que una misa sin fechas en el mes no genera ninguno.

### Endurecimiento de la regla de una sola misa por persona

- Se verificó la regla contra los datos reales: 180 asignaciones de agosto y septiembre, 39 personas implicadas, buscando cinco tipos de violación. **Ninguna.**
- Los siete caminos que escriben asignaciones ya la aplican: la asignación aleatoria da capacidad 1 a cada lector en el emparejamiento; **Asignar no asignados** valida el resultado completo dentro de la transacción; el cambio manual y la creación borran los puestos en otras misas y retiran a la persona de todas las listas de suplentes del mes; el reemplazo consulta explícitamente si ya participa; la edición de suplentes excluye a los titulares del mes; y el rechazo de asistencia comprueba que el suplente no esté ocupado en otra misa.
- Sin embargo, `assertReadersBelongToSingleMass`, que es la última red antes de guardar, tenía dos huecos comprobados ejecutándola aislada: **aceptaba ser titular y suplente de la misma misa**, y **aceptaba dos funciones de la misma persona en una misma celebración**. Ambos violan la regla acordada.
- Se cerraron los dos huecos. Ahora quien es titular no puede aparecer en ninguna banca, ni siquiera la de su propia misa, y nadie puede ocupar dos funciones de una misma celebración.
- Al endurecerla apareció un fallo real en `fillUnassigned`: al ascender a un suplente a titular limpiaba **una sola** celebración mediante `.find()`. Como la lista de suplentes se repite en cada fecha de la misa, la persona quedaba en la banca de las demás fechas. Se cambió por un bucle que la retira de todas, conservando el respaldo de suplentes solo cuando la celebración de origen es de otra misa, para no alterar el recuento de traslados.
- La validación endurecida se probó contra los datos reales antes de dar por bueno el cambio: agosto y septiembre pasan por separado. El rechazo al mezclar meses distintos es el esperado, porque la función siempre se invoca con un solo mes.
- Se agregaron seis pruebas: las tres violaciones entre misas distintas, los dos huecos recién cerrados, y una que comprueba que la rotación normal de funciones a lo largo del mes con banca compartida se sigue aceptando.
- `npm test` finalizó con 26 pruebas aprobadas y 0 fallidas.

### Anomalía detectada en la planificación de agosto

- Al revisar los datos se encontró que agosto tiene **84 asignaciones con 40 huecos**: faltan funciones sueltas en cinco de las seis misas, y a sábado 4:00 p. m. le falta la fecha del 15 completa.
- No hay asignaciones huérfanas: todas las que quedan apuntan a lectores existentes.
- Por las marcas de creación, 82 de esos documentos se escribieron el 31 de agosto por la tarde y 2 el 1 de septiembre, es decir fuera de las operaciones de esta sesión. La sincronización con la encuesta no toca la colección de asignaciones.
- La lectora **Ana** fue eliminada, no desactivada. Conviene tener presente que `DELETE /api/readers` borra **todas** sus asignaciones de todos los meses, incluido el historial pasado, mientras que desactivar lo conserva.
- Agosto ya pasó, así que esto solo afecta al reporte histórico. Septiembre está completo y correcto: 96 asignaciones, 0 puestos vacíos, 32 de 32 lectores activos participando.

### Restauración de la planificación de agosto desde el rol en Excel

- El usuario había vaciado agosto a propósito porque el reparto bueno estaba en el archivo `Rol Lectores Agosto 26.xlsx`, no en la base. Lo quería repuesto para que el algoritmo conserve la memoria de quién sirvió en agosto al generar los meses siguientes.
- Se agregó `scripts/restore-august-2026-plan.js` con los modos `--check`, `--apply` y `--verify`.
- El `.xlsx` se lee **sin dependencias nuevas**: el formato es un zip con XML dentro, así que el script lo descomprime y resuelve `sharedStrings.xml` contra la hoja. El archivo se copió a `data/private/rol-lectores-agosto-2026.xlsx`, ignorado por Git.
- Al escribir el lector apareció una trampa del formato: una celda vacía se guarda autocerrada (`<c r="A5" s="8"/>`), y un patrón ingenuo hacía que se comiera el valor de la celda siguiente, desplazando todas las columnas. Se resolvió distinguiendo celdas autocerradas de las que llevan `</c>`.
- El Excel usa el mismo formato tradicional que ya genera la aplicación: seis bloques, uno por misa, con cuatro lectores en columnas y cinco fechas debajo indicando la función de cada uno ese día.
- Validación previa: 6 misas × 4 lectores × 5 fechas, funciones únicas cada día, 24 lectores distintos y nadie repetido en dos misas.
- Los nombres del Excel vienen en forma corta. Veintiuno casaron por palabras compartidas; tres necesitaron equivalencia explícita confirmada por el usuario: `Vicky Murillo` → María Victoria Murillo Guzmán, `Anna Bolaños` → Ana Bolaños Murillo y `Mary Alvarez` → María Álvarez Villalobos. Ninguno quedó sin correspondencia.
- Las funciones se traducen del Excel a las de la base: `Monitor` pasa a `Moniciones`, `Primera` a `Primera lectura` y `Segunda` a `Segunda lectura`.
- Por decisión del usuario, agosto se repone **sin suplentes** y conservando a los tres lectores hoy inactivos que sí sirvieron entonces: Kary Hernández Gonzalez, José Francisco Zumbado Arce y Andrea Sanabria.
- También por decisión del usuario, la misa especial **Misa Domingo 9am** del 30 de agosto se elimina de la planificación: el script reemplaza el mes completo y solo repone lo que está en el Excel.
- Antes de aplicar se creó el respaldo privado `data/private/respaldo-agosto-antes-restaurar-*.json`, y la escritura se hizo dentro de una transacción.
- Resultado verificado: **agosto tiene 120 asignaciones**, las seis misas con 20 puestos, 5 fechas y 4 lectores cada una, y **0 huecos**.
- Ambos meses pasan ahora la validación endurecida: agosto con 120 asignaciones y 24 personas, septiembre con 96 y 32.

### Caso no contemplado: misas especiales fuera de la rotación

- Al validar agosto con la misa de las 9 a. m. todavía presente, la regla de una sola misa por persona saltaba con Andrea Sanabria, Wendy Vargas y Luis Alonso Marín Rodríguez.
- No era un error de importación: la misa de las 9 a. m. fue una celebración única y se cubrió con gente que ya servía en su horario habitual, algo perfectamente razonable que la regla mensual no contempla.
- El caso desapareció al eliminar esa misa de agosto, pero el hueco conceptual sigue: si se crea otra misa especial, el generador la trata como una misa más y exige cuatro personas exclusivas para ella, además de restarlas del resto del mes.
- Queda anotado en el backlog: convendría distinguir las celebraciones especiales de la rotación mensual ordinaria.

### Directorio administrativo de lectores y ocultamiento de los inactivos

- El administrador no tenía dónde ver **quiénes** son los lectores activos y quiénes los inactivos. Las Estadísticas solo contaban activos y nunca mostraban nombres; la página de Lectores mezclaba a las 41 personas en orden alfabético, distinguidas únicamente por una etiqueta pequeña, y el resumen administrativo daba tres números sin nombres.
- Se agregó a `public/estadisticas.html` la sección **Directorio de lectores**, colocada antes de la cobertura por horario. Es la primera de las tres secciones de esa página, que quedó ordenada como Directorio, Cobertura por horario y Confirmaciones por lector.
- El directorio agrupa a las personas en **Activos normales**, **Solo suplentes** e **Inactivos**, cada grupo con su recuento y su lista alfabética en español.
- Cada persona muestra su participación durante el mes consultado: **Titular · nombre de la misa**, **Suplente · nombre de la misa** o **Sin asignación este mes**. También aparecen su teléfono cuando existe, sus misas preferidas y la marca **Cambio de contraseña pendiente**.
- Un lector inactivo que sí figura en la planificación del mes consultado lo dice explícitamente, en lugar de afirmar que no entra en ninguna planificación. Es el caso de agosto, donde sirvieron tres personas que hoy están inactivas.
- El resumen superior tiene cuatro indicadores: activos normales, solo suplentes, inactivos y **activos sin asignación en el mes**, que responde de un vistazo a quién está disponible y sin usar.
- La sección tiene su propio selector de mes, iniciado con el mes actual de Costa Rica e independiente del selector de confirmaciones, para poder revisar un mes sin perder el otro.
- Es solo lectura por decisión del usuario. Activar, desactivar y editar continúa haciéndose desde la página de Lectores.
- No hizo falta ninguna ruta nueva ni cambio en MongoDB: `estadisticas.html` ya está protegida en el servidor por la sesión administrativa y ya cargaba `/api/readers`, `/api/masses` y `/api/assignments` con esa sesión, así que los inactivos ya venían en la respuesta.
- Se reutilizaron las clases visuales de la vista de Cobertura (`coverage-group`, `coverage-reader-list`, `coverage-badge`) en lugar de duplicar diseño. Solo se agregaron la variante `coverage-badge.idle` y el ajuste responsivo del encabezado.

### Los lectores inactivos dejaron de ser públicos

- Hasta ahora `GET /api/readers` devolvía a todo el mundo los 41 lectores completos, inactivos incluidos con sus notas y preferencias, y `/lectores.html` los listaba en modo público.
- En el cliente, `renderReaders` construye ahora su lista con `isAdmin || reader.active`, de modo que el listado y el selector **Filtrar por lector** solo muestran inactivos en modo administrador.
- Ocultarlos únicamente en el cliente no habría bastado, porque la respuesta de la API seguía viajando completa. Se agregó `publicReader` en `server.js`: al público, un lector inactivo se reduce a `id`, `name` y `active: false`.
- No se eliminan por completo de la respuesta a propósito. `readerName()` los necesita para poder leer la planificación de meses anteriores: agosto contiene a Kary Hernández Gonzalez, José Francisco Zumbado Arce y Andrea Sanabria, que hoy están inactivos. Se comprobó ejecutando el cliente real en modo público que `readerName` sigue devolviendo su nombre.
- Conviene tener presente que esto oculta la **lista** de inactivos, no su nombre dentro de un plan pasado: la planificación en sí es pública, así que quien abra el reporte de agosto seguirá leyendo esos tres nombres.

### Verificación

- Se levantó el servidor real contra MongoDB y se comprobó la API: al público le llegan 41 lectores, de los cuales los 9 inactivos traen exactamente las claves `id`, `name` y `active`, ningún teléfono y ninguna nota. Al administrador le llegan los 41 completos, con las preferencias intactas en los 9 inactivos.
- Se ejecutaron los seis archivos `common-*.js` reales en un DOM simulado, con los datos reales de MongoDB, en modo público y en modo administrador. Público: 32 tarjetas, 32 opciones en el filtro y ninguna etiqueta *Inactivo*. Administrador: 41 tarjetas, 41 opciones y la etiqueta presente. Los seis archivos cargaron sin errores.
- Se ejecutó `estadisticas.js` de la misma forma y se revisó el HTML generado para septiembre y para agosto. En agosto aparecen correctamente los distintivos de titular y suplente, y los tres inactivos que sirvieron ese mes salen marcados con su misa.
- `/admin/estadisticas.html` sirve los tres identificadores nuevos: `directoryMonth`, `readerDirectorySummary` y `readerDirectory`.
- Se agregó una prueba de regresión de `publicReader`: un inactivo se reduce a tres campos y un activo conserva notas y preferencias pero nunca teléfono, hash ni `_id`. `npm test` finalizó con **27 pruebas aprobadas y 0 fallidas**.
- `node --check` finalizó correctamente para `server.js`, todos los JavaScript de `private/js`, la suite y los scripts. `npm run format:check` pasa limpio y `git diff --check` no encontró errores.
- Archivos tocados: `server.js`, `private/js/estadisticas.js`, `private/js/common-vistas.js`, `private/styles.css`, `public/estadisticas.html` y `test/server.test.js`.

### Estado de los datos observado durante esta sesión

- MongoDB tiene ahora **41 lectores: 32 activos y 9 inactivos**. La sesión anterior había dejado 42 y 33, así que una persona fue eliminada entre ambas sesiones.
- **La planificación de septiembre ya no existe.** La colección de asignaciones contiene únicamente los 120 documentos de agosto de 2026. La sesión del 1 de septiembre había dejado septiembre con 96 asignaciones y 0 huecos; esos documentos ya no están. No se tocaron asignaciones durante esta sesión.
- Por eso el directorio, que abre en el mes actual, muestra a los 32 activos como **Sin asignación este mes**. Es el dato correcto: septiembre está sin planificar.

### Detalle menor observado, sin corregir

- En el tablero de asignaciones, el desplegable de titulares solo ofrece lectores activos. Si se consulta un mes pasado cuyo titular hoy está inactivo, ese puesto se muestra vacío aunque el documento sí conserve su `readerId`. Es un comportamiento anterior a esta sesión y no lo introdujo este cambio; el reporte sí resuelve el nombre correctamente.

### El directorio de lectores pasa a tres acordeones

- Volcar los 41 nombres de golpe obligaba a bajar mucho para llegar a la cobertura por horario, así que las listas del directorio ahora nacen cerradas.
- Los cuatro recuadros de conteo siguen siempre visibles. Debajo quedan las tres cabeceras de grupo con su número, y la lista de nombres se despliega solo al pulsar la cabecera.
- Los tres grupos son independientes: se puede abrir **Inactivos** sin desplegar los otros dos. Es la consulta habitual.
- Por decisión del usuario los tres abren siempre cerrados al recargar; no se recuerda cuál quedó abierto.
- Se reutilizó el patrón que ya existía en **Misas de esta semana**: `details` y `summary` nativos, sin estado manual en JavaScript, con accesibilidad por teclado y la misma flecha que gira.
- Las reglas de estilo se limitaron al ámbito `.reader-directory` para no alterar la vista de Cobertura, que comparte las clases `coverage-group`. La flecha necesita esa especificidad extra porque `.coverage-group-head span` ya daba forma circular a cualquier `span` de la cabecera.
- Comprobado ejecutando `estadisticas.js` con los datos reales: se generan 3 `details`, ninguno con el atributo `open`, 3 `summary`, 3 flechas, las 42 tarjetas de contenido dentro y ninguna `section` del formato anterior. Las etiquetas quedan balanceadas.
- `npm test` finalizó con 27 pruebas aprobadas y 0 fallidas; `npm run format:check` pasa limpio.
- Archivos tocados: `private/js/estadisticas.js` y `private/styles.css`.

### Diagnóstico del PDF tradicional: nombres corridos

- El usuario reportó nombres corridos en `LectoresSeptiembre2026.pdf`. Se leyó el PDF por dentro: **una sola página A4 vertical con una única imagen de 1600×1978 y cero fuentes**. No era texto, era una foto del reporte.
- La causa de los nombres corridos estaba en `drawFittedText`: ajustaba el tamaño de letra pero **nunca fijaba `ctx.textAlign`**, así que heredaba la alineación de lo último dibujado. El título ponía `center` y la primera columna salía bien; las filas de fechas terminaban en `right`, y por eso los nombres de las columnas 2, 3 y 4 se dibujaban alineados a la derecha terminando en el centro de su columna, corridos media palabra hacia la izquierda.
- Se comprobó midiendo la imagen extraída del PDF: la columna mide 399 px y "Yorleny Arrieta Solórzano" terminaba justo en x≈600, el centro exacto de su columna.
- Lo agravaban dos cosas: `drawFittedText` encogía la letra nombre por nombre, así que los cuatro salían a tamaños distintos; y las cuatro columnas se dibujaban pegadas, sin separación, de modo que el nombre corrido chocaba con el vecino.
- Además la regla `@page traditional{size:A4 landscape}` existía pero **nadie la usaba**, y una regla posterior `@page{size:A4 portrait}` la pisaba. Por eso las seis misas se comprimían en una sola página vertical, con la letra en unos 7 pt.

### El formato tradicional pasa a tener una sola maquetación, en SVG

- El problema de fondo eran **dos maquetaciones del mismo reporte**: la del lienzo dibujada a mano en JavaScript, que alimentaba la imagen y el PDF, y la del HTML con su propio CSS, que era la vista previa. Por eso el fallo de alineación vivía en una sola de las dos y en pantalla no se notaba.
- Se descartó la idea de convertir en imagen el PDF ya generado: el navegador entrega el PDF al sistema y el JavaScript de la página nunca lo recupera. Haría falta una librería pesada o un navegador sin interfaz en el servidor.
- Ahora el reporte se dibuja **una sola vez en SVG** y de ahí salen las tres salidas: el PDF imprime ese vector con texto real, el PNG rasteriza ese mismo SVG mediante un lienzo, y la vista previa de la página muestra el mismo SVG. Una maquetación, tres salidas, sin posibilidad de que vuelvan a desincronizarse.
- El bug de alineación desaparece por construcción: en SVG cada `text` lleva su propio `text-anchor` y no existe un estado que se arrastre entre dibujos.
- Los cuatro nombres de cada misa usan **un solo tamaño de letra**, el menor de los cuatro, para que la fila no quede con letras desiguales.
- Se agregó separación entre las cuatro columnas, equivalente a las columnas angostas que usa el Excel de la parroquia.
- Los suplentes pasan a ser una lista con los que existen. Se eliminó el relleno con **Sin asignar**, que ocupaba tres cuartas partes del bloque sin decir nada. Si no hay ninguno se muestra *Sin suplentes asignados*.
- Se agregó el encabezado **Lectores Diaconía San Antonio de Belén de Padua** con el mes y el año debajo, repetido en cada página impresa.
- La orientación horizontal se inyecta en un `style` temporal solo mientras se imprime, y se retira en `afterprint`. Una regla `@page` fija en la hoja afectaría también al **PDF actual**, que es vertical; ese era justamente el fallo anterior.
- Las misas se reparten por **altura disponible**, no por una cantidad fija por página. Una misa con muchos suplentes es bastante más alta que una con uno solo, y con un número fijo de dos por página una planificación con doce o más suplentes en una misa habría desbordado y partido un bloque en dos hojas.

### Verificación con navegador real

- Se levantó Chrome sin interfaz y se ejecutó el código real de la aplicación contra los datos reales de MongoDB.
- **PDF**: se llamó a la función de impresión de verdad, neutralizando solo el diálogo del navegador, y se capturó con `--print-to-pdf`. Agosto, septiembre y octubre dan **3 páginas, 0 imágenes, 6 fuentes y A4 horizontal**. Las páginas del PDF coinciden exactamente con los bloques generados, lo que prueba que ninguna página desborda. El archivo bajó de 216 KB a 104 KB.
- **Imagen**: se recorrió el camino completo SVG → `Image` → lienzo → PNG. El SVG mide 1600×2254, el lienzo sale a 3200×4508 y `toDataURL` no lanza `SecurityError`, es decir el lienzo no queda contaminado. Se miró el PNG resultante: las seis misas correctas, nombres centrados y columnas separadas.
- **Paginación**: se probó la función contra cuatro escenarios. Septiembre real reparte 2+2+2 con 838 unidades por página; octubre, con cinco fechas, 2+2+2 con 914; el caso extremo de cinco fechas y trece suplentes por misa baja solo a una misa por página con 618; y una sola misa da una página. Ninguno excede el límite de 1080.
- **Página real**: se cargó `http://localhost:3000/reporte.html` en el navegador sin interfaz. La vista previa contiene el SVG, con 133 rectángulos y 242 textos, el título presente y **ningún error en consola**.
- `npm test` finalizó con 27 pruebas aprobadas y 0 fallidas; `npm run format:check` pasa limpio y `node --check` finalizó bien en todos los JavaScript.
- Archivos tocados: `private/js/common-reporte-tradicional.js`, `private/js/common-eventos.js` y `private/styles.css`.

### Pendiente menor

- El CSS de la vista previa anterior (`traditional-mass`, `traditional-column`, `traditional-reserves` y sus reglas de impresión) quedó sin uso al pasar la vista previa a SVG. Conviene retirarlo, pero la hoja está minificada y merece una revisión visual aparte; el bloque que lo contiene todavía incluye la regla que oculta la vista previa al imprimir el **PDF actual**, que sí sigue haciendo falta.

### La imagen fallaba por la política de seguridad, y el PDF pasa a una sola página

- **La imagen no se creaba.** El navegador reportaba: *loading the image 'blob:…' violates the following Content Security Policy directive: "img-src 'self' data:"*. La CSP del servidor admite `data:` pero no `blob:`, y `downloadTraditionalImage` entregaba el SVG a la etiqueta `img` mediante `URL.createObjectURL`.
- Se corrigió **sin tocar la CSP**: el SVG se entrega ahora como URL `data:` en base64, que la política ya permite. La codificación se hace por trozos de 32 KB porque pasar el arreglo completo a `String.fromCharCode` desborda la pila. La descarga del PNG resultante sigue usando un blob, que no pasa por `img-src` y nunca estuvo bloqueada.
- **Por qué no lo detecté antes:** la verificación anterior se hizo sobre páginas `file://`, que no llevan CSP. La comprobación de esta sesión se hizo contra el servidor real, con la cabecera puesta.
- **El PDF pasa de tres páginas a una sola**, por pedido expreso del usuario. La orientación vuelve a ser vertical, que es la que corresponde: la proporción del dibujo, 1600 × 2482, es casi idéntica a la de una A4 vertical, mientras que en horizontal el mes completo saldría mucho más pequeño.
- El tamaño ya no se deja al navegador. El SVG se emite con ancho y alto **en milímetros**, calculados como `min(anchoDisponible / 1600, altoDisponible / altoDelDibujo)`, de modo que el mes entero entra siempre en una hoja por muy alta que sea la planificación.
- El área útil se fijó en **192 × 278 mm**, un 1 % menos que los 194 × 281 reales de una A4 vertical con 8 mm de margen. La holgura importa: en la primera prueba agosto ocupaba exactamente 281,00 mm y Chrome lo empujaba a una segunda página por redondeo.
- Se eliminaron `traditionalPrintPages` y `pageBudget`, que repartían las misas por altura entre varias hojas. Ya no hacen falta.
- Contrapartida honesta: al caber todo en una hoja, el texto se imprime a unos **6 pt**. Es el costo de la página única y es comparable al Excel de la parroquia, que imprime con escala del 22 %.

### Verificación contra el servidor real

- Se levantó Chrome sin interfaz apuntando a `http://localhost:3000`, con la CSP real, y se ejecutaron los dos caminos completos.
- **Imagen**: la URL empieza por `data:image/svg+xml;base64,`, no hay ninguna violación de CSP y `toDataURL` devuelve el PNG sin lanzar `SecurityError`. Agosto 1,27 MB, septiembre 1,14 MB, octubre 0,76 MB.
- **PDF**: agosto, septiembre y octubre dan **1 página, 0 imágenes y 6 fuentes**, en A4 vertical. Las medidas impresas son 179,21 × 278,00 mm, 192,00 × 270,48 mm y 190,90 × 278,00 mm, todas dentro del área útil.
- Durante la prueba se detectó de paso que un `script` en línea queda bloqueado por `script-src 'self'`; la página de prueba se rehízo con un archivo externo, igual que hace la aplicación real. Ambos archivos temporales se eliminaron al terminar.
- `npm test` finalizó con 27 pruebas aprobadas y 0 fallidas. `npm run format:check` pasa limpio y `node --check` finalizó bien en `server.js` y en todos los JavaScript.
- Archivos tocados: `private/js/common-reporte-tradicional.js` y `private/styles.css`.

### Limitador del acceso administrativo, rehecho

Era uno de los pendientes de seguridad del backlog. El limitador anterior vivía en un `Map` en memoria y tenía tres fallos:

- **Reiniciaba el contador al bloquear.** `if (attempt.count >= 5) { attempt.count = 0; ... }` dejaba cinco intentos nuevos cada minuto, de forma indefinida: 300 por hora, para siempre, sin que el bloqueo se endureciera nunca.
- **Usaba `req.socket.remoteAddress`**, que detrás del proxy de Render es la dirección del proxy y no la del visitante. Cinco fallos de cualquier persona bloqueaban el acceso administrativo a todo el mundo.
- **Se perdía al reiniciar**, no se compartía entre instancias y el `Map` crecía sin límite.

Ahora usa la colección `auth_rate_limits` de MongoDB, la misma que ya usaban los lectores desde el 29 de julio, con la acción `admin-login`. Persiste entre reinicios, se comparte entre instancias y el índice TTL existente limpia lo viejo.

- **Se limita por cuenta, no por dirección IP**, igual que se decidió para los lectores. Con eso el problema del proxy de Render desaparece por completo.
- **Cada bloqueo dura más que el anterior**: 1, 2, 4, 8 y 15 minutos, con tope en 15. El primero mantiene el minuto de siempre para no castigar a quien simplemente se equivocó al escribir. El tope existe para no dejar fuera al administrador legítimo durante horas.
- **La escalada se reinicia sola tras una hora sin fallos**, de modo que un incidente viejo no sigue castigando.
- Un acceso correcto borra el registro y deja el contador en cero.
- El ritmo que concede a un ataque por fuerza bruta baja de **300 intentos por hora a 20**.
- Contrapartida asumida, la misma que ya se aceptó para los lectores: al limitar por cuenta y no por dirección, alguien que ataque de forma sostenida puede mantener bloqueado el acceso administrativo. Con el limitador anterior eso ya era posible, y más fácil, porque bastaban cinco fallos para bloquear a todos. El tope de 15 minutos y el reinicio por inactividad acotan el daño.

#### Verificación

- Se agregó una prueba de la escalada sobre la función pura `adminLoginBlockMs`. `npm test` finalizó con **28 pruebas aprobadas y 0 fallidas**.
- Prueba real contra el servidor y MongoDB: cuatro contraseñas incorrectas devuelven 401; la quinta devuelve **429 con `Retry-After: 60`** y el mensaje *Espera 1 minuto*. Durante el bloqueo, **la contraseña correcta también recibe 429**, que es lo esperado.
- Escalada comprobada adelantando el vencimiento del bloqueo en la base: la segunda tanda da *Espera 2 minutos* con `blocks=2` y la tercera *Espera 4 minutos* con `blocks=3`.
- Reinicio por inactividad comprobado: con `blocks=5` pero el último fallo dos horas antes, la siguiente tanda vuelve a bloquear **un minuto** y deja `blocks=1`, no quince.
- Acceso correcto con el bloqueo vencido: **200** y el registro queda eliminado.
- La colección `auth_rate_limits` quedó vacía al terminar; no se dejó ningún bloqueo puesto ni scripts temporales en el repositorio.
- Archivos tocados: `server.js` y `test/server.test.js`.

## Cierre de la sesión del 1 de septiembre de 2026

### Lo que se hizo hoy

Cinco commits, todos en `origin/main` y desplegados en Render:

| Commit | Qué resolvió |
| --- | --- |
| `aa3dda2` | Directorio administrativo de lectores; los inactivos dejan de ser públicos |
| `e17666b` | El directorio pasa a tres acordeones cerrados |
| `227e7a0` | El formato tradicional se dibuja una sola vez en SVG |
| `a3ee094` | La imagen ya no la bloquea la CSP; el PDF pasa a una sola página |
| `cf53d26` | Limitador del acceso administrativo, rehecho sobre MongoDB |

Cada uno tiene su sección propia más arriba, con el diagnóstico y la verificación.

### Estado verificado al cerrar

- Rama `main` sincronizada con `origin/main`, árbol de trabajo limpio.
- `npm test`: **28 pruebas aprobadas, 0 fallidas**. `npm run format:check` limpio. `node --check` correcto en `server.js` y en todos los JavaScript.
- MongoDB: **41 lectores (32 activos, 9 inactivos)**, 6 misas semanales activas y ninguna especial.
- Planificación cargada: **agosto 120 asignaciones, septiembre 96, octubre 104**.
- `auth_rate_limits` quedó vacía: no hay ningún bloqueo puesto.
- Quedó un proceso local de `node server.js` escuchando en el puerto 3000 durante la sesión. Si molesta, se cierra sin consecuencias.

### Dos lecciones de esta sesión, para no repetirlas

- **Verificar con la CSP puesta.** El fallo de la imagen no apareció en las pruebas porque se hicieron sobre páginas `file://`, que no llevan cabecera de seguridad. Cualquier prueba de algo que cargue recursos en el navegador debe hacerse contra el servidor real. De paso: un `script` en línea también queda bloqueado por `script-src 'self'`.
- **Una funcionalidad, una maquetación.** El bug de los nombres corridos sobrevivió meses porque el formato tradicional estaba dibujado dos veces, en lienzo y en HTML, y el fallo vivía solo en una. Al unificarlo en SVG el error dejó de ser posible por construcción.

## Propuesta acordada del 3 de septiembre de 2026

### Lectores activos sin asignación

Quedaron acordadas y pendientes dos presentaciones de la misma información: una para todas las personas en **Cobertura** y otra de apoyo administrativo en **Estadísticas**.

#### Regla compartida

- Se considera **sin asignación** a un lector que esté activo y que, en el mes consultado, no aparezca como titular en ningún documento de asignación ni dentro de ninguna lista `substituteIds`.
- Los lectores inactivos no formarán parte de este grupo, porque no están disponibles para planificar.
- Se incluirán tanto lectores activos normales como lectores activos configurados como **Solo suplente**. La interfaz distinguirá claramente ambas condiciones.
- El resultado se recalculará al cambiar el mes. Una persona puede estar sin asignación en un mes y participar en otro.
- **Sin asignación** será un dato derivado, no una casilla nueva ni una propiedad adicional guardada en MongoDB.
- No se necesita una colección ni una ruta de escritura nueva: se usarán los lectores, las misas y las asignaciones que la aplicación ya carga para el mes seleccionado.

#### Presentación pública en Cobertura

- Se conservará exactamente la consulta actual de **Cobertura**: selección de misa, totales, grupos de disponibilidad y búsqueda de personas.
- Inmediatamente debajo del campo **Buscar lector** se agregará un acordeón titulado **Lectores sin asignación**.
- El acordeón aparecerá **abierto inicialmente** cada vez que se cargue la vista.
- Será visible para todas las personas tanto en `/cobertura.html` como, por compartir la vista, en `/admin/cobertura.html`.
- Para cada lector se mostrará el nombre, una etiqueta **Lector normal** o **Solo suplente**, y las misas que tiene como preferidas.
- Esta consulta será exclusivamente de lectura y no incluirá botones para editar lectores o crear asignaciones.
- No mostrará teléfonos, contraseñas, notas administrativas ni datos de lectores inactivos.
- Si no hay personas sin asignación, el acordeón permanecerá visible y mostrará un mensaje como **Todos los lectores activos tienen asignación este mes**.

#### Presentación administrativa en Estadísticas

- Además de aparecer en Cobertura administrativa, se agregará un grupo dedicado dentro de **Estadísticas → Directorio de lectores**.
- Se colocará debajo de los cuatro indicadores del Directorio y antes de los acordeones actuales **Activos normales**, **Solo suplentes** e **Inactivos**.
- Usará el selector de mes propio del Directorio y se actualizará junto con sus indicadores.
- Se presentará como un acordeón **Lectores sin asignación**, abierto inicialmente.
- Dentro del acordeón se separarán visualmente los lectores normales, que pueden ser titulares o suplentes, de quienes están configurados exclusivamente como suplentes.
- Cada persona mostrará su nombre y sus misas preferidas, manteniendo el Directorio como una consulta de solo lectura. La edición continuará realizándose desde **Lectores** y la planificación desde **Asignaciones**.
- Si todos los lectores activos participan durante el mes, mostrará el mismo estado vacío informativo de la presentación pública.

Las dos presentaciones quedaron solamente documentadas y continúan pendientes; todavía no se modificó el código de la aplicación.

## Backlog al 1 de septiembre de 2026

Lista viva de lo pendiente. Está al final a propósito, para poder responder de un vistazo en qué punto está el proyecto sin leer toda la bitácora.

### Seguridad, antes de considerarlo listo para producción

- **Rotar la credencial de MongoDB** compartida en julio y actualizarla en `.env` y en las variables de entorno de Render. **Solo puede hacerlo el usuario**, desde Atlas. Es el pendiente más antiguo y el de mayor riesgo.
- **Confirmar `NODE_ENV=production` y HTTPS** en el alojamiento. De eso dependen el atributo `Secure` de la cookie y la cabecera HSTS.
- **Decidir si las notas de los lectores siguen siendo públicas.** Pendiente desde julio. Los lectores inactivos ya dejaron de serlo el 1 de septiembre.
- *Resuelto el 1 de septiembre:* el limitador del acceso administrativo.

### Funcionalidad aplazada

- **Lectores activos sin asignación, vista pública y administrativa.** Los dos diseños se acordaron el 3 de septiembre y continúan sin implementar. El detalle completo, incluidos ubicación, reglas, contenido y estado vacío de cada presentación, está en la sección *Propuesta acordada del 3 de septiembre de 2026*.
- **Sustitución acordada para una celebración específica.** Diseñada el 4 de agosto, sin implementar; el usuario decidió el 31 de agosto dejarla en el backlog. El diseño completo está en la sección *Propuesta pendiente: sustitución acordada para una celebración específica*.
- **Misas especiales fuera de la rotación.** El generador trata una celebración única como una misa más y exige cuatro personas exclusivas para ella, restándolas del resto del mes. Apareció con la Misa Domingo 9am de agosto.

### Calidad

- **Pruebas de integración de las reglas de asignación**: exclusividad mensual, propagación por alcance, traslado de suplentes y transacciones. Es la parte más delicada del sistema y la única sin cobertura; según el historial se rehízo tres veces.
- **Retirar el CSS muerto del formato tradicional.** `traditional-mass`, `traditional-column` y `traditional-reserves` quedaron sin uso al pasar la vista previa a SVG. Cuidado: el bloque que los contiene todavía incluye la regla que oculta la vista previa al imprimir el **PDF actual**, que sí hace falta. La hoja está minificada y merece una revisión visual aparte.
- **Formatear `server.js` y `public/app.html`** en un commit aparte. Están excluidos en `.prettierignore` con el motivo anotado.
- **Decidir si Inicio debe montar la sección `assign` oculta.** Tras unificar la plantilla, `renderAssignments()` se ejecuta también en Inicio; no es visible, pero es trabajo de render innecesario.
- **`Evelia Ramirez` sin tilde.** Ni el formulario ni la base la traían. Si el apellido correcto es `Ramírez`, hay que corregirlo a mano.

### Decisión abierta

- **Tamaño de letra del PDF tradicional.** Al caber el mes completo en una hoja, el texto se imprime a unos 6 pt. Si resulta pequeño en papel, se vuelve a dos hojas horizontales con letra casi del doble: es cambiar `pageWidthMm` y `pageHeightMm` y volver a repartir por altura, algo que ya estuvo implementado y está descrito en la sección del SVG.
