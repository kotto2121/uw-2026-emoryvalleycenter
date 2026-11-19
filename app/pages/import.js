import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import Icon from "../components/Icon";
import { useMeta } from "../components/Layout";
import { Button, Callout, Card, PageHeader, toast, useAsync } from "../components/ui";
import { api } from "../lib/api";
import { fmt, monthLabel, relativeTime } from "../lib/format";

// Suggest an action for an unknown column header by fuzzy-matching against known fields.
// Tries normalized equality, token overlap, and character similarity; falls back to
// suggesting a new snake_case field derived from the header.
function slugify(s) {
  return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}
function tokens(s) {
  return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/).filter(Boolean);
}
function bigrams(s) {
  const t = ` ${s} `; const out = [];
  for (let i = 0; i < t.length - 1; i++) out.push(t.slice(i, i + 2));
  return out;
}
function similarity(a, b) {
  const A = bigrams(a), B = bigrams(b);
  if (!A.length || !B.length) return 0;
  let hits = 0;
  for (const g of A) { const i = B.indexOf(g); if (i !== -1) { hits++; B.splice(i, 1); } }
  return (2 * hits) / (A.length + B.length);
}
const SUGGEST_THRESHOLD = 0.45;
function suggestDecision(header, knownFields = []) {
  const h = String(header || "").trim();
  const hSq = h.toLowerCase().replace(/[^a-z0-9]/g, "");
  const hToks = new Set(tokens(h));
  let best = null, bestScore = 0;
  for (const f of knownFields) {
    if (!f) continue;
    let score = 0;
    if (f.toLowerCase() === h.toLowerCase() || f === hSq || f === slugify(h)) score = 1;
    else {
      const fToks = new Set(tokens(f.replace(/_/g, " ")));
      const overlap = [...hToks].filter((t) => fToks.has(t)).length;
      score = Math.max(overlap / Math.min(hToks.size, fToks.size) * 0.9, similarity(hSq, f.replace(/_/g, "")));
    }
    if (score > bestScore) { bestScore = score; best = f; }
  }
  if (best && bestScore >= SUGGEST_THRESHOLD) return { action: "map", field: best, remember: true };
  return { action: "new", field: slugify(h) || "custom_field", remember: true };
}

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

const SERVICE_LABEL = { OP: "Outpatient / Individual Therapy (OP)", PSR: "Psychosocial Rehab (PSR)" };

/** Count clients the same way the server will (api/lib/docx-tables.js tableEntries). */
function countClients(t) {
  let n = 0;
  t.rows.forEach((_, r) => {
    if (t.skipRow?.[r] && !t.nameCols.some((c) => t.nameLike?.[r]?.[c])) return;
    for (const c of t.nameCols) if (t.nameLike?.[r]?.[c]) n++;
  });
  return n;
}

