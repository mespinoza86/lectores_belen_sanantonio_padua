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
