import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { useRef, useState } from "react";
import Icon from "../components/Icon";
import { useMeta } from "../components/Layout";
import { Button, Callout, Card, PageHeader, toast, useAsync } from "../components/ui";
import { api } from "../lib/api";
import { fmt, monthLabel, relativeTime } from "../lib/format";

function Dropzone({ accept, title, hint, icon, onFile, busy }) {
  const input = useRef(null);
  const [over, setOver] = useState(false);
  return (
    <div
      className={`dropzone${over ? " over" : ""}`}
      onClick={() => !busy && input.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files?.[0]; if (f && !busy) onFile(f); }}
      role="button" tabIndex={0}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && input.current?.click()}
    >
      <input ref={input} type="file" accept={accept} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) onFile(f); }} />
      <span className="dz-icon">{busy ? <span className="spinner" style={{ width: 22, height: 22 }} /> : <Icon name={icon} size={24} />}</span>
      <div className="dz-text">
        <strong>{title}</strong>
        <span>{hint}</span>
      </div>
    </div>
  );
}

function IncidentResult({ r }) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} style={{ marginTop: 14 }}>
      <Callout tone={r.inserted ? "good" : "info"} icon={r.inserted ? "check" : "info"}>
        {r.inserted ? <>Imported <strong>{fmt(r.inserted)}</strong> new event records{r.months?.length ? ` for ${r.months.map((m) => monthLabel(m)).join(", ")}` : ""}.</> : <>Nothing new — every row in this file was already imported.</>}
      </Callout>
      <div className="result-grid">
        <div><strong>{fmt(r.rowsRead)}</strong><span>rows read</span></div>
        <div><strong>{fmt(r.alreadyImported)}</strong><span>already imported (skipped)</span></div>
        <div><strong>{fmt(r.exactDuplicatesInFile)}</strong><span>exact duplicate rows (flagged)</span></div>
        <div><strong>{fmt(r.people.created)}</strong><span>new people · {fmt(r.people.reviews)} to review</span></div>
      </div>
      {r.warnings?.length > 0 && <div style={{ marginTop: 10 }}><Callout tone="warn">{r.warnings.join(" ")}</Callout></div>}
      {r.people.reviews > 0 && <div style={{ marginTop: 10 }}><Link href="/review" className="btn sm primary"><Icon name="merge" size={14} /> Review {r.people.reviews} possible matches</Link></div>}
    </motion.div>
  );
}

function RosterPreview({ preview, file, onDone, onCancel }) {
  const [month, setMonth] = useState(preview.month || "");
  const [tables, setTables] = useState(preview.tables);
  const [busy, setBusy] = useState(false);
  const update = (i, patch) => setTables((ts) => ts.map((t, j) => (j === i ? { ...t, ...patch } : t)));
  const counted = tables.filter((t) => t.service || t.serviceCol >= 0).reduce((s, t) => s + t.rowCount, 0);

  async function commit() {
    setBusy(true);
    try {
      const r = await api.post("/api/import/roster/commit", { month, filename: file.name, tables });
      onDone(r);
    } catch (e) {
      toast(e.message, "bad");
    } finally {
      setBusy(false);
    }
  }

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} style={{ marginTop: 14 }}>
      <Callout tone="info" icon="sparkle" title="Check how we read this document.">
        We found {tables.length} table{tables.length === 1 ? "" : "s"} in <strong>{file.name}</strong>. Confirm the month, which service each table lists, and which column holds the person&rsquo;s name.
      </Callout>
      <div className="mapping">
        <label className="select"><span className="select-label">Report month</span>
          <input className="input" type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </label>
      </div>
      {tables.map((t, i) => (
        <div key={i} style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--line)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            <div>
              <strong>Table {i + 1}</strong> <span className="muted">· {t.rowCount} rows</span>
              {t.context && <div className="muted" style={{ fontSize: 12 }}>Heading: “{t.context.split(" · ").pop()}”</div>}
            </div>
            <div className="mapping" style={{ marginTop: 0 }}>
              <label className="select"><span className="select-label">Service</span>
                <select value={t.service || (t.serviceCol >= 0 ? "col" : "")} onChange={(e) => {
                  const v = e.target.value;
                  const detected = preview.tables[i].serviceCol;
                  update(i, v === "col" ? { service: null, serviceCol: detected } : { service: v || null, serviceCol: -1 });
                }}>
                  <option value="">Ignore this table</option>
                  <option value="OP">Outpatient (OP)</option>
                  <option value="PSR">Psychosocial Rehab (PSR)</option>
                  {preview.tables[i].serviceCol >= 0 && <option value="col">Per row (column “{t.header[preview.tables[i].serviceCol]}”)</option>}
                </select>
                <Icon name="chevronDown" size={14} />
              </label>
              <label className="select"><span className="select-label">Name column</span>
                <select value={t.nameCol} onChange={(e) => update(i, { nameCol: Number(e.target.value) })}>
                  {t.header.map((h, c) => <option key={c} value={c}>{h || `Column ${c + 1}`}</option>)}
                </select>
                <Icon name="chevronDown" size={14} />
              </label>
            </div>
          </div>
          <div className="table-preview">
            <table className="tbl">
              <thead><tr>{t.header.map((h, c) => <th key={c} className={c === t.nameCol ? "namecol" : ""}>{h}</th>)}</tr></thead>
              <tbody>
                {t.rows.slice(0, 4).map((r, ri) => <tr key={ri}>{t.header.map((_, c) => <td key={c} className={c === t.nameCol ? "namecol" : ""}>{r[c]}</td>)}</tr>)}
              </tbody>
            </table>
          </div>
          {t.rowCount > 4 && <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>+ {t.rowCount - 4} more rows</div>}
        </div>
      ))}
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 18 }}>
        <Button onClick={onCancel}>Cancel</Button>
        <Button variant="primary" icon="check" busy={busy} disabled={!/^\d{4}-\d{2}$/.test(month) || !counted} onClick={commit}>
          Import {fmt(counted)} roster rows{month ? ` for ${monthLabel(month)}` : ""}
        </Button>
      </div>
    </motion.div>
  );
}

