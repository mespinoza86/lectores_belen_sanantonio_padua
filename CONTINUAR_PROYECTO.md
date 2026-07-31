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
