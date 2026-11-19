import { useRouter } from "next/router";
import { useState } from "react";
import Icon from "../components/Icon";
import { useMeta } from "../components/Layout";
import { Button, Callout, Card, Empty, Kpi, MonthSelect, PageHeader, PartialMonthNotice, Skeleton, useAsync } from "../components/ui";
import IndicatorMultiples from "../components/IndicatorMultiples";
import { MUTED, SegmentBar, TrendLines, SERIES } from "../components/charts";
import { api, qs } from "../lib/api";
import { fmt, monthLabel } from "../lib/format";

export default function BehavioralHealth() {
  const router = useRouter();
  const { meta } = useMeta();
  const [month, setMonth] = useState(null);
  // meta.behavioral_people / test_people change when a person's boxes change.
  const { data, loading } = useAsync(() => api.get(`/api/bh${qs({ month })}`),
    [month, meta?.last_import, meta?.pending_reviews, meta?.behavioral_people, meta?.test_people]);

  if (!meta || (loading && !data)) return <Skeleton h={400} />;
  if (!data?.current) {
    return (
      <>
        <PageHeader eyebrow="Program" title="Behavioral Health" />
        <Card><Empty icon="brain" title="No behavioral health data yet" actions={<Button variant="primary" icon="upload" onClick={() => router.push("/import")}>Import events</Button>}>
          Import the PHS event report (Excel), then tick Behavioral on each BH client&rsquo;s page under People.
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
        subtitle={`Incidents involving people marked Behavioral in ${monthLabel(data.month)}, with crisis indicators from the PHS event report.`}
        actions={<MonthSelect months={data.months} value={data.month} onChange={setMonth} />}
      />

      <PartialMonthNotice partialMonths={data.partialMonths} />
      {data.bhPeople === 0 && (
        <Callout tone="info" icon="user" title="No one is marked Behavioral yet.">
          Tick Behavioral on a person&rsquo;s page under <a href="#" onClick={(e) => { e.preventDefault(); router.push("/people"); }} style={{ textDecoration: "underline" }}>People</a>. Importing a BH roster ticks it for everyone on the roster.
        </Callout>
      )}

      <div className="grid cols-4">
        <Kpi label="Behavioral clients" icon="brain" value={data.bhPeople} hint="People with the Behavioral box ticked" accent
          onClick={() => router.push("/people")} />
        <Kpi label="BH clients with an incident" icon="users" value={data.bhPeople ? c.bhClientsWithEvents : null} previous={data.bhPeople && data.previous ? p.bhClientsWithEvents : null} goodDirection="down" delay={0.05}
          onClick={() => router.push("/metrics")} />
        <Kpi label="Incidents involving BH clients" icon="shield" value={data.bhPeople ? c.bhClientEvents : null} previous={data.bhPeople && data.previous ? p.bhClientEvents : null} goodDirection="down" delay={0.1}
          onClick={() => router.push("/metrics")} />
        <Kpi label="Reportable, BH clients" icon="alert" value={data.bhPeople ? c.bhReportable : null} previous={data.bhPeople && data.previous ? p.bhReportable : null} goodDirection="down" delay={0.15}
          onClick={() => router.push("/metrics")} />
      </div>

      <div className="grid cols-2-1">
        <Card title="BH incidents by month" subtitle="Event records involving people marked Behavioral (duplicates excluded)" delay={0.1}>
          <TrendLines data={data.trend} series={[
            { key: "bhClientEvents", label: "Incident records", color: SERIES[2] },
            { key: "bhClientsWithEvents", label: "BH clients with an incident", color: SERIES[0] },
          ]} />
        </Card>
        <Card title="Share of incidents" subtitle={`All event records in ${monthLabel(data.month)}`} delay={0.15}>
          <SegmentBar parts={[
            { label: "BH clients", n: c.bhClientEvents, color: SERIES[2] },
            { label: "Everyone else", n: c.events - c.bhClientEvents, color: MUTED },
          ]} />
          <div style={{ marginTop: 22 }}>
            <Callout tone="info" icon="merge">
              {fmt(c.bhClientEvents)} of {fmt(c.events)} incident records in {monthLabel(data.month)} involve people marked Behavioral — linked through the person registry, not by name text.
            </Callout>
          </div>
        </Card>
      </div>

      <Card title="Crisis & safety indicators" subtitle={`Event records involving BH clients in ${monthLabel(data.month)} · six-month trend · change vs. previous month`} delay={0.2}
        footer={<span><Icon name="info" size={13} style={{ verticalAlign: -2 }} /> Counted from PHS&rsquo;s real option labels (hover a tile to see exactly how). Property damage has no PHS option, so it&rsquo;s a minimum taken from narratives. Confirm definitions with Kristen before reporting externally.</span>}>
        <IndicatorMultiples values={c} previous={data.previous} trend={data.trend.slice(-6)}>
          <div className="multiple" style={{ borderStyle: "dashed", display: "flex", flexDirection: "column", justifyContent: "center", gap: 6 }}>
            <span style={{ fontSize: 12.5, color: "var(--ink-2)", fontWeight: 550 }}>People with BCBA services</span>
            <span className="muted" style={{ fontSize: 12 }}>Needs a BCBA caseload source — not in the current files.</span>
          </div>
        </IndicatorMultiples>
      </Card>
    </>
  );
}
