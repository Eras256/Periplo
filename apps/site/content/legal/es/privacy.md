Esta página describe qué datos toca Periplo en la práctica: los de este sitio, los del demo y los del facilitador público de testnet. Se escribió leyendo el código del repositorio, no a partir de una plantilla.

## Este sitio (periplo.xyz)

- **Sin cuentas, sin formularios, sin analítica.** El sitio no pide registro, no tiene formularios de contacto y no carga scripts de analítica, publicidad ni rastreo de terceros. Tampoco carga fuentes ni recursos de otros dominios: todo se sirve desde el propio sitio.
- **Una cookie de preferencia, solo si la eliges.** Si usas el selector de idioma, el sitio guarda una cookie propia (`periplo-locale`) con el idioma elegido, para que la próxima visita abra en ese idioma. No contiene nada más y dura un año.
- **El tema se guarda en tu navegador.** Si eliges tema claro u oscuro, la preferencia queda en el almacenamiento local de tu navegador (`localStorage`). Nunca se envía a ningún servidor y puedes borrarla desde tu navegador.
- **Hosting.** El sitio se sirve desde Vercel. Como con cualquier página web, el proveedor de hosting procesa datos técnicos de cada solicitud (por ejemplo, la dirección IP y el navegador) para poder entregarla, conforme a su propia política de privacidad.

## Estado en vivo del facilitador

La sección de estado en vivo de la página principal no hace que tu navegador contacte al facilitador. Tu navegador le pide los datos a este mismo sitio (`/api/facilitator`), y es el servidor del sitio el que consulta `/supported` y `/status` del facilitador. Esa consulta no reenvía tu dirección IP ni ningún dato tuyo.

## El demo (/demo)

- **Liquidaciones reales:** tu navegador consulta directamente el servidor RPC público de Stellar testnet (`soroban-testnet.stellar.org`) para leer los eventos del contrato. Ese servidor recibe tu solicitud como cualquier otro sitio web que visitas, con tu dirección IP.
- **Simulación:** corre por completo en tu navegador. No envía nada a ningún servidor, no firma nada y no crea transacciones.

## El facilitador público de testnet

Esto aplica a quien use el facilitador (`periplo-testnet.fly.dev`) desde su propio código, como vendedor o comprador:

- **Qué recibe:** los datos de pago que se envían a `/verify` y `/settle`: la transacción o autorización firmada por el comprador, las direcciones de Stellar involucradas, el monto y el activo.
- **Qué hace con ellos:** los verifica en memoria y, en `/settle`, envía la transacción a Stellar testnet. **Lo que se registra en una blockchain es público y permanente**; ni Periplo ni nadie puede borrarlo.
- **Qué guarda:** contadores agregados en memoria (solicitudes atendidas, tasa de error, latencias) y el hash de la última liquidación por red, visibles en `/status`. Se reinician cada vez que el servicio se reinicia.
- **Registros:** el código no registra cada solicitud. Escribe mensajes al iniciar y cuando ocurre una advertencia o un error; un mensaje de error puede incluir detalles de la transacción que falló. El servicio corre en Fly.io, que recibe esa salida y los datos técnicos de cada conexión conforme a su propia política.
- **Catálogo de descubrimiento:** cuando un pago liquidado declara la extensión de descubrimiento (Bazaar), se guardan en una base de datos los datos públicos del recurso que se vendió: su URL, descripción, parámetros, precio, activo y la dirección que recibe el pago. Ese catálogo se puede consultar públicamente en `/discovery`. No se guarda nada del comprador en el catálogo.

## Custodia

Periplo no recibe, no guarda y no mueve fondos de nadie. El facilitador solo paga comisiones de red de Stellar testnet con su propia cuenta. No tiene riel fiat, ni propio ni de terceros.

## Preguntas

Periplo es un proyecto de código abierto mantenido por sus colaboradores. Para preguntas sobre esta página, abre un issue en el [repositorio público](https://github.com/Eras256/Periplo).
