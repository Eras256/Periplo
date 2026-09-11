/**
 * Seller-side discovery metadata helper (spec §3 row 5, `packages/helpers`).
 *
 * `docs/SPEC.md`'s Phase 4 section says to "ship seller-side helpers so a
 * resource server declares discovery metadata correctly with minimal
 * boilerplate, including per-parameter descriptions", since those
 * descriptions are the primary input to Phase 5's search ranking. That
 * helper was scoped from day one but never built: this repo's own resource
 * server (`apps/facilitator/src/demo-resource.ts`) hand-writes its
 * `inputSchema.properties` and separately hand-writes its runtime
 * query-param parsing (`Number(c.req.query("value"))` and friends), two
 * independent places a seller can drift a description out of sync with, or
 * omit one from entirely, with nothing catching it. An SCF #45 panel review
 * finding named exactly this gap.
 *
 * `definePaidResource` closes it: one declarative `params` map is the single
 * source of truth for both the discovery JSON Schema and the runtime parser.
 * It does not reimplement the bazaar wire format itself:
 * `declareDiscoveryExtension` (from `@x402/extensions/bazaar`) still builds
 * the actual extension payload, the same "don't reimplement the wire
 * protocol" principle CLAUDE.md already applies everywhere else in this
 * repo. This helper only removes the boilerplate and the drift risk around
 * declaring the per-parameter metadata that principle doesn't cover.
 *
 * Scope, stated honestly, not left implicit: v1 covers query-parameter
 * (GET/HEAD/DELETE) HTTP resources only, matching the one real resource
 * server this repo runs. Body-method (POST/PUT/PATCH) and MCP-tool
 * resources still go through `declareDiscoveryExtension` directly; this
 * builder does not cover them yet.
 */

import type {
  DeclareQueryDiscoveryExtensionConfig,
  DiscoveryExtension,
} from "@x402/extensions/bazaar";
import { declareDiscoveryExtension } from "@x402/extensions/bazaar";

/** A parameter type this helper can both describe (JSON Schema) and parse
 * (from a raw string query value, the only form an HTTP query param takes). */
export type ParamType = "string" | "number" | "boolean";

export interface ParamSpec {
  type: ParamType;
  /**
   * Required, not optional: the gap this helper closes is exactly "a
   * per-parameter description was missing." A spec with no description
   * fails fast at `definePaidResource` call time instead of silently
   * shipping an undescribed parameter.
   */
  description: string;
  /** Only meaningful for `type: "string"`. */
  enum?: readonly string[];
  /** Defaults to `true`. Set `false` for an optional query parameter. */
  required?: boolean;
  /**
   * Used as the value for this parameter in the discovery payload's
   * `input` example. Falls back to a type-appropriate synthesized value
   * (see `synthesizeExample`) when omitted, so a spec is never blocked on
   * providing one.
   */
  example?: string | number | boolean;
}

export interface PaidResourceOutput {
  schema: Record<string, unknown>;
  example: Record<string, unknown>;
}

export interface PaidResourceConfig {
  /** Per-parameter declaration, keyed by query-parameter name. */
  params: Record<string, ParamSpec>;
  /** Optional: the discovery payload's declared response shape. */
  output?: PaidResourceOutput;
}

export interface ParsedInput {
  ok: true;
  value: Record<string, string | number | boolean>;
}

export interface RejectedInput {
  ok: false;
  errors: string[];
}

export interface PaidResourceDeclaration {
  /**
   * Ready to spread into a route's `extensions` field, e.g.
   * `extensions: { ...declaration.extensions }` (the exact call
   * `demo-resource.ts` already makes to `declareDiscoveryExtension`
   * directly; this replaces that call, not the route it's spread into).
   */
  extensions: Record<string, DiscoveryExtension>;
  /**
   * Parses raw query-parameter strings (e.g. Hono's `c.req.query(name)`
   * results, or any other framework's equivalent string-valued query map)
   * against the same `params` spec the discovery schema was built from, so
   * the declared schema and the runtime parser can never drift apart.
   */
  parseInput(source: Record<string, string | undefined>): ParsedInput | RejectedInput;
}

