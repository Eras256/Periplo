import { marked, type Tokens } from "marked";

/** Matches how headings are actually rendered below: lowercase, accents stripped, non-alphanumerics collapsed to `-`. */
export function slugifyHeading(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export interface DocHeading {
  readonly depth: number;
  readonly text: string;
  readonly id: string;
}

/**
 * Build-time content from this repository's own content/docs, never user
 * input. `usedIds` is shared across every call for one page, so a repeated
 * heading (e.g. "Requirements" in two sections) gets `-2`, `-3`, ... like
 * GitHub's own anchors, instead of two headings silently sharing one id.
 */
export async function renderDocsMarkdown(
  source: string,
  usedIds: Set<string> = new Set()
): Promise<{ html: string; headings: DocHeading[] }> {
  const headings: DocHeading[] = [];
  const renderer = new marked.Renderer();
  renderer.heading = ({ tokens, depth }: Tokens.Heading): string => {
    const text = renderer.parser.parseInline(tokens);
    const plain = tokens.map((t) => ("text" in t ? (t.text as string) : "")).join("");
    const base = slugifyHeading(plain);
    let id = base;
    let n = 2;
    while (usedIds.has(id)) {
      id = `${base}-${n}`;
      n += 1;
    }
    usedIds.add(id);
    if (depth === 2 || depth === 3) headings.push({ depth, text: plain, id });
    return `<h${depth} id="${id}">${text}</h${depth}>`;
  };
  const html = await marked.parse(source, { gfm: true, renderer });
  return { html, headings };
}