function RosterPreview({ preview, file, onDone, onCancel }) {
  const [month, setMonth] = useState(preview.month || "");
  const [tables, setTables] = useState(preview.tables);
  const [busy, setBusy] = useState(false);
  const update = (i, patch) => setTables((ts) => ts.map((t, j) => (j === i ? { ...t, ...patch } : t)));
  const counts = tables.map(countClients);
  const included = tables.reduce((s, t, i) => s + (t.service ? counts[i] : 0), 0);
  const byService = { OP: 0, PSR: 0 };
  tables.forEach((t, i) => { if (t.service) byService[t.service] += counts[i]; });

  async function commit() {
    setBusy(true);
    try {
      const payload = tables.map(({ nameLike, skipRow, ...t }) => t);
      const r = await api.post("/api/import/roster/commit", { month, filename: file.name, tables: payload });
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
        We found {tables.length} caseload table{tables.length === 1 ? "" : "s"} in <strong>{file.name}</strong>. Service and staff come from the heading above each table; schedule rows (days/times, “Total:”) are skipped automatically. Fix anything that looks wrong before importing.
      </Callout>
      <div className="mapping">
        <label className="select"><span className="select-label">Report month</span>
          <input className="input" type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </label>
        <span className="muted" style={{ fontSize: 12.5 }}>{preview.month ? "Detected from the “Updated” date — change it if this roster is for a different month." : "No date found in the document — please choose the month."}</span>
      </div>
      {tables.map((t, i) => {
        const n = counts[i];
        const mismatch = t.expectedTotal !== null && t.expectedTotal !== undefined && t.expectedTotal !== n;
        return (
          <div key={i} style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--line)", opacity: t.service ? 1 : 0.72 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
              <div style={{ minWidth: 0 }}>
                <strong>{t.heading || `Table ${i + 1}`}</strong>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6, alignItems: "center" }}>
                  <span className="tag">{fmt(n)} client{n === 1 ? "" : "s"} found</span>
                  {t.expectedTotal !== null && t.expectedTotal !== undefined && (
                    mismatch
                      ? <span className="tag warn"><Icon name="alert" size={11} /> heading says {t.expectedTotal}</span>
                      : <span className="tag good"><Icon name="check" size={11} /> matches heading total</span>
                  )}
                  {(t.staff || t.columnStaff?.some(Boolean)) && <span className="tag info">Staff: {[t.staff, ...(t.columnStaff || [])].filter(Boolean).filter((v, k, a) => a.indexOf(v) === k).join(", ")}</span>}
                  {t.isAdditional && !t.service && <span className="tag warn">Service not stated — ask before including</span>}
                </div>
              </div>
              <label className="select"><span className="select-label">Service</span>
                <select value={t.service || ""} onChange={(e) => update(i, { service: e.target.value || null })}>
                  <option value="">Don’t import this table</option>
                  <option value="OP">{SERVICE_LABEL.OP}</option>
                  <option value="PSR">{SERVICE_LABEL.PSR}</option>
                </select>
                <Icon name="chevronDown" size={14} />
              </label>
            </div>
            <div className="mapping">
              <span className="select-label">Name column{t.header.length > 1 ? "s" : ""}:</span>
              <div className="chips">
                {t.header.map((h, c) => (
                  <button key={c} className={`chip${t.nameCols.includes(c) ? " on" : ""}`}
                    onClick={() => update(i, { nameCols: t.nameCols.includes(c) ? t.nameCols.filter((x) => x !== c) : [...t.nameCols, c].sort() })}>
                    {h || `Column ${c + 1}`}
                  </button>
                ))}
              </div>
            </div>
            <div className="table-preview">
              <table className="tbl">
                <thead><tr>{t.header.map((h, c) => <th key={c} className={t.nameCols.includes(c) ? "namecol" : ""}>{h}</th>)}</tr></thead>
                <tbody>
                  {t.rows.slice(0, 5).map((r, ri) => (
                    <tr key={ri} style={t.skipRow?.[ri] ? { opacity: 0.45, textDecoration: "line-through" } : undefined} title={t.skipRow?.[ri] ? "Skipped: schedule / summary / blank row" : undefined}>
                      {t.header.map((_, c) => <td key={c} className={t.nameCols.includes(c) ? "namecol" : ""}>{r[c]}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {t.rowCount > 5 && <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>+ {t.rowCount - 5} more rows</div>}
          </div>
        );
      })}
      <div style={{ display: "flex", gap: 10, justifyContent: "space-between", alignItems: "center", marginTop: 18, flexWrap: "wrap" }}>
        <span className="muted" style={{ fontSize: 12.5 }}>{fmt(byService.PSR)} PSR and {fmt(byService.OP)} OP entries (people on several caseloads are counted once per service after import).</span>
        <div style={{ display: "flex", gap: 10 }}>
          <Button onClick={onCancel}>Cancel</Button>
          <Button variant="primary" icon="check" busy={busy} disabled={!/^\d{4}-\d{2}$/.test(month) || !included} onClick={commit}>
            Import {fmt(included)} entries{month ? ` for ${monthLabel(month)}` : ""}
          </Button>
        </div>
      </div>
    </motion.div>
  );
}

function IncidentReview({ analysis, file, onReanalyze, onDone, onCancel }) {
  // Three states driven by the analyze result:
  //   'full'    -> confirm screen, all columns recognized
  //   'partial' -> unknown-columns mapping UI (+ blocking required fields)
  //   'none'    -> preview grid; user clicks the header row, re-analyze
  //                turns this same panel into the 'partial' mapping state
  const oriented = analysis.confidence === "none" && !analysis.headerRow;
  const [pickedRow, setPickedRow] = useState(null); // 1-based row user chose
  const [orienting, setOrienting] = useState(false);
  // decisions: header -> { action: 'map'|'new'|'ignore', field, remember }
  const [decisions, setDecisions] = useState(() =>
    Object.fromEntries((analysis.unknownHeaders || []).map((u) => [u.header, suggestDecision(u.header, analysis.knownFields)]))
  );
  // Keep decisions in sync when a header-row re-analysis produces new unknownHeaders.
  useEffect(() => {
    setDecisions((d) => {
      const missing = (analysis.unknownHeaders || []).filter((u) => !d[u.header]);
      if (!missing.length) return d;
      return { ...d, ...Object.fromEntries(missing.map((u) => [u.header, suggestDecision(u.header, analysis.knownFields)])) };
    });
  }, [analysis]);
  const [busy, setBusy] = useState(false);
  const set = (header, patch) => setDecisions((d) => ({ ...d, [header]: { ...d[header], ...patch } }));

  async function orient(rowNum) {
    setOrienting(true);
    try {
      // Re-upload the same file; the parser maps the picked row as the header.
      const reanalysis = await api.upload(`/api/imports/analyze?headerRow=${rowNum}`, file);
      onReanalyze(reanalysis);
    } catch (e) {
      toast(e.message, "bad");
      setOrienting(false);
    }
  }

  async function commit() {
    setBusy(true);
    try {
      const payload = (analysis.unknownHeaders || []).map((u) => ({ header: u.header, ...decisions[u.header] }));
      const r = await api.post(`/api/imports/${analysis.uploadId}/commit`, { decisions: payload, headerRow: analysis.headerRow });
      onDone(r);
    } catch (e) {
      toast(e.message, "bad");
    } finally {
      setBusy(false);
    }
  }

  function decisionsFor(field) {
    return (analysis.unknownHeaders || []).filter((u) => decisions[u.header]?.action === "map" && decisions[u.header]?.field === field);
  }

  // ---- state: none — orientation grid ----
  if (oriented) {
    const preview = analysis.preview || [];
    return (
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} style={{ marginTop: 14 }}>
        <Callout tone="warn" icon="sparkle" title="We don't recognize this layout yet.">
          This file doesn&rsquo;t match the usual PHS column names. Click the row that contains the column headers below — once you do, you can tell us what each column means and it will be remembered for future files.
        </Callout>
        <div className="table-wrap" style={{ marginTop: 12, border: "1px solid var(--line)", borderRadius: 8, maxHeight: 420, overflow: "auto" }}>
          <table className="tbl">
            <thead><tr><th style={{ width: 46 }}>Header?</th><th>#</th>{(preview[0] || []).map((_, i) => <th key={i}>{String.fromCharCode(65 + i)}</th>)}</tr></thead>
            <tbody>
              {preview.map((cells, ri) => (
                <tr key={ri} onClick={() => setPickedRow(ri + 1)}
                  style={{ cursor: "pointer", background: pickedRow === ri + 1 ? "rgba(59,130,246,.12)" : undefined }}>
                  <td><input type="radio" checked={pickedRow === ri + 1} onChange={() => setPickedRow(ri + 1)} /></td>
                  <td className="muted">{ri + 1}</td>
                  {cells.map((c, ci) => <td key={ci} className="clip">{c === "" ? <span className="muted">—</span> : String(c)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 18 }}>
          <Button onClick={onCancel}>Cancel</Button>
          <Button variant="primary" icon="check" busy={orienting} disabled={!pickedRow} onClick={() => orient(pickedRow)}>
            Use row {pickedRow || "…"} as the header
          </Button>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} style={{ marginTop: 14 }}>
      <Callout tone="warn" icon="sparkle" title="New columns found in this file.">
        We found {analysis.unknownHeaders.length} column{analysis.unknownHeaders.length === 1 ? "" : "s"} in <strong>{file.name}</strong> that aren&rsquo;t part of the usual PHS layout. Choose what to do with each before importing.
      </Callout>
      {analysis.unknownHeaders.map((u) => {
        // Guard: after a header-row re-analysis, decisions may not have an entry for a new header yet.
        const d = decisions[u.header] || { action: "ignore", field: "", remember: true };
        return (
          <div key={u.header} style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--line)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
              <strong>“{u.header}”</strong>
              <div className="mapping" style={{ marginTop: 0 }}>
                <label className="select"><span className="select-label">Action</span>
                  <select value={d.action} onChange={(e) => set(u.header, { action: e.target.value })}>
                    <option value="ignore">Ignore this column</option>
                    <option value="map">It&rsquo;s one of the known fields</option>
                    <option value="new">Keep as a new field</option>
                  </select>
                  <Icon name="chevronDown" size={14} />
                </label>
                {d.action === "map" && (
                  <label className="select"><span className="select-label">Field</span>
                    <select value={d.field} onChange={(e) => set(u.header, { field: e.target.value })}>
                      <option value="">Choose a field…</option>
                      {analysis.knownFields.map((f) => <option key={f} value={f}>{f}</option>)}
                    </select>
                    <Icon name="chevronDown" size={14} />
                  </label>
                )}
                {d.action === "new" && (
                  <label className="select"><span className="select-label">Field name</span>
                    <input className="input" placeholder="e.g. transport_notes" value={d.field}
                      onChange={(e) => set(u.header, { field: e.target.value })} />
                  </label>
                )}
              </div>
            </div>
            <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
              Sample values: {u.samples.length ? u.samples.map((s) => `“${String(s)}”`).join(", ") : "(all blank in the first rows)"}
            </div>
            <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13, marginTop: 6 }}>
              <input type="checkbox" checked={d.remember} onChange={(e) => set(u.header, { remember: e.target.checked })} />
              Remember this choice for future PHS files
            </label>
          </div>
        );
      })}
      {analysis.missingRequired?.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <Callout tone="warn">
            {analysis.missingRequired.map((f) => {
              const mapped = decisionsFor(f).length > 0;
              return <span key={f} style={{ marginRight: 12 }}>{mapped ? "✓" : "•"} <strong>{f}</strong> is required — {mapped ? "mapped below." : "map one of the unknown columns to it, or the import can’t run."}</span>;
            })}
          </Callout>
        </div>
      )}
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 18 }}>
        <Button onClick={onCancel}>Cancel</Button>
        <Button variant="primary" icon="check" busy={busy}
          disabled={analysis.missingRequired?.some((f) => decisionsFor(f).length === 0) || (analysis.unknownHeaders || []).some((u) => {
            const d = decisions[u.header] || { action: "ignore", field: "" };
            return d.action !== "ignore" && !d.field;
          })}
          onClick={commit}>
          Import {fmt(analysis.rowsRead)} event rows
        </Button>
      </div>
    </motion.div>
  );
}

