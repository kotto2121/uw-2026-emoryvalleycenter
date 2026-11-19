/**
 * BRAND: placeholder mark (a sprout in a ring — "Greenhouse").
 * Swap for the official Emory Valley Center logo: drop the SVG into
 * app/public/brand/ and render it here, keeping the same size props.
 * Keep electron/splash.html in sync.
 */
export default function Logo({ size = 32, animate = false, mono = false }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className={animate ? "logo-anim" : undefined} aria-hidden="true">
      <circle cx="50" cy="50" r="45" fill="none" stroke={mono ? "currentColor" : "var(--logo-ring)"} strokeWidth="6" className="logo-ring" />
      <path d="M50 78 V44" stroke={mono ? "currentColor" : "var(--logo-ring)"} strokeWidth="6" strokeLinecap="round" className="logo-stem" />
      <path d="M49 52 C36 52 26 44 25 30 C38 30 48 38 49 52 Z" fill={mono ? "currentColor" : "var(--logo-leaf-1)"} className="logo-leaf" />
      <path d="M51 46 C52 31 62 22 77 22 C76 37 66 46 51 46 Z" fill={mono ? "currentColor" : "var(--logo-leaf-2)"} className="logo-leaf" />
    </svg>
  );
}
