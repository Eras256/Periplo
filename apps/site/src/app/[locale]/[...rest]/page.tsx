import { notFound } from "next/navigation";

// Any path under a valid locale that no other route matches renders the
// localized not-found page, inside the site's layout.
export default function CatchAll() {
  notFound();
}
