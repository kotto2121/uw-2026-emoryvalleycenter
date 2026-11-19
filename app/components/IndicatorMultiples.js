import Icon from "./Icon";
import { Spark, SERIES } from "./charts";
import { INDICATORS } from "../lib/indicators";
import { fmt } from "../lib/format";

/**
 * Crisis & safety indicators as small multiples. Each tile shows its count in
 * `values`, the change vs. `previous` (when `showDelta`), and a sparkline over
 * `trend` (one row per month, one column per indicator flag). Extra tiles can
 * be passed as children.
 */
export default function IndicatorMultiples({ values, previous = null, trend, showDelta = true, children }) {
  return (
    <div className="multiples">
      {INDICATORS.map(([key, label, goal, how]) => {
        const diff = previous ? (values[key] || 0) - (previous[key] || 0) : null;
        return (
          <div className="multiple" key={key} title={how}>
            <div className="multiple-head">
              <span>{label}{goal && <span className="tag brand" style={{ marginLeft: 6, height: 18, fontSize: 10.5 }}>Goal</span>}</span>
              <strong>{fmt(values[key] || 0)}</strong>
            </div>
            {showDelta && (
              <div style={{ height: 22 }}>
                {diff !== null && (
                  <span className={`delta ${diff === 0 ? "neutral" : diff > 0 ? "bad" : "good"}`}>
                    {diff !== 0 && <Icon name={diff > 0 ? "arrowUp" : "arrowDown"} size={11} stroke={2.25} />}
                    {diff === 0 ? "No change" : fmt(Math.abs(diff))}
                  </span>
                )}
              </div>
            )}
            <Spark data={trend} dataKey={key} color={SERIES[2]} />
          </div>
        );
      })}
      {children}
    </div>
  );
}
