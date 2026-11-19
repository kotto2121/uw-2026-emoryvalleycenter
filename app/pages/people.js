import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import Drawer from "../components/Drawer";
import Icon from "../components/Icon";
import { useMeta } from "../components/Layout";
import { Button, Callout, Card, Empty, PageHeader, toast, useAsync } from "../components/ui";
import { api, qs } from "../lib/api";
import { dateLabel, fmt, monthLabel } from "../lib/format";

function PersonDrawer({ id, onClose, onChanged }) {
  const { data, reload } = useAsync(() => (id ? api.get(`/api/people/${id}`) : Promise.resolve(null)), [id]);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  useEffect(() => { if (data) setName(data.person.display_name); setEditing(false); }, [data]);
  async function save() {
    try {
      await api.patch(`/api/people/${id}`, { display_name: name });
      toast("Name updated");
      setEditing(false);
      reload();
      onChanged();
    } catch (e) { toast(e.message, "bad"); }
  }
  const months = data ? [...new Set(data.enrollments.map((e) => e.report_month))] : [];
  return (
    <Drawer open={!!id} onClose={onClose}
      title={editing ? <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus style={{ fontSize: 18, width: 300 }} /> : data?.person.display_name || "…"}
      subtitle={data ? `Person #${data.person.id}${data.person.is_demo ? " · demo" : ""}` : ""}
      actions={data && (editing ? <Button size="sm" variant="primary" icon="check" onClick={save}>Save</Button> : <Button size="sm" onClick={() => setEditing(true)}>Rename</Button>)}>
      {data && (
        <>
          <div className="drawer-section">
            <h3>Names seen in source files</h3>
            <div className="tags">{data.aliases.map((a) => <span key={a.raw_name} className={`tag${a.how === "merged" ? " info" : ""}`} title={`${a.source} · ${a.how}`}>{a.raw_name}</span>)}</div>
          </div>
          <div className="drawer-section">
            <h3>Behavioral health services</h3>
            {months.length ? (
              <table className="tbl"><tbody>
                {months.slice(0, 12).map((m) => (
                  <tr key={m}><td>{monthLabel(m)}</td><td><div className="tags">{data.enrollments.filter((e) => e.report_month === m).map((e) => <span key={e.service} className="tag brand">{e.service}</span>)}</div></td></tr>
                ))}
              </tbody></table>
            ) : <p className="muted">Not on a BH roster.</p>}
          </div>
          <div className="drawer-section">
            <h3>Event records ({fmt(data.events.length)})</h3>
            {data.events.length ? (
              <table className="tbl"><tbody>
                {data.events.slice(0, 60).map((e) => (
                  <tr key={e.id}>
                    <td style={{ whiteSpace: "nowrap" }}>{dateLabel(e.event_date)}</td>
                    <td>{e.site_home}<div className="muted" style={{ fontSize: 12 }}>{e.event_interventions || e.other_event_types || e.event_location || ""}</div></td>
                    <td>{e.reportability_status === "Reportable" ? <span className="tag bad">Reportable</span> : null}{e.is_exact_duplicate ? <span className="tag warn">Dup</span> : null}</td>
                  </tr>
                ))}
              </tbody></table>
            ) : <p className="muted">No event records.</p>}
          </div>
        </>
      )}
    </Drawer>
  );
}

export default function People() {
  const router = useRouter();
  const { meta, refresh } = useMeta();
  const [q, setQ] = useState("");
  const [dq, setDq] = useState("");
  useEffect(() => { const t = setTimeout(() => setDq(q), 200); return () => clearTimeout(t); }, [q]);
  const { data, reload } = useAsync(() => api.get(`/api/people${qs({ q: dq })}`), [dq, meta?.last_import, meta?.pending_reviews]);
  const openId = router.query.id ? Number(router.query.id) : null;
  const open = (id) => router.replace({ pathname: "/people", query: id ? { id } : {} }, undefined, { shallow: true });

  return (
    <>
      <PageHeader eyebrow="Data" title="People"
        subtitle="The app’s own registry of people supported. Each person gets a stable internal ID, and every spelling of their name seen in a source file is remembered." />
      {meta && !meta.hasData ? <Card><Empty icon="users" title="No people yet">People are added automatically when you import files.</Empty></Card> : (
        <Card className="flush" title={`${fmt(data?.people.length ?? 0)} people`} subtitle="Click a person to see their records"
          actions={<label className="search"><Icon name="search" size={15} /><input className="input" placeholder="Search any spelling…" value={q} onChange={(e) => setQ(e.target.value)} /></label>}>
          <div style={{ padding: "0 20px 12px" }}>
            <Callout tone="warn" icon="lock">This screen shows names. Use it only on a secured computer and don’t screen-share it outside authorized staff.</Callout>
          </div>
          <div className="table-wrap" style={{ maxHeight: "calc(100vh - 330px)" }}>
            <table className="tbl">
              <thead><tr><th>Name</th><th className="num">Spellings</th><th className="num">Events</th><th>Last event</th><th>BH services (latest month)</th></tr></thead>
              <tbody>
                {(data?.people || []).map((p) => (
                  <tr key={p.id} className="clickable" onClick={() => open(p.id)}>
                    <td><strong style={{ fontWeight: 600 }}>{p.display_name}</strong></td>
                    <td className="num">{p.aliases > 1 ? <span className="tag info">{p.aliases}</span> : 1}</td>
                    <td className="num">{fmt(p.events)}</td>
                    <td>{p.last_event ? dateLabel(p.last_event) : <span className="muted">—</span>}</td>
                    <td><div className="tags">{(p.bh_services || "").split(",").filter(Boolean).map((s) => <span key={s} className="tag brand">{s}</span>)}</div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      <PersonDrawer id={openId} onClose={() => open(null)} onChanged={() => { reload(); refresh(); }} />
    </>
  );
}
