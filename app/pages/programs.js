import Link from "next/link";
import { useRouter } from "next/router";
import Icon from "../components/Icon";
import { Card, PageHeader } from "../components/ui";
import { PROGRAMS, programBySlug } from "../lib/programs";

export default function Program() {
  const router = useRouter();
  const p = programBySlug(router.query.p);

  if (!p) {
    return (
      <>
        <PageHeader eyebrow="Roadmap" title="All programs" subtitle="Every program from EVC’s Data Metric Goals. Live dashboards are ready today; planned ones show what data each will need." />
        <div className="programs">
          {PROGRAMS.map((x) => (
            <Link key={x.slug} href={x.href || `/programs?p=${x.slug}`} className={`program-tile ${x.status}`}>
              <div className="pt-head">
                <span className="pt-icon"><Icon name={x.icon} size={17} /></span>
                {x.status === "live" ? <span className="tag good">Live</span> : <span className="tag">Planned</span>}
              </div>
              <strong>{x.name}</strong>
              <small>{x.metrics.length} metrics</small>
            </Link>
          ))}
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow={<><Icon name="sparkle" size={12} style={{ verticalAlign: -1 }} /> On the roadmap</>}
        title={p.name}
        subtitle="This dashboard isn’t connected yet. Here is what it will track and what data it needs, taken from EVC’s Data Metric Goals."
      />
      <div className="grid cols-2-1">
        <Card title="Metrics this dashboard will show" subtitle={`${p.metrics.length} metrics`}>
          <div className="metric-list">
            {p.metrics.map((m) => (
              <div key={m} className="metric-item"><Icon name="activity" size={15} />{m}</div>
            ))}
          </div>
        </Card>
        <Card title="Getting it live" delay={0.05}>
          <ol className="steps">
            <li><strong>Source:</strong> {p.source}</li>
            <li>Collect one recent example file and agree which columns matter.</li>
            <li>Add an importer that matches people through the same registry used by Behavioral Health.</li>
            <li>Build the dashboard and monthly report, then retire the manual spreadsheet step.</li>
          </ol>
          {p.restricted && (
            <div className="callout warn" style={{ marginTop: 8 }}>
              <Icon name="lock" size={16} />
              <div>Contains pay / HR data. This view should only be enabled for authorized HR staff.</div>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
