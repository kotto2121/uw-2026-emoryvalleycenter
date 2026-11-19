import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import Icon from "./Icon";
import { fmt, monthLabel } from "../lib/format";

/** Count up to `value` once when it first appears / changes. */
export function useCountUp(value, duration = 900) {
  const [display, setDisplay] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    if (value === null || value === undefined) return;
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) { setDisplay(value); from.current = value; return; }
    const start = performance.now();
    const a = from.current;
    let raf;
    const tick = (t) => {
      const p = Math.min(1, (t - start) / duration);
      const e = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.round(a + (value - a) * e));
      if (p < 1) raf = requestAnimationFrame(tick);
      else from.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return display;
}

export function PageHeader({ eyebrow, title, subtitle, actions }) {
  return (
    <div className="page-header">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {subtitle && <p className="subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}

/**
 * KPI tile. `goodDirection` = "down" for things where fewer is better
 * (incidents), "up" where more is better, or null for neutral.
 */
export function Kpi({ label, value, previous, icon, hint, goodDirection = null, format = fmt, delay = 0, onClick, accent }) {
  const n = useCountUp(value);
  let delta = null;
  if (previous !== null && previous !== undefined && value !== null && value !== undefined) {
    const diff = value - previous;
    const dir = diff > 0 ? "up" : diff < 0 ? "down" : "flat";
    const tone = !goodDirection || dir === "flat" ? "neutral" : dir === goodDirection ? "good" : "bad";
    delta = { diff, dir, tone };
  }
  const Tag = onClick ? motion.button : motion.div;
  return (
    <Tag
      className={`kpi${onClick ? " clickable" : ""}${accent ? " accent" : ""}`}
      onClick={onClick}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay, ease: [0.2, 0.8, 0.2, 1] }}
    >
      <div className="kpi-top">
        <span className="kpi-label">{label}</span>
        {icon && <span className="kpi-icon"><Icon name={icon} size={16} /></span>}
      </div>
      <div className="kpi-value">{value === null || value === undefined ? "—" : format(n)}</div>
      <div className="kpi-foot">
        {delta ? (
          <span className={`delta ${delta.tone}`} title="Change vs. previous month">
            {delta.dir !== "flat" && <Icon name={delta.dir === "up" ? "arrowUp" : "arrowDown"} size={12} stroke={2.25} />}
            {delta.dir === "flat" ? "No change" : fmt(Math.abs(delta.diff))}
            <span className="delta-ctx"> vs last month</span>
          </span>
        ) : (
          <span className="kpi-hint">{hint || " "}</span>
        )}
      </div>
    </Tag>
  );
}

export function Card({ title, subtitle, actions, children, className = "", delay = 0, footer }) {
  return (
    <motion.section
      className={`card ${className}`}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.38, delay, ease: [0.2, 0.8, 0.2, 1] }}
    >
      {(title || actions) && (
        <div className="card-head">
          <div>
            {title && <h2>{title}</h2>}
            {subtitle && <p>{subtitle}</p>}
          </div>
          {actions && <div className="card-actions">{actions}</div>}
        </div>
      )}
      <div className="card-body">{children}</div>
      {footer && <div className="card-foot">{footer}</div>}
    </motion.section>
  );
}

export function Empty({ icon = "database", title, children, actions }) {
  return (
    <div className="empty">
      <div className="empty-icon"><Icon name={icon} size={26} /></div>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {actions && <div className="empty-actions">{actions}</div>}
    </div>
  );
}

export function Callout({ tone = "info", icon, children, title }) {
  return (
    <div className={`callout ${tone}`}>
      <Icon name={icon || (tone === "warn" ? "alert" : "info")} size={16} />
      <div>
        {title && <strong>{title} </strong>}
        {children}
      </div>
    </div>
  );
}

export function MonthSelect({ months = [], value, onChange, allowEmpty, emptyLabel = "All months", label }) {
  return (
    <label className="select">
      {label && <span className="select-label">{label}</span>}
      <select value={value || ""} onChange={(e) => onChange(e.target.value || null)}>
        {allowEmpty && <option value="">{emptyLabel}</option>}
        {[...months].reverse().map((m) => (
          <option key={m} value={m}>{monthLabel(m)}</option>
        ))}
      </select>
      <Icon name="chevronDown" size={14} />
    </label>
  );
}

export function Select({ value, onChange, options, label }) {
  return (
    <label className="select">
      {label && <span className="select-label">{label}</span>}
      <select value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={String(o.value)} value={o.value}>{o.label}</option>
        ))}
      </select>
      <Icon name="chevronDown" size={14} />
    </label>
  );
}

export function Toggle({ checked, onChange, label }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="toggle-track"><span className="toggle-thumb" /></span>
      {label}
    </label>
  );
}

export function Button({ children, icon, variant = "secondary", size, busy, className = "", ...props }) {
  return (
    <button {...props} className={`btn ${variant}${size ? ` ${size}` : ""} ${className}`} disabled={busy || props.disabled}>
      {busy ? <span className="spinner" /> : icon ? <Icon name={icon} size={16} /> : null}
      {children}
    </button>
  );
}

export function Skeleton({ h = 120 }) {
  return <div className="skeleton" style={{ height: h }} />;
}

export function useAsync(fn, deps) {
  const [state, setState] = useState({ loading: true, data: null, error: null });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    fn()
      .then((data) => alive && setState({ loading: false, data, error: null }))
      .catch((error) => alive && setState({ loading: false, data: null, error }));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  return { ...state, reload: () => setTick((t) => t + 1) };
}

let toastFn = null;
export function toast(msg, tone = "good") {
  toastFn && toastFn({ msg, tone, id: Date.now() + Math.random() });
}
export function Toaster() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    toastFn = (t) => {
      setItems((xs) => [...xs, t]);
      setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== t.id)), 4200);
    };
    return () => { toastFn = null; };
  }, []);
  return (
    <div className="toaster" role="status" aria-live="polite">
      {items.map((t) => (
        <motion.div key={t.id} className={`toast ${t.tone}`} initial={{ opacity: 0, y: 16, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }}>
          <Icon name={t.tone === "bad" ? "alert" : "check"} size={16} />
          {t.msg}
        </motion.div>
      ))}
    </div>
  );
}

/** Banner for months whose data looks incomplete (export pulled mid-month). */
export function PartialMonthNotice({ partialMonths }) {
  const entries = Object.entries(partialMonths || {});
  if (!entries.length) return null;
  const [m, last] = entries[0];
  const [y, mo] = m.split("-").map(Number);
  const name = new Date(Date.UTC(y, mo - 1, 1)).toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  const lastLabel = new Date(last + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  return (
    <Callout tone="warn" icon="calendar" title={`${name} looks incomplete.`}>
      The newest events are from {lastLabel}, so the export was probably pulled mid-month. {name} is shown in trends but isn&rsquo;t used as &ldquo;this month&rdquo; in comparisons.
    </Callout>
  );
}
