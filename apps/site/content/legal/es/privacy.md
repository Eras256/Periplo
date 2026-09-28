Esta página describe qué datos toca Periplo en la práctica: los de este sitio, los del demo y los del facilitador público de testnet. Se escribió leyendo el código del repositorio, no a partir de una plantilla.

## Quién es el responsable y cómo contactarlo

Todavía no se ha designado una persona o entidad responsable de este sitio y de los despliegues públicos. Mientras tanto, el proyecto lo mantienen sus colaboradores ("Periplo contributors"). El canal de contacto actual es abrir un issue en el [repositorio público](https://github.com/Eras256/Periplo/issues); no incluyas datos personales en él, porque es público. Para reportar una vulnerabilidad, usa la página de [seguridad](/es/security).

## Qué datos se tocan y para qué

### Este sitio (periplo.xyz)

- **Sin cuentas, sin formularios, sin analítica.** El sitio no pide registro, no tiene formularios de contacto y no carga scripts de analítica, publicidad ni rastreo de terceros. Tampoco carga fuentes ni recursos de otros dominios: todo se sirve desde el propio sitio.
- **Una cookie de preferencia, solo si la eliges.** Si usas el selector de idioma, el sitio guarda una cookie propia (`periplo-locale`) con el idioma elegido, para que la próxima visita abra en ese idioma. No contiene nada más y dura un año.
- **El tema se guarda en tu navegador.** Si eliges tema claro u oscuro, la preferencia queda en el almacenamiento local de tu navegador (`localStorage`) para recordarla en tu próxima visita. Nunca se envía a ningún servidor y puedes borrarla desde tu navegador.
- **Datos técnicos de cada solicitud.** Como con cualquier página web, el proveedor de hosting procesa datos técnicos (por ejemplo, la dirección IP y el navegador) para poder entregar la página.

### Estado en vivo del facilitador

La sección de estado en vivo de la página principal no hace que tu navegador contacte al facilitador. Tu navegador le pide los datos a este mismo sitio (`/api/facilitator`), y es el servidor del sitio el que consulta `/supported` y `/status` del facilitador, para mostrar si el servicio está activo. Esa consulta no reenvía tu dirección IP ni ningún dato tuyo.

### El demo (/demo)

- **Liquidaciones reales:** tu navegador consulta directamente el servidor RPC público de Stellar testnet (`soroban-testnet.stellar.org`) para leer los eventos del contrato y mostrarlos. Ese servidor recibe tu solicitud como cualquier otro sitio web que visitas, con tu dirección IP.
- **Simulación:** corre por completo en tu navegador. No envía nada a ningún servidor, no firma nada y no crea transacciones.

### El facilitador público de testnet

Esto aplica a quien use el facilitador (`periplo-testnet.fly.dev`) desde su propio código, como vendedor o comprador:

- **Qué recibe:** los datos de pago que se envían a `/verify` y `/settle`: la transacción o autorización firmada por el comprador, las direcciones de Stellar involucradas, el monto y el activo.
- **Para qué y qué hace con ellos:** para verificar el pago y, en `/settle`, enviarlo a Stellar testnet. Los verifica en memoria. **Lo que se registra en una blockchain es público y permanente**; ni Periplo ni nadie puede borrarlo.
- **Qué guarda:** contadores agregados en memoria (solicitudes atendidas, tasa de error, latencias) y el hash de la última liquidación por red, visibles en `/status`, para mostrar el estado del servicio. Se reinician cada vez que el servicio se reinicia.
- **Catálogo de descubrimiento:** cuando un pago liquidado declara la extensión de descubrimiento (Bazaar), se guardan en una base de datos los datos públicos del recurso que se vendió: su URL, descripción, parámetros, precio, activo y la dirección que recibe el pago. Sirve para que otros puedan encontrar ese recurso; se puede consultar públicamente en `/discovery`. No se guarda nada del comprador en el catálogo.

## Con quién se comparten

Cada uno de estos servicios tiene su propia política de privacidad, que rige lo que hace con los datos que recibe.

- **Vercel:** aloja este sitio y ejecuta su servidor. Recibe los datos técnicos de cada solicitud al sitio (por ejemplo, la dirección IP y el navegador).
- **Fly.io:** aloja el facilitador público. Recibe las solicitudes que llegan al facilitador, los datos técnicos de cada conexión y la salida de registros del servicio (ver "Registros").
- **Servidor RPC público de Stellar testnet:** recibe tu solicitud cuando el demo lee eventos desde tu navegador (con tu dirección IP), y recibe las transacciones que el facilitador envía a Stellar testnet.
- **Base de datos del catálogo:** el catálogo de descubrimiento se guarda en una base de datos alojada en Supabase (solo los datos públicos del recurso descritos arriba).
- **stellar.expert:** si haces clic en un enlace a una transacción, abres el sitio de ese explorador, que es de un tercero.

## Cómo pedir acceso o rectificación

- **En este sitio y en el demo** no se guarda nada que te identifique en un servidor propio; la cookie de idioma y la preferencia de tema están en tu navegador y las puedes borrar tú.
- **En el catálogo de descubrimiento** sí hay datos del recurso que un vendedor publicó (URL, descripción, parámetros, precio, activo y dirección de cobro). Si quieres saber qué hay ahí sobre ti, corregirlo o pedir que se quite, escribe por el canal de contacto de arriba indicando la URL o la dirección de Stellar de tu recurso. El equipo puede corregir o eliminar esa entrada, porque la base de datos la controla el proyecto.
- **En la blockchain** no se puede corregir ni borrar nada: lo que se registra en Stellar es público y permanente.

## Registros (logs)

Verificado leyendo el código de `apps/facilitator` el 27 de septiembre de 2026:

- **No hay registro de solicitudes.** El servicio no tiene ningún componente que registre cada solicitud, y su código no escribe direcciones IP ni encabezados en sus registros.
- **Qué sí escribe:** un mensaje al iniciar (la dirección y el puerto en que escucha); avisos si falla la carga del modelo de búsqueda o el procesamiento del texto de descubrimiento de un recurso (este aviso incluye la URL de ese recurso); y errores del flujo `upto` (fallos de simulación, de lectura de la transacción o inesperados), cuyo mensaje puede incluir detalles de la transacción que falló, como direcciones de Stellar y montos.
- **Dónde quedan:** en Fly.io, que recibe esa salida. Según la [documentación de Fly.io](https://docs.fly.io/monitoring/logging-overview/), su búsqueda de registros conserva 7 días y no hay almacenamiento a largo plazo por defecto. Periplo no configuró ningún servicio externo de envío de registros para este despliegue.

## Quién controla los fondos

Periplo no recibe, no guarda y no mueve fondos de nadie. El comprador firma cada pago con su propia llave, y el facilitador solo paga las comisiones de red de Stellar testnet con su propia cuenta. No tiene riel fiat, ni propio ni de terceros.
