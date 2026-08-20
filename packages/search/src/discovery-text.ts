/**
 * Builds the text a resource gets embedded from: resource description,
 * per-parameter descriptions, and the MCP tool schema (spec §5's exact
 * list). Schema-shape-agnostic on purpose: HTTP's `queryParams`/`body`
 * schema and MCP's `inputSchema` nest their per-parameter `description`
 * fields differently (see `apps/facilitator/src/discovery.ts`'s
 * `extractParameters`), so this walks the whole `parameters` object
 * looking for any `description` key rather than special-casing either
 * shape, new schema variants get picked up without a second change here.
 */

export interface DiscoveryTextInput {
  readonly description: string | null;
  readonly parameters: Record<string, unknown>;
  /**
   * The MCP tool name, when this resource is an MCP tool (`null`/omitted
   * for HTTP resources, which have no equivalent identity field). Folded
   * in so a resource with no real `description` yet (a thin or
   * newly-cataloged listing) is still embeddable from its own name rather
   * than producing an empty string, closing the same "identity isn't
   * searchable" bug class the `fts` generated column's own fix addresses
   * on the lexical side (`supabase/migrations/20260819180000_search.sql`).
   * Underscores/hyphens are loosened to spaces before being added: the raw
   * literal (`financial_analysis_da8703fa-...`) is a valid identifier but
   * a poor embedding input, the model was trained on natural text, not
   * slugs.
   */
  readonly toolName?: string | null;
}

/** Recursively collects every string value found under a `description` key. */
function collectDescriptions(node: unknown, out: string[]): void {
  if (Array.isArray(node)) {
    for (const item of node) collectDescriptions(item, out);
    return;
  }
  if (!node || typeof node !== "object") {
    return;
  }
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (key === "description" && typeof value === "string" && value.trim().length > 0) {
      out.push(value.trim());
    } else {
      collectDescriptions(value, out);
    }
  }
}

/** Collects parameter/property *names* too, a query naming a field ("ticker") should match even with no description. */
function collectPropertyNames(node: unknown, out: string[]): void {
  if (Array.isArray(node)) {
    for (const item of node) collectPropertyNames(item, out);
    return;
  }
  if (!node || typeof node !== "object") {
    return;
  }
  const record = node as Record<string, unknown>;
  const properties = record["properties"];
  if (properties && typeof properties === "object" && !Array.isArray(properties)) {
    for (const name of Object.keys(properties as Record<string, unknown>)) {
      out.push(name);
    }
  }
  for (const value of Object.values(record)) {
    collectPropertyNames(value, out);
  }
}

/**
 * Builds the embeddable text for a resource. Deliberately plain
 * whitespace-joined prose, not JSON: the embedding model was trained on
 * natural text, not serialized schemas, so a flattened sentence gives it a
 * better shot than a JSON dump would.
 */
export function buildDiscoveryText(input: DiscoveryTextInput): string {
  const descriptions: string[] = [];
  if (input.description) {
    descriptions.push(input.description.trim());
  }
  if (input.toolName?.trim()) {
    descriptions.push(input.toolName.trim().replace(/[_-]+/g, " "));
  }
  collectDescriptions(input.parameters, descriptions);

  const names: string[] = [];
  collectPropertyNames(input.parameters, names);

  const parts = [...new Set(descriptions)];
  const uniqueNames = [...new Set(names)];
  if (uniqueNames.length > 0) {
    parts.push(`Parameters: ${uniqueNames.join(", ")}.`);
  }

  return parts.join(" ").trim();
}
