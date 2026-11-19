import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import Drawer from "../components/Drawer";
import Icon from "../components/Icon";
import { useMeta } from "../components/Layout";
import { Button, Card, Empty, Kpi, MonthSelect, PageHeader, PartialMonthNotice, Select, Skeleton, Toggle, useAsync } from "../components/ui";
import { BarList, TrendBars, SERIES } from "../components/charts";
import { api, qs } from "../lib/api";
import { dateLabel, fmt, monthLabel, pct, sameName } from "../lib/format";

const FLAG_CHIPS = [
  ["", "All"], ["is_reportable", "Reportable"], ["f_911", "911"], ["f_er", "ER visit"], ["f_hospitalization", "Hospitalization"],
  ["f_police", "Police / law enforcement"], ["f_crisis", "Crisis"], ["f_property_damage", "Property damage"], ["f_self_injury", "Self-injury"],
];

const FIELD_LABELS = [
  ["event_date", "Date of event"], ["member_full_name", "Member's full name (as written)"], ["person_name", "Matched person"],
  ["site_home", "Site / home"], ["event_location", "Event location"], ["reportability_status", "Reportability"],
  ["incident_observation_and_source", "This incident was / by"], ["tier_1_events", "Tier 1 events"], ["tier_2_events", "Tier 2 events"],
  ["behavioral_psychiatric_events", "Behavioral / psychiatric"], ["medical_events", "Medical events"], ["other_event_types", "Other event types"],
  ["event_interventions", "Interventions"], ["injury_level", "Level of injury"], ["injury_description", "Injury description"],
];

function Severity({ row }) {
  if (row.injury_level === "Serious Injury") return <span className="tag bad"><Icon name="alert" size={11} /> Serious</span>;
  if (row.injury_level === "Minor Injury") return <span className="tag warn">Minor</span>;
  if (row.injury_level === "No Injury") return <span className="tag">None</span>;
  return <span className="muted">Not recorded</span>;
}

