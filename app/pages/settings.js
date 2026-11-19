import { useState } from "react";
import { useMeta } from "../components/Layout";
import { Button, Callout, Card, PageHeader, toast, useAsync } from "../components/ui";
import { api } from "../lib/api";
import { fmt } from "../lib/format";
import LoadDemoButton from "../components/LoadDemoButton";

export default function Settings() {
  const { meta, refresh } = useMeta();
  const info = useAsync(() => api.get("/api/admin/info"), []);
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  async function clear() {
    setBusy(true);
    try {
      const r = await api.post("/api/admin/clear", { confirm: "CLEAR" });
      setConfirm("");
      await refresh();
      toast(`All data cleared. Backup saved.`);
      console.log("backup:", r.backup);
    } catch (e) {
      toast(e.message, "bad");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader eyebrow="App" title="Settings" />
      <div className="grid cols-2">
        <Card title="Privacy & storage">
          <Callout tone="good" icon="lock">
            Greenhouse runs entirely on this computer. It makes no internet connections, and its local data service only accepts requests from this app (a new secret key is generated on every launch).
          </Callout>
          <dl className="kv" style={{ marginTop: 16 }}>
            <dt>Database file</dt><dd style={{ fontFamily: "Consolas, monospace", fontSize: 12 }}>{info.data?.dbPath || "…"}</dd>
            <dt>Backups</dt><dd>A copy is saved in a <code>backups</code> folder next to the database before every import, undo, or clear (last 10 kept).</dd>
            <dt>Encryption</dt><dd>The file relies on Windows device encryption (BitLocker). Confirm with IT that BitLocker is on for this laptop.</dd>
            <dt>Version</dt><dd>{info.data?.version || "…"}</dd>
          </dl>
        </Card>
        <Card title="Data" delay={0.05}>
          <dl className="kv">
            <dt>People</dt><dd>{fmt(meta?.people)}</dd>
            <dt>Event records</dt><dd>{fmt(meta?.events)}</dd>
            <dt>Roster rows</dt><dd>{fmt(meta?.roster_rows)}</dd>
            <dt>Imports</dt><dd>{fmt(meta?.imports)}{meta?.isDemo ? " (demo)" : ""}</dd>
          </dl>
          <div style={{ marginTop: 18, paddingTop: 16, borderTop: "1px solid var(--line)" }}>
            <strong>Demo data</strong>
            <p className="muted" style={{ margin: "4px 0 10px" }}>Six months of fictitious records that mirror the real PHS export. Replaces any existing demo data; refused if real data is loaded.</p>
            <LoadDemoButton variant="secondary" label={meta?.isDemo ? "Reload demo data" : "Load demo data"} />
          </div>
          <div style={{ marginTop: 18, paddingTop: 16, borderTop: "1px solid var(--line)" }}>
            <strong style={{ color: "var(--bad)" }}>Clear all data</strong>
            <p className="muted" style={{ margin: "4px 0 10px" }}>Removes every import, person and match decision. A backup is saved first. Type <code>CLEAR</code> to confirm.</p>
            <div style={{ display: "flex", gap: 10 }}>
              <input className="input" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="CLEAR" style={{ width: 140 }} />
              <Button variant="danger" icon="trash" busy={busy} disabled={confirm !== "CLEAR"} onClick={clear}>Clear all data</Button>
            </div>
          </div>
        </Card>
      </div>
    </>
  );
}
