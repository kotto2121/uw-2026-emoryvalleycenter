import { useState } from "react";
import { useMeta } from "./Layout";
import { Button, toast } from "./ui";
import { api } from "../lib/api";

export default function LoadDemoButton({ variant = "primary", label = "Load demo data" }) {
  const { refresh } = useMeta();
  const [busy, setBusy] = useState(false);
  return (
    <Button variant={variant} icon="sparkle" busy={busy} onClick={async () => {
      setBusy(true);
      try {
        await api.post("/api/demo/load");
        await refresh();
        toast("Demo data loaded — 6 months of fictitious records.");
        window.dispatchEvent(new Event("evc:data-changed"));
      } catch (e) {
        toast(e.message, "bad");
      } finally {
        setBusy(false);
      }
    }}>{label}</Button>
  );
}