export default function ImportCenter() {
  const { meta, refresh } = useMeta();
  const [incBusy, setIncBusy] = useState(false);
  const [incResult, setIncResult] = useState(null);
  const [rosBusy, setRosBusy] = useState(false);
  const [preview, setPreview] = useState(null);
  const [rosResult, setRosResult] = useState(null);
  const history = useAsync(() => api.get("/api/imports"), [meta?.last_import, meta?.imports]);

  async function importIncidents(file) {
    if (!/\.xlsx$/i.test(file.name)) return toast("Please choose an .xlsx file (Excel workbook).", "bad");
    setIncBusy(true);
    setIncResult(null);
    try {
      const r = await api.upload("/api/import/incidents", file);
      setIncResult(r);
      await refresh();
      toast(`Imported ${fmt(r.inserted)} event records.`);
    } catch (e) {
      toast(e.message, "bad");
    } finally {
      setIncBusy(false);
    }
  }

  async function previewRoster(file) {
    if (!/\.docx$/i.test(file.name)) return toast("Please choose a .docx Word document. (Old .doc files: open in Word and Save As .docx.)", "bad");
    setRosBusy(true);
    setPreview(null);
    setRosResult(null);
    try {
      setPreview({ ...(await api.upload("/api/import/roster/preview", file)), file });
    } catch (e) {
      toast(e.message, "bad");
    } finally {
      setRosBusy(false);
    }
  }

  async function undo(b) {
    if (!window.confirm(`Remove everything imported from “${b.filename}”? A backup is saved first.`)) return;
    try {
      const r = await api.del(`/api/imports/${b.id}`);
      toast(`Removed ${fmt(r.eventsRemoved + r.rosterRowsRemoved)} rows.`);
      await refresh();
    } catch (e) {
      toast(e.message, "bad");
    }
  }

  return (
    <>
      <PageHeader eyebrow="Data" title="Import Center"
        subtitle="Drop in this month’s files. Re-importing a file is safe — rows that were already imported are skipped, and every import can be undone." />

      <div className="grid cols-2">
        <Card title="PHS event report" subtitle="“New Reportable Event Report” exported from Practical Health Systems (.xlsx)">
          <Dropzone accept=".xlsx" icon="database" title="Drop the Excel export here" hint="or click to browse · .xlsx" busy={incBusy} onFile={importIncidents} />
          <AnimatePresence>{incResult && <IncidentResult r={incResult} />}</AnimatePresence>
        </Card>
        <Card title="Behavioral health roster" subtitle="The monthly Word document listing OP and PSR clients (.docx)" delay={0.05}>
          <Dropzone accept=".docx" icon="file" title="Drop the Word document here" hint="or click to browse · .docx" busy={rosBusy} onFile={previewRoster} />
          {preview && <RosterPreview preview={preview} file={preview.file} onCancel={() => setPreview(null)}
            onDone={async (r) => { setPreview(null); setRosResult(r); await refresh(); toast(`Imported ${fmt(r.inserted)} roster rows.`); }} />}
          {rosResult && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} style={{ marginTop: 14 }}>
              <Callout tone="good" icon="check">Imported {fmt(rosResult.byService.OP)} OP and {fmt(rosResult.byService.PSR)} PSR clients for {monthLabel(rosResult.month)}.</Callout>
              <div className="result-grid">
                <div><strong>{fmt(rosResult.rowsRead)}</strong><span>rows read</span></div>
                <div><strong>{fmt(rosResult.people.exact + rosResult.people.normalized)}</strong><span>matched to known people</span></div>
                <div><strong>{fmt(rosResult.people.created)}</strong><span>new people</span></div>
                <div><strong>{fmt(rosResult.people.reviews)}</strong><span>possible matches to review</span></div>
              </div>
            </motion.div>
          )}
        </Card>
      </div>

      <Card className="flush" title="Import history" subtitle="Newest first" delay={0.1}>
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>File</th><th>Type</th><th>Month(s)</th><th className="num">Rows</th><th className="num">New</th><th>People</th><th>When</th><th /></tr></thead>
            <tbody>
              {(history.data?.imports || []).map((b) => (
                <tr key={b.id}>
                  <td className="clip">{b.filename}{b.is_demo ? <span className="tag warn" style={{ marginLeft: 6 }}>Demo</span> : null}</td>
                  <td>{b.kind === "bh_docx" ? "BH roster" : "Event report"}</td>
                  <td>{b.report_month ? monthLabel(b.report_month) : (b.summary?.months || []).map((m) => monthLabel(m, (b.summary?.months || []).length > 1 ? "short" : "long")).join(", ") || "—"}</td>
                  <td className="num">{fmt(b.rows_read)}</td>
                  <td className="num">{fmt(b.rows_inserted)}</td>
                  <td className="muted">{b.summary?.people ? `${fmt(b.summary.people.created)} new · ${fmt(b.summary.people.reviews)} review` : "—"}</td>
                  <td className="muted">{relativeTime(b.imported_at)}</td>
                  <td className="num"><Button size="sm" variant="ghost" icon="undo" onClick={() => undo(b)}>Undo</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
          {history.data && !history.data.imports.length && <p className="muted" style={{ padding: "8px 20px 20px" }}>No imports yet.</p>}
        </div>
      </Card>
    </>
  );
}
