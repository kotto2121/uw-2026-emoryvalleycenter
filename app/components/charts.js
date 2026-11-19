/**
 * Chart building blocks. Palette validated with the dataviz validator
 * (light surface #ffffff, all pairs): green, blue, orange — max 3 series per
 * chart. Gray is reserved for "Not recorded" / "All other".
 */
import { motion } from "framer-motion";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, Line, LineChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { fmt, monthLabel, shortMonth } from "../lib/format";

export const SERIES = ["#16a06e", "#2a78d6", "#eb6834"];
export const MUTED = "#b9c2bd";
const GRID = "#e8ebe6";
const AXIS = "#8a958f";

function ChartTooltip({ active, payload, label, labelFormatter = monthLabel }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tip">
      <div className="chart-tip-title">{labelFormatter(label)}</div>
      {payload.map((p) => (
        <div className="chart-tip-row" key={p.dataKey}>
          <span className="swatch" style={{ background: p.color || p.fill }} />
          <span>{p.name}</span>
          <strong>{fmt(p.value)}</strong>
        </div>
      ))}
    </div>
  );
}

const axisProps = {
  tickLine: false,
  axisLine: false,
  tick: { fill: AXIS, fontSize: 12 },
};

export function TrendBars({ data, xKey = "month", series, stacked = false, height = 260 }) {
  return (
    <div className="chart" style={{ height }}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }} barCategoryGap="28%">
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis dataKey={xKey} tickFormatter={shortMonth} {...axisProps} />
          <YAxis allowDecimals={false} width={44} {...axisProps} />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(22,160,110,.07)" }} />
          {series.length > 1 && <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: "#4a5a53" }} />}
          {series.map((s, i) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.label}
              stackId={stacked ? "a" : undefined}
              fill={s.color || SERIES[i]}
              radius={stacked ? (i === series.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]) : [4, 4, 0, 0]}
              stroke="#fff"
              strokeWidth={stacked ? 1 : 0}
              animationDuration={700}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function TrendLines({ data, xKey = "month", series, height = 260, area = false }) {
  const Chart = area ? AreaChart : LineChart;
  return (
    <div className="chart" style={{ height }}>
      <ResponsiveContainer>
        <Chart data={data} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
          <defs>
            {series.map((s, i) => (
              <linearGradient key={s.key} id={`grad-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={s.color || SERIES[i]} stopOpacity={0.22} />
                <stop offset="100%" stopColor={s.color || SERIES[i]} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis dataKey={xKey} tickFormatter={shortMonth} {...axisProps} />
          <YAxis allowDecimals={false} width={44} {...axisProps} />
          <Tooltip content={<ChartTooltip />} cursor={{ stroke: "#c9d1cc", strokeWidth: 1 }} />
          {series.length > 1 && <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: "#4a5a53" }} />}
          {series.map((s, i) =>
            area ? (
              <Area key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color || SERIES[i]} strokeWidth={2}
                fill={`url(#grad-${s.key})`} dot={{ r: 3.5, strokeWidth: 2, fill: "#fff" }} activeDot={{ r: 5 }} animationDuration={800} />
            ) : (
              <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color || SERIES[i]} strokeWidth={2}
                dot={{ r: 3.5, strokeWidth: 2, fill: "#fff" }} activeDot={{ r: 5 }} animationDuration={800} />
            )
          )}
        </Chart>
      </ResponsiveContainer>
    </div>
  );
}

/** Small single-series area for small multiples. */
export function Spark({ data, dataKey, color = SERIES[0], height = 56 }) {
  return (
    <div style={{ height }}>
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 4, right: 2, left: 2, bottom: 0 }}>
          <defs>
            <linearGradient id={`sp-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.25} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          {/* Hidden axis so the tooltip's label is the month, not the point's index. */}
          <XAxis dataKey="month" hide />
          <Tooltip content={<ChartTooltip />} cursor={{ stroke: "#c9d1cc" }} />
          <Area type="monotone" dataKey={dataKey} name="Count" stroke={color} strokeWidth={2} fill={`url(#sp-${dataKey})`} dot={false} activeDot={{ r: 3.5 }} animationDuration={700} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * Ranked horizontal bars in HTML (crisp labels, direct values).
 * rows: [{ label, n }]. Gray bars for "(Not recorded)" / "All other".
 */
export function BarList({ rows = [], total, color = SERIES[0], max, onSelect, formatLabel = (l) => l }) {
  const top = max ?? Math.max(1, ...rows.map((r) => r.n));
  const sum = total ?? rows.reduce((s, r) => s + r.n, 0);
  return (
    <div className="barlist">
      {rows.map((r, i) => {
        const muted = ["(Not recorded)", "All other", "Unrecognized option", "Narrative / other entries"].includes(r.label);
        return (
          <div className={`barlist-row${onSelect ? " clickable" : ""}`} key={r.label} onClick={onSelect ? () => onSelect(r) : undefined}
            title={`${r.label}: ${fmt(r.n)} (${sum ? ((r.n / sum) * 100).toFixed(1) : 0}%)`}>
            <div className="barlist-label">{formatLabel(r.label)}</div>
            <div className="barlist-track">
              <motion.div className="barlist-fill" style={{ background: muted ? MUTED : color }}
                initial={{ width: 0 }} animate={{ width: `${(r.n / top) * 100}%` }}
                transition={{ duration: 0.7, delay: 0.04 * i, ease: [0.2, 0.8, 0.2, 1] }} />
            </div>
            <div className="barlist-value">
              <strong>{fmt(r.n)}</strong>
              <span>{sum ? `${((r.n / sum) * 100).toFixed(r.n / sum < 0.1 ? 1 : 0)}%` : ""}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Part-to-whole in one thin segmented bar with a legend (<= 4 parts). */
export function SegmentBar({ parts }) {
  const total = parts.reduce((s, p) => s + p.n, 0) || 1;
  return (
    <div className="segbar">
      <div className="segbar-track">
        {parts.map((p, i) => (
          <motion.div key={p.label} className="segbar-seg" style={{ background: p.color || SERIES[i] }}
            initial={{ width: 0 }} animate={{ width: `${(p.n / total) * 100}%` }} transition={{ duration: 0.8, ease: [0.2, 0.8, 0.2, 1] }}
            title={`${p.label}: ${fmt(p.n)}`} />
        ))}
      </div>
      <div className="segbar-legend">
        {parts.map((p, i) => (
          <span key={p.label}><i style={{ background: p.color || SERIES[i] }} />{p.label} <strong>{fmt(p.n)}</strong> <em>{((p.n / total) * 100).toFixed(1)}%</em></span>
        ))}
      </div>
    </div>
  );
}
