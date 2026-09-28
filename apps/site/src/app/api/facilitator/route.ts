import { parseFacilitatorStatus } from "@/lib/facilitator-status";
import { FACILITATOR_URL } from "@/lib/links";

// The facilitator sends no CORS headers, so the browser cannot read it
// directly; this route reads it server-side. Only two fixed URLs are ever
// fetched (no user input reaches them), and the CDN cache keeps visitors
// from multiplying load on the one-machine testnet deployment.
export const dynamic = "force-dynamic";

async function getJson(path: string): Promise<unknown> {
  try {
    const response = await fetch(`${FACILITATOR_URL}${path}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
      headers: { accept: "application/json" },
    });
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
}

export async function GET() {
  const [supported, status] = await Promise.all([getJson("/supported"), getJson("/status")]);
  const parsed = parseFacilitatorStatus(supported, status, new Date());
  if (!parsed) {
    return Response.json({ ok: false }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
  return Response.json(
    { ok: true, status: parsed },
    { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=30" } }
  );
}
