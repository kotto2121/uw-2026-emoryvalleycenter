import { useRouter } from "next/router";
import { useState } from "react";
import Icon from "../components/Icon";
import { useMeta } from "../components/Layout";
import { Button, Callout, Card, Empty, Kpi, MonthSelect, PageHeader, PartialMonthNotice, Skeleton, useAsync } from "../components/ui";
import { SegmentBar, Spark, TrendLines, SERIES } from "../components/charts";
import { api, qs } from "../lib/api";
import { fmt, monthLabel } from "../lib/format";

// [flag, label, is a Data Metric Goal, how it's counted] — full definitions in docs/metrics.md
const INDICATORS = [
  ["f_hospitalization", "Hospitalizations", true, "“Psychiatric Admission…” (behavioral) or a “Hospitalization – Medical/Psychiatric” intervention. ER visits are counted separately."],
  ["f_police", "Police involvement", true, "“Engagement with Law Enforcement”, the “Police” intervention, or “Incarceration”."],
  ["f_crisis", "Crisis events", true, "Any “Behavioral Crisis requiring …” option, or Mobile Crisis / MH Mobile Crisis Team involvement."],
  ["f_property_damage", "Property damage", true, "“Property Destruction exceeding $100”, plus narrative mentions of property damage."],
  ["f_er", "ER visits", false, "“Emergency Room Visit” or “Hospital Emergency Room”."],
  ["f_911", "911 calls", false, "“911 Call” intervention."],
  ["f_self_injury", "Self-injury / suicide attempt", false, "“Self-Injurious Behavior” or “Suicide Attempt” only."],
  ["f_restraint", "Restrictive interventions", false, "Manual/mechanical restraint, protective equipment, or emergency psychotropic medication."],
];

