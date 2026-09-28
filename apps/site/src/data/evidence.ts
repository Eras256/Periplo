import type { Locale } from "@/i18n/config";

/**
 * A curated subset of conformance/RESULTS.md plus the UptoSettlement demo's
 * first settlement. Every hash here is a real stellar:testnet transaction;
 * each description paraphrases only what RESULTS.md (or
 * demo/goyahack/README.md for the last one) records about it.
 */
export interface EvidenceItem {
  readonly hash: string;
  readonly date: string;
  readonly scheme: "exact" | "upto";
  readonly text: Record<Locale, string>;
}

export const EVIDENCE: readonly EvidenceItem[] = [
  {
    hash: "83d2aa3b60b7f8332e68082e2ed1f3e1ff7f4e01f4b4d987d9fca5c6c9d89f33",
    date: "2026-08-07",
    scheme: "exact",
    text: {
      en: "First full pipeline: a payment signed with @x402/stellar, verified and settled by Periplo's facilitator core.",
      es: "Primer flujo completo: un pago firmado con @x402/stellar, verificado y liquidado por el núcleo del facilitador de Periplo.",
    },
  },
  {
    hash: "cc46374e34f70ff479ccf919d55df33d0bf1a05e1c7479fa8f90dac596c5d218",
    date: "2026-08-12",
    scheme: "upto",
    text: {
      en: "Partial settlement: the buyer signed a 0.1 PTEST ceiling and the facilitator settled 0.04 PTEST.",
      es: "Liquidación parcial: el comprador firmó un techo de 0.1 PTEST y el facilitador liquidó 0.04 PTEST.",
    },
  },
  {
    hash: "2138c0418a85e1bb29c2eab6cea6c76b3b0231d894450a35905053f36403d358",
    date: "2026-08-13",
    scheme: "upto",
    text: {
      en: "Zero settlement: a 0.05 PTEST ceiling settled at 0, the full ceiling returned to the buyer; a replay with the same nonce was rejected.",
      es: "Liquidación en cero: un techo de 0.05 PTEST liquidado en 0, con el techo completo devuelto al comprador; un replay con el mismo nonce fue rechazado.",
    },
  },
  {
    hash: "4befe51d2c1e58387d128c2f759262d33454b209f2aee8a03283a85b027904fd",
    date: "2026-08-26",
    scheme: "exact",
    text: {
      en: "First payment between an external seller and an independent buyer, neither of them this project, in testnet USDC.",
      es: "Primer pago entre un vendedor externo y un comprador independiente, ninguno de los dos este proyecto, en USDC de testnet.",
    },
  },
  {
    hash: "43bd16987380b4964ef04bf2463fd30492db001de0ec7a8409a4e9bf16dc7c8f",
    date: "2026-09-03",
    scheme: "exact",
    text: {
      en: "Interoperability: a payment built with the same client code, verified and settled through x402.org's independent reference facilitator.",
      es: "Interoperabilidad: un pago construido con el mismo código cliente, verificado y liquidado por el facilitador de referencia independiente de x402.org.",
    },
  },
  {
    hash: "33a6791890f1fc8b559e91ac35ad28f83d21d8686914fa7ea277e294cc0b3764",
    date: "2026-09-03",
    scheme: "exact",
    text: {
      en: "Four concurrent settlements in the same ledger, each from a different account of the channel-account pool.",
      es: "Cuatro liquidaciones concurrentes en el mismo ledger, cada una desde una cuenta distinta del pool de channel accounts.",
    },
  },
  {
    hash: "cf33b51350f6e4c871b3f0a36e2151ad895dadbe2e237ef413259cf4a0533823",
    date: "2026-09-27",
    scheme: "upto",
    text: {
      en: "Metered API: a 0.1 PTEST ceiling for up to 20 rows; 10 rows were returned, so 0.05 PTEST was settled and the rest refunded.",
      es: "API medida: un techo de 0.1 PTEST para hasta 20 filas; se devolvieron 10, así que se liquidaron 0.05 PTEST y el resto se reembolsó.",
    },
  },
];

export const RESULTS_URL = "https://github.com/Eras256/Periplo/blob/main/conformance/RESULTS.md";
