/** A periplus is a coastal voyage log: a route between waypoints. */
export function LogoMark({ size = 28 }: { readonly size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <rect
        x="1"
        y="1"
        width="30"
        height="30"
        rx="8"
        fill="none"
        stroke="currentColor"
        opacity="0.35"
      />
      <path
        d="M7 22c3-9 7-12 10-8s6 3 8-6"
        fill="none"
        stroke="var(--accent)"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeDasharray="0.1 4.2"
      />
      <circle cx="7" cy="22" r="2.6" fill="var(--accent)" />
      <circle cx="25" cy="8" r="2.6" fill="none" stroke="var(--accent)" strokeWidth="2" />
    </svg>
  );
}
