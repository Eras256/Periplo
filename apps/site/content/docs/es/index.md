## Introducción

`periplo` es una librería cliente en TypeScript para pagos x402 en Stellar. Está construida alrededor de `upto`: en vez de pagar un precio fijo, quien compra firma un *techo* de gasto una sola vez, y un facilitador liquida después solo el monto realmente usado. El techo nunca cambia; lo único que cambia es el uso real.

```
techo firmado:   [████████████████████████████████] 0.10 USDC
usado de verdad: [████████░░░░░░░░░░░░░░░░░░░░░░░░] 0.05 USDC liquidado, 0.05 USDC devuelto
```

Esa es la forma real de la primera liquidación `upto` en `stellar:testnet`: quien compró firmó un techo de 0.10 USDC, quien vendió midió 0.05 USDC de uso real, y el contrato `UptoSettlement` liquidó 0.05 USDC al vendedor y devolvió los otros 0.05 USDC al comprador en la misma transacción. Puedes comprobarlo tú en [Stellar Expert](https://stellar.expert/explorer/testnet/tx/d554adfb8f41efca8a5c14d7c82ded1330d3819bddd610ead51ab78257c5cafb), o verlo en vivo en la [página del demo](/es/demo).

### Qué te da `periplo`

- **Lado comprador**: firmar un techo `upto` (`createUptoStellarPayer`) o pagar un precio fijo `exact` (`createExactStellarPayer`), y luego pedir un recurso pagado con reintento incluido (`payAndFetch`, `discoverPayAndFetch`).
- **Lado vendedor**: declarar los metadatos de descubrimiento de un recurso pagado (`definePaidResource`), anunciar un techo `upto` (`buildUptoRequirements`), y liquidar el uso real una vez que se conoce (`settleUptoUsage`).

Ningún lado reimplementa la verificación ni la liquidación de pagos: cada llamada pasa por `HTTPFacilitatorClient`, el mismo cliente publicado de `@x402/core` que entiende cualquier facilitador x402.

### Qué funciona hoy, con honestidad

- `exact` está vivo en el facilitador público en `periplo-testnet.fly.dev` (`stellar:testnet`), usado en todo el [demo completo](/es/demo) y en la [evidencia de conformidad](https://github.com/Eras256/Periplo/blob/main/conformance/RESULTS.md).
- `upto` liquida contra un contrato Soroban `UptoSettlement` ya desplegado, pero necesita un facilitador configurado con la dirección de ese contrato. El propio `GET /supported` del facilitador público hoy no anuncia `upto`, solo `exact`; compruébalo tú mismo antes de asumir lo contrario. Para liquidar de extremo a extremo hace falta correr tu propio facilitador (auto-facilitación) o usar uno que sí soporte `upto`.
- Todo aquí es solo `stellar:testnet`. Periplo no opera en mainnet todavía, y `createUptoStellarPayer` rechaza con `UptoMainnetNotSupportedError` cualquier otra red, incluyendo `stellar:pubnet`.

### Requisitos

Node.js 22 o más nuevo (el campo `engines.node` del paquete). Ninguna otra dependencia de entorno además de lo que instala npm.