export default function Incidents() {
  const router = useRouter();
  const { meta } = useMeta();
  const [from, setFrom] = useState(null);
  const [to, setTo] = useState(null);
  const [site, setSite] = useState("");
  const [dups, setDups] = useState(false);
  const [flag, setFlag] = useState("");
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [selected, setSelected] = useState(null);
  useEffect(() => { const t = setTimeout(() => setDebouncedQ(q), 250); return () => clearTimeout(t); }, [q]);

  const filters = { from, to, site, includeDuplicates: dups };
  const summary = useAsync(() => api.get(`/api/incidents/summary${qs(filters)}`), [from, to, site, dups, meta?.last_import, meta?.pending_reviews]);
  const list = useAsync(() => api.get(`/api/incidents${qs({ ...filters, q: debouncedQ, flag, limit: 150 })}`), [from, to, site, dups, debouncedQ, flag, meta?.last_import, meta?.pending_reviews]);

  if (!meta) return <Skeleton h={400} />;
  if (!meta.months.events.length) {
    return (
      <>
        <PageHeader eyebrow="Program" title="Incidents & Safety" />
        <Card><Empty icon="shield" title="No event reports imported" actions={<Button variant="primary" icon="upload" onClick={() => router.push("/import")}>Import a PHS event report</Button>}>
          Import the &ldquo;New Reportable Event Report&rdquo; Excel export from Practical Health Systems.
        </Empty></Card>
      </>
    );
  }
  const s = summary.data;
  const t = s?.totals || {};
  const range = from || to ? `${from ? monthLabel(from) : "start"} – ${to ? monthLabel(to) : "latest"}` : "all months";

  return (
    <>
      <PageHeader
        eyebrow="Program dashboard"
        title="Incidents & Safety"
        subtitle="Every event from the PHS New Reportable Event Report. Blank fields are shown as “Not recorded” rather than counted as “none.”"
      />

      <div className="filters">
        <MonthSelect label="From" months={meta.months.events} value={from} onChange={setFrom} allowEmpty emptyLabel="Earliest" />
        <MonthSelect label="To" months={meta.months.events} value={to} onChange={setTo} allowEmpty emptyLabel="Latest" />
        <Select label="Site" value={site} onChange={setSite} options={[{ value: "", label: "All sites" }, ...meta.sites.map((x) => ({ value: x, label: x }))]} />
        <span className="spacer" />
        <Toggle checked={dups} onChange={setDups} label="Include exact duplicate rows" />
      </div>

      <PartialMonthNotice partialMonths={meta.partialMonths} />

      {!s ? <Skeleton h={130} /> : (
        <div className="grid cols-5">
          <Kpi label="Event records" icon="shield" value={t.events} hint={range} accent />
          <Kpi label="People involved" icon="users" value={t.people} hint={`across ${fmt(t.sites)} sites`} delay={0.04} />
          <Kpi label="Reportable" icon="alert" value={t.reportable} hint={`${pct(t.reportable, t.events)} of events`} delay={0.08} onClick={() => setFlag("is_reportable")} />
          <Kpi label="Serious injuries" icon="activity" value={t.serious} hint={`${pct(t.serious, t.events)} of events`} delay={0.12} />
          <Kpi label="Emergency response" icon="arrowRight" value={t.f_911} hint={`911 calls · ${fmt(t.f_er)} ER visits`} delay={0.16} onClick={() => setFlag("f_911")} />
        </div>
      )}

      {s && (
        <>
          <div className="grid cols-2-1">
            <Card title="Events by month" subtitle="Reportable vs. non-reportable">
              <TrendBars data={s.byMonth.map((m) => ({ ...m, nonreportable: m.events - m.reportable }))} stacked
                series={[{ key: "nonreportable", label: "Non-reportable", color: SERIES[1] }, { key: "reportable", label: "Reportable", color: SERIES[2] }]} />
            </Card>
            <Card title="Level of injury" subtitle="Blank is kept separate from “No Injury”" delay={0.05}>
              <BarList rows={s.byInjury} color={SERIES[2]} />
              <div style={{ marginTop: 18 }}>
                <BarList rows={s.byReportability} color={SERIES[1]} />
              </div>
            </Card>
          </div>

          <div className="grid cols-3">
            <Card title="Where events happen" subtitle="Event location" delay={0.05}><BarList rows={s.byLocation} /></Card>
            <Card title="How events became known" subtitle="Witnessed / discovered, and by whom" delay={0.1}>
              <BarList rows={s.byObservation} formatLabel={(l) => l.replace("Person Supported/Other Persons Supported", "person supported")} />
            </Card>
            <Card title="Interventions" subtitle="Recovered from the combined PHS field; one event can have several" delay={0.15}>
              {s.interventions.length ? <BarList rows={s.interventions} color={SERIES[2]} total={t.with_intervention} /> : <p className="muted">No interventions recorded.</p>}
            </Card>
          </div>

          <div className="grid cols-3">
            <Card title="Behavioral / psychiatric events" subtitle={`${fmt(t.with_behavioral)} events · options recovered from the combined PHS field`} delay={0.05}>
              {s.behavioral.length ? <BarList rows={s.behavioral} color={SERIES[2]} total={t.with_behavioral}
                formatLabel={(l) => l.replace(" including in an acute care hospital", "").replace("Reportable Behavior involving physical aggression and/or self-injurious behavior resulting in injury to another person", "Reportable behavior causing injury to another person")} /> : <p className="muted">None recorded.</p>}
            </Card>
            <Card title="Abuse, neglect & death (Tier 1 / Tier 2)" subtitle={`${fmt(t.tier1)} Tier 1 · ${fmt(t.tier2)} Tier 2 events`} delay={0.1}>
              {s.allegations.length ? (
                <table className="tbl"><thead><tr><th>Allegation</th><th className="num">Tier 1</th><th className="num">Tier 2</th></tr></thead>
                  <tbody>{s.allegations.map((a) => (
                    <tr key={a.label}><td>{a.label}</td><td className="num">{fmt(a.tier1)}</td><td className="num">{fmt(a.tier2)}</td></tr>
                  ))}</tbody></table>
              ) : <p className="muted">None recorded.</p>}
            </Card>
            <Card title="Other event types" subtitle="Short PHS categories; free-text entries grouped" delay={0.15}>
              <BarList rows={s.otherCategories} color={SERIES[1]} formatLabel={(l) => l.replace(/^Other - /, "")} />
            </Card>
          </div>

          <div className="grid cols-2">
            <Card title="Medical events" subtitle={`${fmt(t.with_medical)} events · options recovered from the combined PHS field`} delay={0.05}>
              {s.medical.length ? <BarList rows={s.medical} color={SERIES[2]} total={t.with_medical}
                formatLabel={(l) => l.replace(/ requiring medical (treatment by a medical professional|intervention)/, "")} />
                : <p className="muted">None recorded in this export. (Some PHS exports leave this column empty.)</p>}
            </Card>
            <Card title="Safety indicators" subtitle="Event records matching each definition (see Behavioral Health for trends)" delay={0.1}>
              <BarList rows={Object.entries(s.flags).map(([k, label]) => ({ label, n: t[k] || 0 })).sort((a, b) => b.n - a.n)} color={SERIES[2]} total={t.events} />
            </Card>
          </div>

          <div className="grid cols-2-1">
            <Card title="Sites with the most events" subtitle="Click a site to filter the dashboard" delay={0.05}>
              <BarList rows={s.topSites} color={SERIES[1]} onSelect={(r) => setSite(r.label)} />
            </Card>
            <Card title="Data quality" subtitle="What the export did and didn't record" delay={0.1}>
              <div className="barlist" style={{ gap: 12 }}>
                {[
                  ["Exact duplicate rows", s.dataQuality.duplicates, dups ? "included" : "excluded from counts"],
                  ["Injury level blank", s.dataQuality.injury_level_blank],
                  ["Event location blank", s.dataQuality.location_blank],
                  ["“This incident was / by” blank", s.dataQuality.observation_blank],
                  ["Medical events blank", s.dataQuality.medical_blank],
                ].map(([label, n, note]) => (
                  <div key={label} style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                    <span style={{ color: "var(--ink-2)" }}>{label}{note && <span className="muted"> · {note}</span>}</span>
                    <strong style={{ fontVariantNumeric: "tabular-nums" }}>{fmt(n)} <span className="muted" style={{ fontWeight: 400 }}>({pct(n, s.dataQuality.rows, 0)})</span></strong>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </>
      )}

      <Card className="flush" title="Event records" subtitle={list.data ? `${fmt(list.data.total)} matching · showing newest ${fmt(Math.min(150, list.data.total))}` : " "}
        actions={<label className="search"><Icon name="search" size={15} /><input className="input" placeholder="Search name, site, narrative…" value={q} onChange={(e) => setQ(e.target.value)} /></label>}>
        <div style={{ padding: "4px 20px 12px" }} className="chips">
          {FLAG_CHIPS.map(([k, label]) => <button key={k} className={`chip${flag === k ? " on" : ""}`} onClick={() => setFlag(k)}>{label}</button>)}
        </div>
        <div className="table-wrap" style={{ maxHeight: 520 }}>
          <table className="tbl">
            <thead><tr><th>Date</th><th>Person</th><th>Site / home</th><th>Location</th><th>Event</th><th>Injury</th><th>Status</th></tr></thead>
            <tbody>
              {(list.data?.rows || []).map((r) => (
                <tr key={r.id} className="clickable" onClick={() => setSelected(r)}>
                  <td style={{ whiteSpace: "nowrap" }}>{dateLabel(r.event_date)}</td>
                  <td>{r.person_name || r.member_full_name}{!sameName(r.person_name, r.member_full_name) && <div className="muted" style={{ fontSize: 11.5 }}>as “{r.member_full_name}”</div>}</td>
                  <td>{r.site_home || <span className="muted">—</span>}</td>
                  <td>{r.event_location || <span className="muted">Not recorded</span>}</td>
                  <td className="clip">{r.event_interventions || r.behavioral_psychiatric_events || r.other_event_types || r.tier_1_events || r.tier_2_events || <span className="muted">—</span>}</td>
                  <td><Severity row={r} /></td>
                  <td>{r.is_reportable ? <span className="tag bad">Reportable</span> : <span className="tag">Non-reportable</span>}{r.is_exact_duplicate ? <span className="tag warn" style={{ marginLeft: 4 }}>Duplicate</span> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {list.data && !list.data.rows.length && <Empty icon="search" title="No matching events" />}
        </div>
      </Card>

      <Drawer open={!!selected} onClose={() => setSelected(null)} title={selected ? (selected.person_name || selected.member_full_name) : ""}
        subtitle={selected ? `${dateLabel(selected.event_date)} · ${selected.site_home || "no site"}` : ""}
        actions={selected?.person_id && <Button size="sm" icon="user" onClick={() => router.push(`/people?id=${selected.person_id}`)}>Person</Button>}>
        {selected && (
          <dl className="kv">
            {FIELD_LABELS.map(([k, label]) => (
              <div key={k} style={{ display: "contents" }}>
                <dt>{label}</dt>
                <dd>{k === "event_date" ? dateLabel(selected[k]) : selected[k] || <span className="muted">Not recorded</span>}</dd>
              </div>
            ))}
          </dl>
        )}
      </Drawer>
    </>
  );
}
