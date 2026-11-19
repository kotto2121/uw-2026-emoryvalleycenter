import Head from "next/head";
import { useEffect, useState } from "react";

// API base: injected by Electron preload (window.apiUrl) in the packaged app,
// defaults to localhost:4100 for plain browser dev.
function getApiBase() {
  if (typeof window !== "undefined" && window.apiUrl) return window.apiUrl;
  return "http://localhost:4100";
}

export default function Home() {
  const [hello, setHello] = useState(null);
  const [greetings, setGreetings] = useState([]);
  const [error, setError] = useState(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    try {
      setError(null);
      const base = getApiBase();
      const [h, g] = await Promise.all([
        fetch(`${base}/api/hello`).then((r) => r.json()),
        fetch(`${base}/api/greetings`).then((r) => r.json()),
      ]);
      setHello(h);
      setGreetings(g.greetings || []);
    } catch (err) {
      setError(String(err));
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function addGreeting(e) {
    e.preventDefault();
    if (!draft.trim()) return;
    try {
      setSaving(true);
      const base = getApiBase();
      await fetch(`${base}/api/greetings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: draft.trim() }),
      });
      setDraft("");
      await load();
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Head>
        <title>Greenhouse by Emory Valley Center</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <main>
        <p className="brand">Greenhouse by Emory Valley Center</p>
        <h1>{hello ? hello.message : "Loading…"}</h1>
        <p className="sub">
          Electron + Next.js + Express + SQLite — hello world, end to end.
        </p>

        {error && <p className="err">API error: {error}</p>}

        <section>
          <h2>Greetings (from SQLite)</h2>
          <ul>
            {greetings.map((g) => (
              <li key={g.id}>
                <strong>{g.message}</strong>{" "}
                <span className="date">{g.createdAt}</span>
              </li>
            ))}
          </ul>

          <form onSubmit={addGreeting}>
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Add a greeting…"
            />
            <button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </button>
          </form>
        </section>
      </main>

      <style jsx global>{`
        * { box-sizing: border-box; }
        body {
          margin: 0;
          font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
          background: #0f172a;
          color: #e2e8f0;
        }
        main { max-width: 720px; margin: 0 auto; padding: 48px 24px; }
        .brand { color: #38bdf8; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; font-size: 13px; margin: 0 0 8px; }
        h1 { font-size: 40px; margin-bottom: 4px; }
        .sub { color: #94a3b8; margin-top: 0; }
        .err { color: #f87171; }
        section { margin-top: 32px; }
        ul { list-style: none; padding: 0; }
        li {
          padding: 10px 12px; border-bottom: 1px solid #1e293b;
          display: flex; justify-content: space-between;
        }
        .date { color: #64748b; font-size: 13px; }
        form { display: flex; gap: 8px; margin-top: 16px; }
        input {
          flex: 1; padding: 10px 12px; border-radius: 8px; border: 1px solid #334155;
          background: #1e293b; color: #e2e8f0;
        }
        button {
          padding: 10px 16px; border-radius: 8px; border: none;
          background: #38bdf8; color: #0f172a; font-weight: 600; cursor: pointer;
        }
        button:disabled { opacity: 0.6; cursor: default; }
      `}</style>
    </>
  );
}
