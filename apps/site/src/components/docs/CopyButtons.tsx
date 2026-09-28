"use client";

import { useEffect, useRef } from "react";

/**
 * Adds a copy button to every `pre > code` block inside `children`, once,
 * after the static HTML mounts. No library: `document.execCommand` and
 * external clipboard polyfills are avoided in favor of the standard
 * `navigator.clipboard` API, with a manual-selection fallback.
 */
export function CopyButtons({
  labels,
  children,
}: {
  readonly labels: { readonly copy: string; readonly copied: string };
  readonly children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = ref.current;
    if (!container) return;
    const blocks = container.querySelectorAll("pre");
    for (const pre of blocks) {
      if (pre.dataset.copyReady) continue;
      pre.dataset.copyReady = "1";
      pre.classList.add("code-block");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "copy-button";
      button.textContent = labels.copy;
      button.addEventListener("click", () => {
        const text = pre.textContent ?? "";
        const done = () => {
          button.textContent = labels.copied;
          setTimeout(() => {
            button.textContent = labels.copy;
          }, 1500);
        };
        navigator.clipboard?.writeText(text).then(done, () => {
          const range = document.createRange();
          range.selectNodeContents(pre);
          const selection = window.getSelection();
          selection?.removeAllRanges();
          selection?.addRange(range);
          done();
        });
      });
      pre.append(button);
    }
  }, [labels]);

  return (
    <div ref={ref} suppressHydrationWarning>
      {children}
    </div>
  );
}
