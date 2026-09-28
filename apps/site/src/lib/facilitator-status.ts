export interface FacilitatorStatus {
  readonly checkedAt: string;
  readonly kinds: readonly { readonly scheme: string; readonly network: string }[];
  readonly extensions: readonly string[];
  readonly feePayers: number;
  /** `null` when `/status` did not answer; `/supported` alone is enough to show the page. */
  readonly telemetry: {
    readonly uptimeSeconds: number;
    readonly requestsServed: number;
    readonly errorRate: number;
    readonly catalogSize: number | null;
    readonly lastSettlement: {
      readonly network: string;
      readonly hash: string;
      readonly timestamp: string;
    } | null;
  } | null;
}

const TOKEN = /^[a-z0-9:_*.-]{1,64}$/i;
const HASH = /^[0-9a-f]{64}$/;
const ACCOUNT = /^G[A-Z2-7]{55}$/;

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

/**
 * Whitelists the fields the site shows from the facilitator's `/supported`
 * and `/status`. Anything unexpected is dropped rather than rendered, so a
 * misbehaving or compromised endpoint cannot inject content into the page.
 * Returns `null` if `/supported` is not recognizable.
 */
export function parseFacilitatorStatus(
  supported: unknown,
  status: unknown,
  checkedAt: Date
): FacilitatorStatus | null {
  const sup = record(supported);
  if (!sup || !Array.isArray(sup.kinds)) return null;
  const kinds = sup.kinds.flatMap((kind) => {
    const k = record(kind);
    return k &&
      typeof k.scheme === "string" &&
      typeof k.network === "string" &&
      TOKEN.test(k.scheme) &&
      TOKEN.test(k.network)
      ? [{ scheme: k.scheme, network: k.network }]
      : [];
  });
  const extensions = Array.isArray(sup.extensions)
    ? sup.extensions.filter((e): e is string => typeof e === "string" && TOKEN.test(e))
    : [];
  const signers = new Set<string>();
  for (const list of Object.values(record(sup.signers) ?? {})) {
    if (Array.isArray(list))
      for (const s of list) if (typeof s === "string" && ACCOUNT.test(s)) signers.add(s);
  }

  let telemetry: FacilitatorStatus["telemetry"] = null;
  const st = record(status);
  const uptime = finiteNumber(st?.uptimeSeconds);
  const requests = finiteNumber(st?.requestsServed);
  const errorRate = finiteNumber(st?.errorRate);
  if (st && uptime !== null && requests !== null && errorRate !== null) {
    let lastSettlement: NonNullable<FacilitatorStatus["telemetry"]>["lastSettlement"] = null;
    for (const entry of Object.values(record(st.lastSettledTransaction) ?? {})) {
      const e = record(entry);
      const timestamp = typeof e?.timestamp === "string" ? new Date(e.timestamp) : null;
      if (
        e &&
        typeof e.network === "string" &&
        TOKEN.test(e.network) &&
        typeof e.transaction === "string" &&
        HASH.test(e.transaction) &&
        timestamp &&
        !Number.isNaN(timestamp.getTime()) &&
        (!lastSettlement || timestamp.toISOString() > lastSettlement.timestamp)
      ) {
        lastSettlement = {
          network: e.network,
          hash: e.transaction,
          timestamp: timestamp.toISOString(),
        };
      }
    }
    telemetry = {
      uptimeSeconds: uptime,
      requestsServed: requests,
      errorRate: Math.min(errorRate, 1),
      catalogSize: finiteNumber(st.catalogSize),
      lastSettlement,
    };
  }

  return {
    checkedAt: checkedAt.toISOString(),
    kinds,
    extensions,
    feePayers: signers.size,
    telemetry,
  };
}