function paramJsonSchema(spec: ParamSpec): Record<string, unknown> {
  const schema: Record<string, unknown> = {
    type: spec.type,
    description: spec.description,
  };
  if (spec.enum) {
    schema.enum = spec.enum;
  }
  return schema;
}

/** A value a synthesized `input` example can use for this parameter when
 * the spec itself doesn't provide one, always valid against the spec's own
 * constraints (an `enum`'s first member, never an arbitrary placeholder). */
function synthesizeExample(name: string, spec: ParamSpec): string | number | boolean {
  if (spec.example !== undefined) {
    return spec.example;
  }
  if (spec.enum && spec.enum.length > 0) {
    // enum is declared as readonly string[] and checked non-empty above.
    return spec.enum[0] as string;
  }
  switch (spec.type) {
    case "number":
      return 0;
    case "boolean":
      return false;
    case "string":
      return name;
  }
}

/**
 * Declares discovery metadata for a query-parameter HTTP resource
 * (GET/HEAD/DELETE) from one parameter spec, and returns a matching runtime
 * parser. Does not build a route's `accepts`/`resource` fields: those are
 * deployment-specific (payTo, network, base URL), and stay the caller's own
 * responsibility, the same division `demo-resource.ts` already draws
 * between its `config` (deployment-specific) and its discovery declaration.
 *
 * @throws if `params` is empty, or any parameter is missing a description.
 */
export function definePaidResource(config: PaidResourceConfig): PaidResourceDeclaration {
  const entries = Object.entries(config.params);
  if (entries.length === 0) {
    throw new Error("definePaidResource: params must declare at least one parameter");
  }

  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  const example: Record<string, string | number | boolean> = {};

  for (const [name, spec] of entries) {
    if (!spec.description) {
      throw new Error(
        `definePaidResource: parameter "${name}" has no description. ` +
          "Per-parameter descriptions are required, not optional: they are " +
          "the primary input to Bazaar search ranking (docs/SPEC.md Phase 5)."
      );
    }
    properties[name] = paramJsonSchema(spec);
    if (spec.required !== false) {
      required.push(name);
    }
    example[name] = synthesizeExample(name, spec);
  }

  const declareConfig: DeclareQueryDiscoveryExtensionConfig = {
    input: example,
    inputSchema: { properties, required },
    ...(config.output ? { output: config.output } : {}),
  };
  const extensions = declareDiscoveryExtension(declareConfig);

  function parseInput(source: Record<string, string | undefined>): ParsedInput | RejectedInput {
    const value: Record<string, string | number | boolean> = {};
    const errors: string[] = [];

    for (const [name, spec] of entries) {
      const raw = source[name];
      if (raw === undefined) {
        if (spec.required !== false) {
          errors.push(`"${name}" is required`);
        }
        continue;
      }
      switch (spec.type) {
        case "number": {
          const n = Number(raw);
          if (!Number.isFinite(n)) {
            errors.push(`"${name}" must be a number, got "${raw}"`);
            break;
          }
          value[name] = n;
          break;
        }
        case "boolean": {
          if (raw !== "true" && raw !== "false") {
            errors.push(`"${name}" must be "true" or "false", got "${raw}"`);
            break;
          }
          value[name] = raw === "true";
          break;
        }
        case "string": {
          if (spec.enum && !spec.enum.includes(raw)) {
            errors.push(`"${name}" must be one of ${spec.enum.join(", ")}, got "${raw}"`);
            break;
          }
          value[name] = raw;
          break;
        }
      }
    }

    if (errors.length > 0) {
      return { ok: false, errors };
    }
    return { ok: true, value };
  }

  return { extensions, parseInput };
}
