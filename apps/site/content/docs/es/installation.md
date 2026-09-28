## Instalación

```
npm i periplo
```

Verificado desde una carpeta limpia fuera de este repositorio: `npm install periplo`, luego `npm install --save-dev typescript @types/node`, se resuelve e instala sin errores, y `npx tsc` tipa sin errores un archivo que importa de `periplo`, siempre que `compilerOptions` tenga `"types": ["node"]` (los propios tipos del paquete referencian `Buffer`, a través de `@x402/core`).

### Requisitos

- **Node.js 22 o más nuevo.** Declarado en el propio campo `engines.node` del paquete; npm avisa con una versión de Node más vieja.
- **`@types/node`**, como dependencia de desarrollo, si usas TypeScript. Sin ella, `tsc` falla con `Cannot find name 'Buffer'` dentro de las propias declaraciones de tipos de `@x402/core`, por las que `periplo` reexporta.
- **Red**: todo en este paquete que habla con Stellar apunta a `stellar:testnet`. No hay soporte de mainnet; ver [Introducción](/es/docs#que-funciona-hoy-con-honestidad).

### Verificar la instalación

Esto comprueba que los tipos de error del paquete funcionan de verdad, sin necesitar red ni credenciales:

```ts
import { createUptoStellarPayer, UptoMainnetNotSupportedError } from "periplo";

try {
  createUptoStellarPayer("S" + "A".repeat(55), "stellar:pubnet", {
    facilitatorBaseUrl: "https://periplo-testnet.fly.dev",
    maxSpendPerAuthorization: 1_000_000n,
  });
} catch (error) {
  console.log(error instanceof UptoMainnetNotSupportedError, (error as Error).message);
}
```

Salida real, de ese script exacto, corrido contra el paquete instalado desde su tarball publicado:

```
true upto is only supported on stellar:testnet today; stellar:pubnet (including any pubnet/mainnet network) is not yet supported.
```

Eso confirma dos cosas a la vez: el paquete se instaló y sus tipos resuelven, y `upto` de verdad rechaza cualquier red que no sea `stellar:testnet`, en vez de hacer silenciosamente lo incorrecto.
