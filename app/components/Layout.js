import Link from "next/link";
import { useRouter } from "next/router";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Icon from "./Icon";
import Logo from "./Logo";
import { api, apiConfig } from "../lib/api";
import { PROGRAMS } from "../lib/programs";
import { relativeTime } from "../lib/format";

const MetaContext = createContext({ meta: null, refresh: () => {} });
export const useMeta = () => useContext(MetaContext);

const NAV = [
  { group: null, items: [{ href: "/", label: "Overview", icon: "grid" }] },
  {
    group: "Programs",
    items: PROGRAMS.filter((p) => p.status === "live").map((p) => ({ href: p.href, label: p.name, icon: p.icon })),
  },
  {
    group: "Data",
    items: [
      { href: "/import", label: "Import Center", icon: "upload" },
      { href: "/review", label: "Review Queue", icon: "merge", badge: "pending_reviews" },
      { href: "/people", label: "People", icon: "users" },
      { href: "/reports", label: "Reports", icon: "file" },
    ],
  },
];

const TITLES = {
  "/": "Overview",
  "/behavioral-health": "Behavioral Health",
  "/incidents": "Incidents & Safety",
  "/import": "Import Center",
  "/review": "Review Queue",
  "/people": "People",
  "/reports": "Reports",
  "/settings": "Settings",
  "/programs": "Programs",
};

function NavItem({ item, active, collapsed, badgeValue }) {
  return (
    <Link href={item.href} className={`nav-item${active ? " active" : ""}`} title={collapsed ? item.label : undefined}>
      {active && <motion.span layoutId="nav-active" className="nav-active-bg" transition={{ type: "spring", stiffness: 500, damping: 40 }} />}
      <Icon name={item.icon} size={18} />
      {!collapsed && <span className="nav-label">{item.label}</span>}
      {badgeValue > 0 && <span className={`nav-badge${collapsed ? " dot" : ""}`}>{collapsed ? "" : badgeValue}</span>}
    </Link>
  );
}

function Sidebar({ collapsed, setCollapsed, meta, platform }) {
  const router = useRouter();
  const path = router.pathname;
  const slug = router.query.p;
  const [plannedOpen, setPlannedOpen] = useState(path === "/programs");
  useEffect(() => { if (path === "/programs") setPlannedOpen(true); }, [path]);
  const planned = PROGRAMS.filter((p) => p.status !== "live");

  return (
    <aside className={`sidebar${collapsed ? " collapsed" : ""}${platform === "darwin" ? " mac" : ""}`}>
      <div className="sb-brand">
        <Logo size={30} />
        {!collapsed && (
          <div className="sb-brand-text">
            <strong>Greenhouse</strong>
            <span>Emory Valley Center</span>
          </div>
        )}
      </div>

      <nav className="sb-nav">
        {NAV.map((g, gi) => (
          <div className="nav-group" key={gi}>
            {g.group && !collapsed && <div className="nav-group-label">{g.group}</div>}
            {g.group && collapsed && <div className="nav-group-rule" />}
            {g.items.map((it) => (
              <NavItem key={it.href} item={it} collapsed={collapsed} active={path === it.href} badgeValue={it.badge && meta ? meta[it.badge] : 0} />
            ))}
            {g.group === "Programs" && (
              <>
                <button className={`nav-item nav-toggle${path === "/programs" ? " active-soft" : ""}`} onClick={() => (collapsed ? router.push("/programs") : setPlannedOpen((o) => !o))} title={collapsed ? "Planned programs" : undefined}>
                  <Icon name="sparkle" size={18} />
                  {!collapsed && <span className="nav-label">Planned programs</span>}
                  {!collapsed && <Icon name="chevronDown" size={15} className={`chev${plannedOpen ? " open" : ""}`} />}
                </button>
                <AnimatePresence initial={false}>
                  {plannedOpen && !collapsed && (
                    <motion.div className="nav-sub" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22 }}>
                      {planned.map((p) => (
                        <Link key={p.slug} href={`/programs?p=${p.slug}`} className={`nav-sub-item${path === "/programs" && slug === p.slug ? " active" : ""}`}>
                          {p.name}
                          {p.restricted && <Icon name="lock" size={12} />}
                        </Link>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </>
            )}
          </div>
        ))}
      </nav>

      <div className="sb-footer">
        <NavItem item={{ href: "/settings", label: "Settings", icon: "settings" }} collapsed={collapsed} active={path === "/settings"} />
        {!collapsed && (
          <div className="sb-privacy">
            <Icon name="lock" size={13} />
            <span>Local only · data never leaves this computer</span>
          </div>
        )}
        <button className="sb-collapse" onClick={() => setCollapsed((c) => !c)} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
          <Icon name={collapsed ? "chevronRight" : "chevronLeft"} size={16} />
        </button>
      </div>
    </aside>
  );
}

function Topbar({ meta, title, platform }) {
  return (
    <header className={`topbar${platform === "win32" || platform === "linux" ? " has-controls" : ""}`}>
      <div className="topbar-title">{title}</div>
      <div className="topbar-right">
        {meta?.isDemo && (
          <Link href="/settings" className="pill pill-demo" title="Fictitious demo data is loaded">
            <Icon name="sparkle" size={13} /> Demo data
          </Link>
        )}
        {meta?.hasData && (
          <span className="topbar-meta">
            <Icon name="database" size={13} /> Updated {relativeTime(meta.last_import)}
          </span>
        )}
      </div>
    </header>
  );
}

export default function Layout({ children }) {
  const router = useRouter();
  const [meta, setMeta] = useState(null);
  const [collapsed, setCollapsed] = useState(false);
  const [platform, setPlatform] = useState("browser");

  const refresh = useCallback(async () => {
    try {
      setMeta(await api.get("/api/meta"));
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    setPlatform(apiConfig().platform);
    try { setCollapsed(localStorage.getItem("evc.sidebar") === "collapsed"); } catch {}
    refresh();
  }, [refresh]);
  useEffect(() => {
    try { localStorage.setItem("evc.sidebar", collapsed ? "collapsed" : "open"); } catch {}
  }, [collapsed]);

  return (
    <MetaContext.Provider value={{ meta, refresh }}>
      <div className={`shell${collapsed ? " sb-collapsed" : ""}`}>
        <Sidebar collapsed={collapsed} setCollapsed={setCollapsed} meta={meta} platform={platform} />
        <div className="main">
          <Topbar meta={meta} title={TITLES[router.pathname] || ""} platform={platform} />
          <main className="content" id="content">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                className="page"
                key={router.pathname}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
              >
                {children}
              </motion.div>
            </AnimatePresence>
          </main>
        </div>
      </div>
    </MetaContext.Provider>
  );
}
