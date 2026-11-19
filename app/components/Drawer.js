import { AnimatePresence, motion } from "framer-motion";
import { useEffect } from "react";
import Icon from "./Icon";

export default function Drawer({ open, onClose, title, subtitle, children, actions }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div className="drawer-backdrop" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
          <motion.aside className="drawer" role="dialog" aria-modal="true" aria-label={typeof title === "string" ? title : "Details"}
            initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ type: "spring", stiffness: 380, damping: 40 }}>
            <div className="drawer-head">
              <div>
                <h2>{title}</h2>
                {subtitle && <p className="muted" style={{ margin: "4px 0 0" }}>{subtitle}</p>}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                {actions}
                <button className="btn ghost sm" onClick={onClose} aria-label="Close"><Icon name="x" size={16} /></button>
              </div>
            </div>
            <div className="drawer-body">{children}</div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
