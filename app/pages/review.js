import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useState } from "react";
import Icon from "../components/Icon";
import { useMeta } from "../components/Layout";
import { Button, Callout, Card, Empty, PageHeader, Skeleton, toast, useAsync } from "../components/ui";
import { api } from "../lib/api";
import { fmt } from "../lib/format";

function ScoreRing({ score }) {
  const r = 30;
  const c = 2 * Math.PI * r;
  const pctVal = Math.round(score * 100);
  const color = score >= 0.95 ? "#16a06e" : score >= 0.88 ? "#2a78d6" : "#eb6834";
  return (
    <svg className="score-ring" viewBox="0 0 74 74" role="img" aria-label={`${pctVal}% similar`}>
      <circle cx="37" cy="37" r={r} fill="none" stroke="#eef0ec" strokeWidth="6" />
      <motion.circle cx="37" cy="37" r={r} fill="none" stroke={color} strokeWidth="6" strokeLinecap="round"
        transform="rotate(-90 37 37)" strokeDasharray={c} initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c * (1 - score) }} transition={{ duration: 0.8 }} />
      <text x="37" y="43" textAnchor="middle">{pctVal}</text>
    </svg>
  );
}

function Side({ name, info, label }) {
  return (
    <div className="review-side">
      <div className="src">{label}</div>
      <h3>{name}</h3>
      <ul>
        <li><Icon name="file" size={12} /> Written as: {info.aliases.map((a) => `“${a.raw_name}”`).join(", ")}</li>
        <li><Icon name="shield" size={12} /> {fmt(info.events)} event records · {fmt(info.roster)} roster rows</li>
        {info.sites.length > 0 && <li><Icon name="home" size={12} /> {info.sites.join(", ")}</li>}
      </ul>
    </div>
  );
}

export default function Review() {
  const { meta, refresh } = useMeta();
  const { data, loading, reload } = useAsync(() => api.get("/api/reviews"), [meta?.last_import]);
  const [items, setItems] = useState([]);
  const [done, setDone] = useState(0);
  useEffect(() => { if (data) setItems(data.reviews); }, [data]);

  const act = useCallback(async (r, action) => {
    setItems((xs) => xs.filter((x) => x.id !== r.id));
    try {
      await api.post(`/api/reviews/${r.id}`, { action });
      setDone((d) => d + 1);
      toast(action === "merge" ? `Merged “${r.person_name}” and “${r.candidate_name}”` : "Kept as different people");
      // merging can re-point other open questions — refresh the list quietly
      if (action === "merge") reload();
      refresh();
    } catch (e) {
      toast(e.message, "bad");
      reload();
    }
  }, [refresh, reload]);

  // Keyboard: M = merge, D = different (acts on the first card).
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.closest("input, textarea, select") || !items.length) return;
      if (e.key === "m" || e.key === "M") act(items[0], "merge");
      if (e.key === "d" || e.key === "D") act(items[0], "distinct");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [items, act]);

  return (
    <>
      <PageHeader eyebrow="Data" title="Review Queue"
        subtitle="Neither PHS nor the roster carries a client ID, so people are matched by name. Exact and obvious matches link automatically; these look similar but need a human decision. Every answer is remembered, so the queue shrinks each month." />
      {loading && !data ? <Skeleton h={220} /> : !items.length ? (
        <Card><Empty icon="check" title="All caught up" >{done ? `You resolved ${done} match${done === 1 ? "" : "es"} this session. ` : ""}No possible duplicates are waiting for review.</Empty></Card>
      ) : (
        <>
          <Callout tone="info" icon="info">
            <strong>{items.length}</strong> to review. Press <kbd>M</kbd> for same person (merge) or <kbd>D</kbd> for different people on the top card. Merging combines their records; nothing is deleted from the source files.
          </Callout>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <AnimatePresence initial={false}>
              {items.slice(0, 25).map((r, i) => (
                <motion.div key={r.id} layout initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: 60, transition: { duration: 0.22 } }} transition={{ duration: 0.3, delay: Math.min(i, 6) * 0.03 }}>
                  <Card>
                    <div className="review-card">
                      <Side label="New record" name={r.person_name} info={r.person} />
                      <div className="review-mid">
                        <ScoreRing score={r.score} />
                        <span className="muted" style={{ fontSize: 12 }}>similarity</span>
                      </div>
                      <Side label="Existing person" name={r.candidate_name} info={r.candidate} />
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                      <div className="review-reason"><Icon name="sparkle" size={13} style={{ verticalAlign: -2 }} /> Why suggested: {r.reason || "similar spelling"}</div>
                      <div className="review-actions">
                        <Button icon="x" onClick={() => act(r, "distinct")}>Different people{i === 0 && <kbd>D</kbd>}</Button>
                        <Button variant="primary" icon="merge" onClick={() => act(r, "merge")}>Same person — merge{i === 0 && <kbd style={{ color: "#cfe", borderColor: "rgba(255,255,255,.3)", background: "transparent" }}>M</kbd>}</Button>
                      </div>
                    </div>
                  </Card>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </>
      )}
    </>
  );
}
