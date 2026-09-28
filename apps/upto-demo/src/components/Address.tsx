import { accountUrl, contractUrl } from "../api/contract.js";

export function shorten(id: string): string {
  return id.length > 12 ? `${id.slice(0, 4)}…${id.slice(-4)}` : id;
}

export function Address({ id, full = false }: { readonly id: string; readonly full?: boolean }) {
  const href = id.startsWith("C") ? contractUrl(id) : accountUrl(id);
  return (
    <a className="mono" href={href} target="_blank" rel="noreferrer" title={id}>
      {full ? id : shorten(id)}
    </a>
  );
}
