import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import Icon from "../components/Icon";
import { useMeta } from "../components/Layout";
import { Button, Card, Empty, MonthSelect, PageHeader, Skeleton, toast, useAsync } from "../components/ui";
import { api, qs } from "../lib/api";
import { fmt, monthLabel, sameName } from "../lib/format";

const SERVICES = [
  { key: "OP", name: "Outpatient Therapy (OP)" },
  { key: "PSR", name: "Psychosocial Rehabilitation (PSR)" },
];

function RosterReport({ month, service }) {
  const { data, loading } = useAsync(() => api.get(`/api/reports/bh-roster${qs({ month, service: service.key })}`), [month, service.key]);
  const [busy, setBusy] = useState(false);
  const rows = data?.rows || [];
  const extraCols = [...new Set(rows.flatMap((r) => Object.keys(r.extra)))].filter((c) => !/name|^section$/i.test(c)).slice(0, 4);
  return (
    <Card className="flush report" title={service.name} subtitle={data ? `${fmt(rows.length)} people · ${fmt(rows.filter((r) => r.isNew).length)} new vs. last month · ${monthLabel(month)}` : " "}
      actions={<Button size="sm" icon="download" busy={busy} className="no-print" onClick={async () => {
        setBusy(true);
        try { await api.download(`/api/reports/bh-roster.xlsx${qs({ month, service: service.key })}`); toast("Report saved"); } catch (e) { toast(e.message, "bad"); } finally { setBusy(false); }
      }}>Excel</Button>}>
      {loading && !data ? <div style={{ padding: 20 }}><Skeleton h={200} /></div> : (
        <div className="table-wrap" style={{ maxHeight: 560 }}>
          <table className="tbl">
            <thead><tr><th>#</th><th>Name</th>{extraCols.map((c) => <th key={c}>{c}</th>)}<th>Also in</th><th className="num">Incidents</th></tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.raw_name}>
                  <td className="muted">{i + 1}</td>
                  <td>
                    {r.display_name || r.raw_name} {r.isNew && <span className="tag good">New</span>}
                    {!sameName(r.display_name, r.raw_name) && <div className="muted" style={{ fontSize: 11.5 }}>as “{r.raw_name}”</div>}
                  </td>
                  {extraCols.map((c) => <td key={c}>{r.extra[c]}</td>)}
                  <td>{r.alsoIn.map((s) => <span key={s} className="tag brand">{s}</span>)}</td>
                  <td className="num">{r.events ? <span className="tag warn">{r.events}</span> : <span className="muted">0</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length && <p className="muted" style={{ padding: "6px 20px 20px" }}>No {service.key} roster imported for this month.</p>}
        </div>
      )}
    </Card>
  );
}

function IncidentWorkbookCard({ meta }) {
  const months = meta.months.events;
  const partial = meta.partialMonths || {};
  const complete = months.filter((m) => !partial[m]);
  const [from, setFrom] = useState(complete[0] || months[0] || null);
  const [to, setTo] = useState(complete[complete.length - 1] || months[months.length - 1] || null);
  const [busy, setBusy] = useState(false);
  if (!months.length) return null;
  return (
    <Card title="Incident report workbook" subtitle="Rebuilds the manual Excel report tabs from the PHS event export — no Word document needed"
      actions={<Button variant="primary" icon="download" busy={busy} className="no-print" onClick={async () => {
        setBusy(true);
        try { await api.download(`/api/reports/incidents.xlsx${qs({ from, to })}`); toast("Incident workbook saved"); } catch (e) { toast(e.message, "bad"); } finally { setBusy(false); }
      }}>Download (Excel)</Button>}>
      <div className="mapping" style={{ marginTop: 0 }}>
        <MonthSelect label="From" months={months} value={from} onChange={setFrom} />
        <MonthSelect label="To" months={months} value={to} onChange={setTo} />
        {to && partial[to] && <span className="tag warn"><Icon name="alert" size={11} /> {monthLabel(to)} looks incomplete</span>}
      </div>
      <p className="muted" style={{ margin: "12px 0 0", fontSize: 12.5 }}>
        Sheets: Summary · Month · Site · Individual · Tier 1 · Tier 2 · Behavior · Medical · Other · Reportable · Discovery · Location · Requirements (interventions) · Injury.
        Every PHS option is listed (zeros included); blanks appear as &ldquo;No Data Reported&rdquo;; exact duplicate rows are excluded.
      </p>
    </Card>
  );
}

export default function Reports() {
  const router = useRouter();
  const { meta } = useMeta();
  const [month, setMonth] = useState(null);
  const [busy, setBusy] = useState(false);
  const months = meta?.months.roster || [];
  useEffect(() => {
    if (!router.isReady || !meta) return;
    setMonth((m) => m || (months.includes(router.query.month) ? router.query.month : months[months.length - 1]) || null);
  }, [router.isReady, router.query.month, meta, months]);

  if (!meta) return <Skeleton h={400} />;
  if (!months.length) {
    return (
      <>
        <PageHeader eyebrow="Reports" title="Monthly reports" subtitle="Excel reports built from the imported files." />
        <IncidentWorkbookCard meta={meta} />
        <Card><Empty icon="file" title="No behavioral health roster imported yet" actions={<Button variant="primary" icon="upload" onClick={() => router.push("/import")}>Import a BH roster</Button>}>
          The OP and PSR reports are built from the monthly behavioral health roster (Word document).
        </Empty></Card>
      </>
    );
  }
  return (
    <>
      <PageHeader eyebrow="Reports" title="Behavioral health monthly reports"
        subtitle="The two reports previously built by hand from the emailed Word document: one for outpatient therapy and one for psychosocial rehabilitation. Each is ready to download as Excel or print."
        actions={<>
          <MonthSelect months={months} value={month} onChange={setMonth} />
          <Button icon="printer" className="no-print" onClick={() => window.print()}>Print</Button>
          <Button variant="primary" icon="download" busy={busy} className="no-print" onClick={async () => {
            setBusy(true);
            try { await api.download(`/api/reports/bh-roster.xlsx${qs({ month })}`); toast("Workbook saved"); } catch (e) { toast(e.message, "bad"); } finally { setBusy(false); }
          }}>Both reports (Excel)</Button>
        </>} />
      <div className="no-print"><IncidentWorkbookCard meta={meta} /></div>
      <div className="print-only" style={{ marginBottom: 12 }}><strong>Emory Valley Center — Behavioral Health Roster, {monthLabel(month)}</strong></div>
      {month && (
        <div className="grid">
          {SERVICES.map((s) => <RosterReport key={s.key} month={month} service={s} />)}
        </div>
      )}
      <p className="muted no-print" style={{ fontSize: 12.5 }}>
        <Icon name="info" size={13} style={{ verticalAlign: -2 }} /> &ldquo;Incidents&rdquo; counts event records for that person in the same month, linked through the person registry. &ldquo;New&rdquo; means not on that service&rsquo;s roster the previous month.
      </p>
    </>
  );
}
