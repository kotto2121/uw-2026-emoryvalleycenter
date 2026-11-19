import Link from "next/link";
import { useRouter } from "next/router";
import Icon from "../components/Icon";
import Logo from "../components/Logo";
import { useMeta } from "../components/Layout";
import LoadDemoButton from "../components/LoadDemoButton";
import { Button, Card, Empty, Kpi, PartialMonthNotice, Skeleton, useAsync } from "../components/ui";
import { TrendBars, TrendLines, SERIES } from "../components/charts";
import { api } from "../lib/api";
import { fmt, greeting, monthLabel, relativeTime } from "../lib/format";
import { PROGRAMS } from "../lib/programs";

function Welcome() {
  const router = useRouter();
  return (
    <>
      <div className="hero">
        <div style={{ position: "relative" }}>
          <div className="eyebrow">Welcome to Greenhouse</div>
          <h1>One place for Emory Valley Center&rsquo;s numbers.</h1>
          <p>Import the monthly PHS event report and the behavioral health roster, confirm a few name matches, and your dashboards and reports build themselves. Everything stays on this computer.</p>
        </div>
        <div className="hero-art"><Logo size={260} /></div>
      </div>
      <Card>
        <Empty icon="sprout" title="No data yet" actions={<>
          <Button variant="primary" icon="upload" onClick={() => router.push("/import")}>Import files</Button>
          <LoadDemoButton variant="secondary" label="Explore with demo data" />
        </>}>
          Start with real files from PHS, or load six months of realistic, fictitious demo data to explore every screen.
        </Empty>
      </Card>
    </>
  );
}

export default function Overview() {
  const router = useRouter();
  const { meta } = useMeta();
  const { data, loading } = useAsync(() => api.get("/api/overview"), [meta?.last_import, meta?.pending_reviews]);

  if (!meta || loading && !data) return <><Skeleton h={150} /><div className="grid cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} h={120} />)}</div></>;
  if (!meta.hasData) return <Welcome />;

  const trend = data?.trend || [];
  const partial = data?.partialMonths || {};
  const complete = trend.filter((t) => !partial[t.month]);
  const cur = complete[complete.length - 1] || {};
  const prev = complete[complete.length - 2] || {};
  const live = PROGRAMS.filter((p) => p.status === "live");
  const planned = PROGRAMS.filter((p) => p.status !== "live");
  const sourceNames = { incident_xlsx: ["PHS event report", "file"], bh_docx: ["Behavioral health roster", "file"] };

  return (
    <>
      <div className="hero">
        <div style={{ position: "relative" }}>
          <div className="eyebrow">{greeting()}</div>
          <h1>Emory Valley Center at a glance</h1>
          <p>Figures for <strong style={{ color: "#fff" }}>{monthLabel(cur.month)}</strong> (latest complete month), from {fmt(meta.imports)} imported files. {meta.pending_reviews > 0 && <>There {meta.pending_reviews === 1 ? "is" : "are"} <Link href="/review" style={{ color: "#c8e6a0", textDecoration: "underline" }}>{meta.pending_reviews} possible duplicate {meta.pending_reviews === 1 ? "person" : "people"}</Link> to confirm.</>}</p>
        </div>
        <div className="hero-stats">
          <div className="hero-stat"><strong>{fmt(meta.people)}</strong><span>people in registry</span></div>
          <div className="hero-stat"><strong>{fmt(meta.months.all.length)}</strong><span>months of history</span></div>
          <div className="hero-stat"><strong>{fmt(meta.events)}</strong><span>event records</span></div>
        </div>
        <div className="hero-art"><Logo size={260} /></div>
      </div>

      <PartialMonthNotice partialMonths={partial} />

      <div className="grid cols-4">
        <Kpi label="People in records this month" icon="users" value={cur.people} previous={prev.people} delay={0} accent />
        <Kpi label="Behavioral health clients" icon="brain" value={data?.bhPeople} hint="People with the Behavioral box ticked" delay={0.05} onClick={() => router.push("/behavioral-health")} />
        <Kpi label="Incidents this month" icon="shield" value={cur.events} previous={prev.events} goodDirection="down" delay={0.1} onClick={() => router.push("/incidents")} />
        <Kpi label="Reportable incidents" icon="alert" value={cur.reportable} previous={prev.reportable} goodDirection="down" delay={0.15} onClick={() => router.push("/incidents")} />
      </div>

      <div className="grid cols-2">
        <Card title="People in records" subtitle="Distinct people appearing in any imported source, by month" delay={0.1}>
          <TrendLines data={trend} series={[{ key: "people", label: "People", color: SERIES[0] }]} area />
        </Card>
        <Card title="Incidents" subtitle="Reportable vs. non-reportable events by month (duplicates excluded)" delay={0.15}>
          <TrendBars data={trend.map((t) => ({ ...t, nonreportable: t.events - t.reportable }))} stacked
            series={[{ key: "nonreportable", label: "Non-reportable", color: SERIES[1] }, { key: "reportable", label: "Reportable", color: SERIES[2] }]} />
        </Card>
      </div>

      <div className="grid cols-2-1">
        <Card title="Programs" subtitle={`${live.length} live dashboards · ${planned.length} on the roadmap`} delay={0.2}>
          <div className="programs">
            {[...live, ...planned].map((p) => (
              <Link key={p.slug} href={p.href || `/programs?p=${p.slug}`} className={`program-tile ${p.status}`}>
                <div className="pt-head">
                  <span className="pt-icon"><Icon name={p.icon} size={17} /></span>
                  {p.status === "live" ? <span className="tag good">Live</span> : <span className="tag">Planned</span>}
                </div>
                <strong>{p.name}</strong>
                <small>{p.metrics.length} metrics{p.restricted ? " · restricted" : ""}</small>
              </Link>
            ))}
          </div>
        </Card>
        <Card title="Data sources" subtitle="What feeds these dashboards" delay={0.25}
          actions={<Button size="sm" icon="upload" onClick={() => router.push("/import")}>Import</Button>}>
          {(data?.sources || []).map((s) => (
            <div className="source-row" key={s.kind}>
              <span className="source-icon"><Icon name={s.kind === "bh_docx" ? "file" : "database"} size={17} /></span>
              <div>
                <strong>{(sourceNames[s.kind] || [s.kind])[0]}</strong>
                <span>{fmt(s.imports)} imports · {fmt(s.rows)} rows · last {relativeTime(s.last_import)}</span>
              </div>
              <span className="tag good"><Icon name="check" size={12} /> Current</span>
            </div>
          ))}
          {["Paylocity (HR & pay)", "PHS demographics", "Program spreadsheets"].map((n) => (
            <div className="source-row" key={n}>
              <span className="source-icon" style={{ background: "#f0f1ee", color: "#9aa59f" }}><Icon name="database" size={17} /></span>
              <div><strong>{n}</strong><span>Not connected yet</span></div>
              <span className="tag">Planned</span>
            </div>
          ))}
        </Card>
      </div>
    </>
  );
}
