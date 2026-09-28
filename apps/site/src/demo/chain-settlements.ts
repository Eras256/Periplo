import { UPTO_CONTRACT_DEPLOY_LEDGER, UPTO_CONTRACT_ID } from "./contract";
import { decodeSettledEvent, type SettledEvent } from "./settled-event";

/**
 * Public Soroban RPC for testnet. Chosen over indexer APIs because it sends
 * `Access-Control-Allow-Origin: *` (stellar.expert's API answers 403 to
 * third-party origins) and returns each event's `txHash` directly. It only
 * retains a rolling window of ledgers (~7 days on testnet).
 */
export const RPC_URL = "https://soroban-testnet.stellar.org";
const SETTLED_TOPIC = "AAAADwAAAAdzZXR0bGVkAA==";
const PAGE_LIMIT = 100;
const MAX_PAGES = 20;

export interface ChainSettlement extends SettledEvent {
  readonly id: string;
  readonly settledAt: Date;
  readonly transactionHash: string;
}

interface RpcEvent {
  readonly id: string;
  readonly ledgerClosedAt: string;
  readonly txHash: string;
  readonly inSuccessfulContractCall: boolean;
  readonly topic: readonly string[];
  readonly value: string;
}

interface GetEventsResult {
  readonly events: readonly RpcEvent[];
  readonly cursor: string;
  readonly latestLedger: number;
}

export type ChainReadFailure =
  | { readonly code: "connect" }
  | { readonly code: "status"; readonly status: number }
  | { readonly code: "rejected"; readonly method: string; readonly detail: string };

/** Carries a code instead of prose so the UI can explain it in the visitor's language. */
export class ChainReadError extends Error {
  constructor(
    readonly failure: ChainReadFailure,
    options?: ErrorOptions
  ) {
    super(failure.code, options);
  }
}

async function rpc<T>(method: string, params: unknown, signal: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await fetch(RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal,
    });
  } catch (cause) {
    if (signal.aborted) throw cause;
    throw new ChainReadError({ code: "connect" }, { cause });
  }
  if (!response.ok) throw new ChainReadError({ code: "status", status: response.status });
  const body = (await response.json()) as { result?: T; error?: { message?: string } };
  if (body.error || body.result === undefined) {
    throw new ChainReadError({ code: "rejected", method, detail: body.error?.message ?? "-" });
  }
  return body.result;
}

/** Cursors are `<TOID>-<index>`; a TOID's high 32 bits are the ledger sequence. */
export function cursorLedger(cursor: string): number {
  const toid = cursor.split("-")[0];
  return toid && /^\d+$/.test(toid) ? Number(BigInt(toid) >> 32n) : 0;
}

async function firstStartLedger(signal: AbortSignal): Promise<number> {
  const health = await rpc<{ oldestLedger: number }>("getHealth", undefined, signal);
  return Math.max(UPTO_CONTRACT_DEPLOY_LEDGER, health.oldestLedger + 1);
}

export function toChainSettlement(event: RpcEvent): ChainSettlement | null {
  if (!event.inSuccessfulContractCall) return null;
  const decoded = decodeSettledEvent(event.topic, event.value);
  if (!decoded) return null;
  return {
    ...decoded,
    id: event.id,
    settledAt: new Date(event.ledgerClosedAt),
    transactionHash: event.txHash,
  };
}

/**
 * Returns settlements newer than `cursor` (or everything the RPC still
 * retains when `cursor` is `null`), oldest first, plus the cursor to resume
 * from on the next poll.
 */
export async function fetchSettlementsSince(
  cursor: string | null,
  signal: AbortSignal
): Promise<{ settlements: ChainSettlement[]; cursor: string | null }> {
  const filters = [
    { type: "contract", contractIds: [UPTO_CONTRACT_ID], topics: [[SETTLED_TOPIC, "*", "*"]] },
  ];
  const settlements: ChainSettlement[] = [];
  let next = cursor;
  for (let page = 0; page < MAX_PAGES; page++) {
    const params = next
      ? { filters, pagination: { cursor: next, limit: PAGE_LIMIT } }
      : { startLedger: await firstStartLedger(signal), filters, pagination: { limit: PAGE_LIMIT } };
    const result = await rpc<GetEventsResult>("getEvents", params, signal);
    for (const event of result.events) {
      const settlement = toChainSettlement(event);
      if (settlement) settlements.push(settlement);
    }
    next = result.cursor;
    if (result.events.length < PAGE_LIMIT && cursorLedger(result.cursor) >= result.latestLedger)
      break;
  }
  return { settlements, cursor: next };
}