export default function BehavioralHealth() {
  const router = useRouter();
  const { meta } = useMeta();
  const [month, setMonth] = useState(null);
  const { data, loading } = useAsync(() => api.get(`/api/bh${qs({ month })}`), [month, meta?.last_import, meta?.pending_reviews]);

  if (!meta || (loading && !data)) return <Skeleton h={400} />;
  if (!data?.current) {
    return (
      <>
        <PageHeader eyebrow="Program" title="Behavioral Health" />
        <Card><Empty icon="brain" title="No behavioral health data yet" actions={<Button variant="primary" icon="upload" onClick={() => router.push("/import")}>Import roster & events</Button>}>
          Import the monthly behavioral health roster (Word) and the PHS event report (Excel) to populate this dashboard.
        </Empty></Card>
      </>
    );
  }
  const c = data.current;
  const p = data.previous || {};

  return (
    <>
      <PageHeader
        eyebrow="Program dashboard"
        title="Behavioral Health"
        subtitle={`Outpatient therapy (OP) and psychosocial rehabilitation (PSR) clients for ${monthLabel(data.month)}, with crisis indicators from the PHS event report.`}
        actions={<>
          <MonthSelect months={data.months} value={data.month} onChange={setMonth} />
          <Button icon="file" onClick={() => router.push(`/reports?month=${data.month}`)}>OP & PSR reports</Button>
        </>}
      />

      <PartialMonthNotice partialMonths={data.partialMonths} />
      {c.bhPeople === 0 && (
        <Callout tone="info" icon="file" title={`No behavioral health roster for ${monthLabel(data.month)}.`}>
          OP / PSR counts need the monthly roster (Word document) — <a href="#" onClick={(e) => { e.preventDefault(); router.push("/import"); }} style={{ textDecoration: "underline" }}>import it</a>. The crisis &amp; safety indicators below come from the PHS event report and cover <strong>everyone</strong> in it, not only BH clients.
        </Callout>
      )}

      <div className="grid cols-4">
        <Kpi label="People in OP" icon="user" value={c.bhPeople ? c.op : null} previous={c.bhPeople ? p.op : null} goodDirection="up" accent />
        <Kpi label="People in PSR" icon="users" value={c.bhPeople ? c.psr : null} previous={c.bhPeople ? p.psr : null} goodDirection="up" delay={0.05} />
        <Kpi label="Receiving both" icon="merge" value={c.bhPeople ? c.both : null} previous={c.bhPeople ? p.both : null} delay={0.1} />
        <Kpi label="BH clients with an incident" icon="shield" value={c.bhPeople ? c.bhClientsWithEvents : null} previous={c.bhPeople ? p.bhClientsWithEvents : null} goodDirection="down" delay={0.15}
          onClick={() => router.push("/incidents")} />
      </div>

      <div className="grid cols-2-1">
        <Card title="Enrollment trend" subtitle="Distinct people on each roster, for months with a roster imported" delay={0.1}>
          {data.trend.filter((t) => t.hasRoster).length ? (
            <TrendLines data={data.trend.filter((t) => t.hasRoster)} series={[{ key: "op", label: "Outpatient (OP)", color: SERIES[0] }, { key: "psr", label: "PSR", color: SERIES[1] }]} />
          ) : <p className="muted">No roster imported yet — enrollment trends appear once monthly rosters are imported.</p>}
        </Card>
        <Card title="Service mix" subtitle={`${fmt(c.bhPeople)} distinct BH clients in ${monthLabel(data.month)}`} delay={0.15}>
          <SegmentBar parts={[
            { label: "OP only", n: c.op - c.both, color: SERIES[0] },
            { label: "PSR only", n: c.psr - c.both, color: SERIES[1] },
            { label: "Both", n: c.both, color: SERIES[2] },
          ]} />
          <div style={{ marginTop: 22 }}>
            <Callout tone="info" icon="merge">
              {fmt(c.bhClientEvents)} incident records in {monthLabel(data.month)} involve BH clients — linked through the person registry, not by name text.
            </Callout>
          </div>
        </Card>
      </div>

      <Card title="Crisis & safety indicators" subtitle={`Counts of event records in ${monthLabel(data.month)} · six-month trend · change vs. previous month`} delay={0.2}
        footer={<span><Icon name="info" size={13} style={{ verticalAlign: -2 }} /> Counted from PHS&rsquo;s real option labels (hover a tile to see exactly how). Property damage has no PHS option, so it&rsquo;s a minimum taken from narratives. Confirm definitions with Kristen before reporting externally.</span>}>
        <div className="multiples">
          {INDICATORS.map(([key, label, goal, how]) => {
            const diff = data.previous ? c[key] - p[key] : null;
            return (
              <div className="multiple" key={key} title={how}>
                <div className="multiple-head">
                  <span>{label}{goal && <span className="tag brand" style={{ marginLeft: 6, height: 18, fontSize: 10.5 }}>Goal</span>}</span>
                  <strong>{fmt(c[key])}</strong>
                </div>
                <div style={{ height: 22 }}>
                  {diff !== null && (
                    <span className={`delta ${diff === 0 ? "neutral" : diff > 0 ? "bad" : "good"}`}>
                      {diff !== 0 && <Icon name={diff > 0 ? "arrowUp" : "arrowDown"} size={11} stroke={2.25} />}
                      {diff === 0 ? "No change" : fmt(Math.abs(diff))}
                    </span>
                  )}
                </div>
                <Spark data={data.trend.slice(-6)} dataKey={key} color={SERIES[2]} />
              </div>
            );
          })}
          <div className="multiple" style={{ borderStyle: "dashed", display: "flex", flexDirection: "column", justifyContent: "center", gap: 6 }}>
            <span style={{ fontSize: 12.5, color: "var(--ink-2)", fontWeight: 550 }}>People with BCBA services</span>
            <span className="muted" style={{ fontSize: 12 }}>Needs a BCBA caseload source — not in the current files.</span>
          </div>
        </div>
      </Card>
    </>
  );
}
