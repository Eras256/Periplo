/**
 * Decodes `contracts/upto-settlement`'s `Settled` event (`lib.rs`: topics
 * `["settled", from, to]`, body map `asset`, `max_amount`, `actual_amount`,
 * `nonce`). Hand-rolled instead of pulling in `@stellar/stellar-base` for
 * five ScVal types: it only understands the exact shape our own contract
 * publishes and returns `null` on anything else, so an unexpected event can
 * never be rendered as a wrong amount.
 */

const SCV_I128 = 10;
const SCV_BYTES = 13;
const SCV_SYMBOL = 15;
const SCV_MAP = 17;
const SCV_ADDRESS = 18;
const SC_ADDRESS_ACCOUNT = 0;
const SC_ADDRESS_CONTRACT = 1;
const STRKEY_ACCOUNT = 6 << 3;
const STRKEY_CONTRACT = 2 << 3;
const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function crc16xmodem(bytes: Uint8Array): number {
  let crc = 0;
  for (const byte of bytes) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc;
}

function base32(bytes: Uint8Array): string {
  let out = "";
  let buffer = 0;
  let bits = 0;
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(buffer >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(buffer << (5 - bits)) & 31];
  return out;
}

export function encodeStrkey(versionByte: number, key: Uint8Array): string {
  const payload = new Uint8Array(1 + key.length + 2);
  payload[0] = versionByte;
  payload.set(key, 1);
  const crc = crc16xmodem(payload.subarray(0, 1 + key.length));
  payload[1 + key.length] = crc & 0xff;
  payload[2 + key.length] = crc >> 8;
  return base32(payload);
}

class XdrReader {
  private offset = 0;
  constructor(private readonly view: DataView) {}

  uint32(): number {
    const value = this.view.getUint32(this.offset);
    this.offset += 4;
    return value;
  }

  bigInt64(): bigint {
    const value = this.view.getBigInt64(this.offset);
    this.offset += 8;
    return value;
  }

  bigUint64(): bigint {
    const value = this.view.getBigUint64(this.offset);
    this.offset += 8;
    return value;
  }

  opaque(length: number): Uint8Array {
    if (this.offset + length > this.view.byteLength) throw new RangeError("truncated XDR");
    const bytes = new Uint8Array(this.view.buffer, this.view.byteOffset + this.offset, length);
    this.offset += length + ((4 - (length % 4)) % 4);
    return bytes;
  }

  get done(): boolean {
    return this.offset === this.view.byteLength;
  }
}

/** Addresses decode to their strkey (`G...`/`C...`) string, symbols to plain strings. */
type ScValue = bigint | string | Uint8Array | Map<string, ScValue>;

function readScVal(reader: XdrReader): ScValue {
  const type = reader.uint32();
  switch (type) {
    case SCV_I128: {
      const hi = reader.bigInt64();
      const lo = reader.bigUint64();
      return (hi << 64n) + lo;
    }
    case SCV_BYTES:
      return reader.opaque(reader.uint32());
    case SCV_SYMBOL:
      return new TextDecoder().decode(reader.opaque(reader.uint32()));
    case SCV_ADDRESS: {
      const kind = reader.uint32();
      if (kind === SC_ADDRESS_ACCOUNT) {
        if (reader.uint32() !== 0) throw new Error("unsupported public key type");
        return encodeStrkey(STRKEY_ACCOUNT, reader.opaque(32));
      }
      if (kind === SC_ADDRESS_CONTRACT) return encodeStrkey(STRKEY_CONTRACT, reader.opaque(32));
      throw new Error(`unsupported address kind ${kind}`);
    }
    case SCV_MAP: {
      if (reader.uint32() !== 1) throw new Error("map is absent");
      const entries = new Map<string, ScValue>();
      const count = reader.uint32();
      for (let i = 0; i < count; i++) {
        const key = readScVal(reader);
        if (typeof key !== "string") throw new Error("non-symbol map key");
        entries.set(key, readScVal(reader));
      }
      return entries;
    }
    default:
      throw new Error(`unsupported ScVal type ${type}`);
  }
}

function decodeScVal(base64: string): ScValue {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const reader = new XdrReader(new DataView(bytes.buffer));
  const value = readScVal(reader);
  if (!reader.done) throw new Error("trailing bytes");
  return value;
}

export interface SettledEvent {
  readonly from: string;
  readonly to: string;
  /** SEP-41 token contract (`C...`). */
  readonly asset: string;
  readonly maxAmount: bigint;
  readonly actualAmount: bigint;
}

export function decodeSettledEvent(topics: readonly string[], body: string): SettledEvent | null {
  try {
    if (topics.length !== 3) return null;
    const [name, from, to] = topics.map(decodeScVal);
    if (name !== "settled" || typeof from !== "string" || typeof to !== "string") return null;
    const map = decodeScVal(body);
    if (!(map instanceof Map)) return null;
    const asset = map.get("asset");
    const maxAmount = map.get("max_amount");
    const actualAmount = map.get("actual_amount");
    if (typeof asset !== "string" || typeof maxAmount !== "bigint") return null;
    if (typeof actualAmount !== "bigint") return null;
    if (actualAmount < 0n || actualAmount > maxAmount) return null;
    return { from, to, asset, maxAmount, actualAmount };
  } catch {
    return null;
  }
}
