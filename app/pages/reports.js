import { useRouter } from "next/router";
import { useState } from "react";
import Icon from "../components/Icon";
import { useMeta } from "../components/Layout";
import { Button, Card, Empty, MonthSelect, PageHeader, Skeleton, toast } from "../components/ui";
import { api, qs } from "../lib/api";
import { monthLabel } from "../lib/format";

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
  if (!meta) return <Skeleton h={400} />;
  return (
    <>
      <PageHeader eyebrow="Reports" title="Monthly reports" subtitle="Excel reports built from the imported files." />
      {meta.months.events.length ? <IncidentWorkbookCard meta={meta} /> : (
        <Card><Empty icon="file" title="No event report imported yet" actions={<Button variant="primary" icon="upload" onClick={() => router.push("/import")}>Import events</Button>}>
          The incident report workbook is built from the PHS event report (Excel).
        </Empty></Card>
      )}
    </>
  );
}
