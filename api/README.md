# API — EmoryValley Express Server

Minimal Node.js / Express API backed by SQLite (via `db/index.js`, sql.js).

- **Base URL (dev):** `http://localhost:4100`
- **Run standalone:** `node api/server.js` (or `npm run dev:api`)
- **In the packaged app:** started in-process by the Electron main process on the same port.
- **CORS:** wide open (`*`) so the Electron renderer can call it from any origin.

## Routes

### `GET /health`

Liveness probe. Used by `wait-on` during dev and by the Electron main process to detect an already-running API.

**Response** `200 OK`
```json
{ "ok": true }
```

---

### `GET /api/hello`

Returns the latest greeting stored in SQLite. Seeded with `"Hello World"` on first run.

**Response** `200 OK`
```json
{
  "message": "Hello World",
  "createdAt": "2026-11-19 15:22:01"
}
```

---

### `GET /api/greetings`

Returns all greetings, newest first.

**Response** `200 OK`
```json
{
  "greetings": [
    { "id": 2, "message": "Hi Windows!", "createdAt": "2026-11-19 15:30:00" },
    { "id": 1, "message": "Hello World", "createdAt": "2026-11-19 15:22:01" }
  ]
}
```

---

### `POST /api/greetings`

Insert a new greeting into SQLite.

**Request body** `application/json`
```json
{ "message": "Hi Windows!" }
```

**Response** `201 Created`
```json
{ "id": 2, "message": "Hi Windows!" }
```

**Errors**
- `400` — missing/empty `message` → `{ "error": "message is required" }`
- `500` — internal error → `{ "error": "internal error" }`

## Database

See `db/index.js`. SQLite file location:
- Packaged app: OS user-data dir (Windows: `%APPDATA%\EmoryValley\emoryvalley.db`).
- Dev standalone: `./db/emoryvalley.db`.

Schema:
```sql
CREATE TABLE greetings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```
