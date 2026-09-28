"use client";

import { useEffect, useState } from "react";

export type ThemeChoice = "light" | "dark" | "system";
export const THEME_KEY = "periplo-theme";

/** Runs before first paint (inlined in the root layout) so the page never flashes the wrong theme. */
export const THEME_BOOTSTRAP = `(function(){try{var t=localStorage.getItem("${THEME_KEY}");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t);}catch(e){}})();`;

function apply(choice: ThemeChoice) {
  const root = document.documentElement;
  if (choice === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", choice);
  try {
    if (choice === "system") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, choice);
  } catch {
    // Storage blocked (private mode): the choice still applies for this page view.
  }
}

const ICONS: Record<ThemeChoice, React.ReactNode> = {
  light: (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  ),
  dark: (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  ),
  system: (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8M12 16v4" />
    </svg>
  ),
};

export function ThemeSelector({
  labels,
}: {
  readonly labels: {
    readonly theme: string;
    readonly light: string;
    readonly dark: string;
    readonly system: string;
  };
}) {
  const [choice, setChoice] = useState<ThemeChoice>("system");

  useEffect(() => {
    const attr = document.documentElement.getAttribute("data-theme");
    setChoice(attr === "light" || attr === "dark" ? attr : "system");
  }, []);

  const select = (next: ThemeChoice) => {
    setChoice(next);
    apply(next);
  };

  return (
    // biome-ignore lint/a11y/useSemanticElements: a group of toggle buttons, not a form fieldset
    <div className="theme-select" role="group" aria-label={labels.theme}>
      {(["light", "dark", "system"] as const).map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={choice === option}
          aria-label={labels[option]}
          title={labels[option]}
          onClick={() => select(option)}
        >
          {ICONS[option]}
        </button>
      ))}
    </div>
  );
}
