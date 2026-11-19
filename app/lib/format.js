export const nf = new Intl.NumberFormat("en-US");

export function fmt(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return nf.format(n);
}

export function pct(n, d, digits = 1) {
  if (!d) return "—";
  return `${((n / d) * 100).toFixed(digits)}%`;
}

export function monthLabel(m, style = "long") {
  if (!m) return "—";
  const [y, mo] = m.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, 1)).toLocaleString("en-US", {
    month: style === "short" ? "short" : "long",
    year: style === "short" ? "2-digit" : "numeric",
    timeZone: "UTC",
  });
}

export function shortMonth(m) {
  if (!m) return "";
  const [y, mo] = m.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, 1)).toLocaleString("en-US", { month: "short", timeZone: "UTC" });
}

export function dateLabel(d) {
  if (!d) return "—";
  const [y, m, day] = d.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export function relativeTime(sqlDate) {
  if (!sqlDate) return "never";
  const t = new Date(sqlDate.replace(" ", "T") + "Z").getTime();
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}

export function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

/**
 * True when two name strings are the same apart from order, case, punctuation
 * and middle initials ("Smith, John A." vs "John Smith"). Used to decide when
 * to show "as written in source" hints.
 */
export function sameName(a, b) {
  if (!a || !b) return true;
  const key = (s) => s.toLowerCase().replace(/[^a-z\s]/g, " ").split(/\s+/).filter((t) => t.length > 1).sort().join(" ");
  return key(a) === key(b);
}
