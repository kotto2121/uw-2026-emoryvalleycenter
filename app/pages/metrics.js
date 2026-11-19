import { useRouter } from "next/router";
import { useState } from "react";
import { useMeta } from "../components/Layout";
import { Button, Callout, Card, Empty, MonthSelect, PageHeader, Select, Skeleton, Toggle, useAsync } from "../components/ui";
import { TrendBars, SERIES } from "../components/charts";
import { api, qs } from "../lib/api";
import { INCLUDE_OPTIONS, SEGMENT_OPTIONS } from "../lib/filters";
import { dateLabel, fmt, monthLabel } from "../lib/format";

/**
 * Behavioral Metrics: the report tabs of EVC's Behavioral Reporting workbook
 * (Behavioral Health, Monthly Trend, Site, Individual), computed from the
 * imported PHS event report. Test patients are always left out.
 */
const SEGS = ["all", "behavioral", "non"];

export default function Metrics() {
  const router = useRouter();
  const { meta } = useMeta();
  const [from, setFrom] = useState(null);
  const [to, setTo] = useState(null);
  const [site, setSite] = useState("");
  const [segment, setSegment] = useState("");
  const [reportable, setReportable] = useState("");
  const [dups, setDups] = useState(false);
  const [metric, setMetric] = useState("any_metric");

  const filters = { from, to, site, segment, reportable, includeDuplicates: dups };
  const { data, loading } = useAsync(() => api.get(`/api/metrics${qs(filters)}`),
    [from, to, site, segment, reportable, dups, meta?.last_import, meta?.pending_reviews, meta?.behavioral_people, meta?.test_people]);

  if (!meta || (loading && !data)) return <Skeleton h={400} />;
  if (!meta.months.events.length) {
    return (
      <>
        <PageHeader eyebrow="Program" title="Behavioral Metrics" />
        <Card><Empty icon="activity" title="No event reports imported" actions={<Button variant="primary" icon="upload" onClick={() => router.push("/import")}>Import a PHS event report</Button>}>
          Import the &ldquo;New Reportable Event Report&rdquo; Excel export to see these metrics.
        </Empty></Card>
      </>
    );
  }
  if (!data) return <Card><Empty icon="alert" title="Couldn’t load the metrics">Try again, or check the app log.</Empty></Card>;

  const metricKeys = Object.keys(data.flags);
  const metricOptions = [
    { value: "any_metric", label: "Any of the above" },
    ...metricKeys.map((k) => ({ value: k, label: data.flags[k] })),
    { value: "events", label: "All events" },
  ];
  const metricLabel = metricOptions.find((o) => o.value === metric)?.label;
  const segLabel = SEGMENT_OPTIONS.find((o) => o.value === segment)?.label;
  const viewLabel = [segLabel, INCLUDE_OPTIONS.find((o) => o.value === reportable)?.label, site || "all sites"].join(" · ");
  const trendTotals = Object.fromEntries(["events", ...metricKeys, "any_metric"].map((k) => [k, data.trend.reduce((s, r) => s + (r[k] || 0), 0)]));

  return (
    <>
      <PageHeader
        eyebrow="Program dashboard"
        title="Behavioral Metrics"
        subtitle="Crisis and safety metrics from the PHS event report, split by Behavioral patients. Test patients are always left out, and one event can count toward more than one metric."
      />

      <div className="filters">
        <MonthSelect label="From" months={meta.months.events} value={from} onChange={setFrom} allowEmpty emptyLabel="Earliest" />
        <MonthSelect label="To" months={meta.months.events} value={to} onChange={setTo} allowEmpty emptyLabel="Latest" />
        <Select label="Site" value={site} onChange={setSite} options={[{ value: "", label: "All sites" }, ...meta.sites.map((x) => ({ value: x, label: x }))]} />
        <Select label="Segment" value={segment} onChange={setSegment} options={SEGMENT_OPTIONS} />
        <Select label="Events" value={reportable} onChange={setReportable} options={INCLUDE_OPTIONS} />
        <span className="spacer" />
        <Toggle checked={dups} onChange={setDups} label="Include exact duplicate rows" />
      </div>

      {(data.registry.behavioral === 0 || data.registry.test > 0) && (
        <div style={{ marginBottom: 16 }}>
          {data.registry.behavioral === 0 ? (
            <Callout tone="warn" icon="users">
              No one is marked Behavioral yet, so the Behavioral columns read 0. Tick &ldquo;Behavioral patient&rdquo; on a person&rsquo;s page, or import a BH roster.
            </Callout>
          ) : (
            <Callout tone="info" icon="users">
              {fmt(data.registry.behavioral)} people are marked Behavioral. {fmt(data.registry.test)} test {data.registry.test === 1 ? "patient is" : "patients are"} left out of every number on this page.
            </Callout>
          )}
        </div>
      )}

      <Card title="Metrics by segment" subtitle="Events = records that match the metric. People = distinct people with at least one. Shows every segment, so the Segment filter doesn’t apply here.">
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th rowSpan={2}>Metric</th>
                <th colSpan={3} style={{ textAlign: "center" }}>Events</th>
                <th colSpan={3} style={{ textAlign: "center" }}>People</th>
              </tr>
              <tr>
                {["Events", "People"].flatMap((g) => SEGMENT_OPTIONS.map((o) => <th key={g + o.value} className="num">{o.label}</th>))}
              </tr>
            </thead>
            <tbody>
              {data.summary.map((r) => {
                const strong = r.key === "any";
                const muted = r.key === "all";
                return (
                  <tr key={r.key} style={strong ? { fontWeight: 650 } : undefined} className={muted ? "muted" : undefined}>
                    <td>{r.label}</td>
                    {SEGS.map((sg) => <td key={`e${sg}`} className="num">{fmt(r.events[sg])}</td>)}
                    {SEGS.map((sg) => <td key={`p${sg}`} className="num">{fmt(r.people[sg])}</td>)}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Monthly trend" subtitle={`${metricLabel} by month · ${viewLabel}`} delay={0.05}
        actions={<Select label="Metric" value={metric} onChange={setMetric} options={metricOptions} />}>
        <TrendBars data={data.trend} series={[{ key: metric, label: metricLabel, color: SERIES[0] }]} />
        <div className="table-wrap" style={{ marginTop: 16 }}>
          <table className="tbl">
            <thead>
              <tr>
                {/* Headers wrap so nine columns fit the card without sideways scrolling. */}
                <th>Month</th>
                <th className="num" style={{ whiteSpace: "normal" }}>All events</th>
                {metricKeys.map((k) => <th key={k} className="num" style={{ whiteSpace: "normal" }}>{data.flags[k]}</th>)}
                <th className="num" style={{ whiteSpace: "normal" }}>Any of the above</th>
              </tr>
            </thead>
            <tbody>
              {data.trend.map((r) => (
                <tr key={r.month}>
                  <td style={{ whiteSpace: "nowrap" }}>{monthLabel(r.month)}</td>
                  <td className="num">{fmt(r.events)}</td>
                  {metricKeys.map((k) => <td key={k} className="num">{fmt(r[k])}</td>)}
                  <td className="num">{fmt(r.any_metric)}</td>
                </tr>
              ))}
              <tr style={{ fontWeight: 650 }}>
                <td>Total</td>
                <td className="num">{fmt(trendTotals.events)}</td>
                {metricKeys.map((k) => <td key={k} className="num">{fmt(trendTotals[k])}</td>)}
                <td className="num">{fmt(trendTotals.any_metric)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid cols-2">
        <Card className="flush" title="By site" subtitle={`${fmt(data.sites.length)} sites · click one to filter this page`} delay={0.1}>
          <div className="table-wrap" style={{ maxHeight: 460 }}>
            <table className="tbl">
              <thead><tr><th>Site / home</th><th className="num">Events</th><th className="num">Reportable</th><th className="num">Any metric</th><th className="num">People</th></tr></thead>
              <tbody>
                {data.sites.map((r) => (
                  <tr key={r.site} className={r.site !== "(Not recorded)" ? "clickable" : undefined}
                    onClick={r.site !== "(Not recorded)" ? () => setSite(site === r.site ? "" : r.site) : undefined}>
                    <td>{r.site}{site === r.site && <span className="tag brand" style={{ marginLeft: 6 }}>Filtered</span>}</td>
                    <td className="num">{fmt(r.events)}</td>
                    <td className="num">{fmt(r.reportable)}</td>
                    <td className="num">{fmt(r.any_metric)}</td>
                    <td className="num">{fmt(r.people)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!data.sites.length && <Empty icon="search" title="No events match these filters" />}
          </div>
        </Card>

        <Card className="flush" title="By person" subtitle={`${fmt(data.people.length)} people with events · click one to open their page`} delay={0.15}>
          <div style={{ padding: "0 20px 12px" }}>
            <Callout tone="warn" icon="lock">This table shows names. Use it only on a secured computer.</Callout>
          </div>
          <div className="table-wrap" style={{ maxHeight: 400 }}>
            <table className="tbl">
              <thead><tr><th>Person</th><th className="num">Events</th><th className="num">Reportable</th><th className="num">Any metric</th><th>Last event</th></tr></thead>
              <tbody>
                {data.people.map((r) => (
                  <tr key={r.id} className="clickable" onClick={() => router.push(`/people?id=${r.id}`)}>
                    <td>{r.name}{r.is_behavioral === 1 && <span className="tag brand" style={{ marginLeft: 6 }}>Behavioral</span>}</td>
                    <td className="num">{fmt(r.events)}</td>
                    <td className="num">{fmt(r.reportable)}</td>
                    <td className="num">{fmt(r.any_metric)}</td>
                    <td style={{ whiteSpace: "nowrap" }}>{dateLabel(r.last_event)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!data.people.length && <Empty icon="search" title="No events match these filters" />}
          </div>
        </Card>
      </div>
    </>
  );
}
