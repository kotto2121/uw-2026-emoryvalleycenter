/**
 * app/lib/api.js — talk to the local API.
 *
 * In Electron, the preload script provides window.evc = { apiUrl, token }.
 * In a plain browser during development we fall back to the dev API on :4100.
 */
export function apiConfig() {
  if (typeof window !== "undefined" && window.evc) return window.evc;
  return { apiUrl: "http://127.0.0.1:4100", token: "dev-token", isElectron: false, platform: "browser" };
}

async function request(path, { method = "GET", body, raw, filename } = {}) {
  const { apiUrl, token } = apiConfig();
  const headers = { "x-evc-token": token };
  let payload;
  if (raw) {
    headers["Content-Type"] = "application/octet-stream";
    if (filename) headers["x-filename"] = encodeURIComponent(filename);
    payload = raw;
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const res = await fetch(`${apiUrl}${path}`, { method, headers, body: payload });
  const isJson = (res.headers.get("content-type") || "").includes("json");
  const data = isJson ? await res.json() : await res.blob();
  if (!res.ok) throw new Error((isJson && data.error) || `Request failed (${res.status})`);
  return data;
}

export const api = {
  get: (p) => request(p),
  post: (p, body) => request(p, { method: "POST", body }),
  patch: (p, body) => request(p, { method: "PATCH", body }),
  del: (p) => request(p, { method: "DELETE" }),
  upload: (p, file) => file.arrayBuffer().then((buf) => request(p, { method: "POST", raw: buf, filename: file.name })),
  /** Fetch a file and hand it to the browser/Electron "Save as" flow. */
  async download(p, fallbackName = "download") {
    const { apiUrl, token } = apiConfig();
    const res = await fetch(`${apiUrl}${p}`, { headers: { "x-evc-token": token } });
    if (!res.ok) throw new Error(`Download failed (${res.status})`);
    const cd = res.headers.get("content-disposition") || "";
    const name = (cd.match(/filename="([^"]+)"/) || [])[1] || fallbackName;
    const url = URL.createObjectURL(await res.blob());
    const a = Object.assign(document.createElement("a"), { href: url, download: name });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  },
};

/** Build a query string, skipping empty values. */
export function qs(params) {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "" && v !== false) s.set(k, v === true ? "1" : v);
  const str = s.toString();
  return str ? `?${str}` : "";
}