export default function ImportCenter() {
  const { meta, refresh } = useMeta();
  const [incBusy, setIncBusy] = useState(false);
  const [incResult, setIncResult] = useState(null);
  const [incReview, setIncReview] = useState(null); // { analysis, file } when unknown columns need review
  const [rosBusy, setRosBusy] = useState(false);
  const [preview, setPreview] = useState(null);
  const [rosResult, setRosResult] = useState(null);
  const history = useAsync(() => api.get("/api/imports"), [meta?.last_import, meta?.imports]);

  async function importIncidents(file) {
    if (!/\.xlsx$/i.test(file.name)) return toast("Please choose an .xlsx file (Excel workbook).", "bad");
    setIncBusy(true);
    setIncResult(null);
    setIncReview(null);
    try {
      const analysis = await api.upload("/api/imports/analyze", file);
      if (analysis.unknownHeaders?.length || analysis.confidence !== "full") {
        setIncReview({ analysis, file });
        return;
      }
      const r = await api.post(`/api/imports/${analysis.uploadId}/commit`, { decisions: [] });
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
          {incReview && <IncidentReview analysis={incReview.analysis} file={incReview.file}
            onCancel={() => setIncReview(null)}
            onReanalyze={(reanalysis) => setIncReview({ analysis: reanalysis, file: incReview.file })}
            onDone={async (r) => { setIncReview(null); setIncResult(r); await refresh(); toast(`Imported ${fmt(r.inserted)} event records.`); }} />}
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
