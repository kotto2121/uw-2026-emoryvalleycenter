/**
 * api/lib/uploads.js — in-memory held-upload store for the analyze→commit flow.
 *
 * A file is uploaded exactly once (POST /api/imports/analyze); the parsed
 * result is held here under a short uploadId while the user reviews unknown
 * columns. Commit consumes the held upload; TTL expiry discards it cleanly
 * (nothing is committed unless the user confirms). Pure in-memory: no temp
 * files, no new dependencies.
 */

const crypto = require("crypto");

const TTL_MS = 15 * 60 * 1000; // 15 minutes
const MAX_HELD = 8;

/** uploadId -> { id, filename, buffer, result, createdAt, committed } */
const held = new Map();

function prune() {
  const now = Date.now();
  for (const [id, u] of held) if (now - u.createdAt > TTL_MS) held.delete(id);
  // Belt and braces: cap the store so a stray burst can't grow memory.
  while (held.size > MAX_HELD) {
    const oldest = [...held.values()].sort((a, b) => a.createdAt - b.createdAt)[0];
    held.delete(oldest.id);
  }
}

function hold({ filename, buffer, result }) {
  prune();
  const id = crypto.randomUUID();
  held.set(id, { id, filename, buffer, result, createdAt: Date.now(), committed: false });
  return { uploadId: id, expiresInMs: TTL_MS };
}

/**
 * Fetch a held upload. Returns null if unknown/expired/already committed.
 * Marks it committed atomically so a double commit is impossible.
 */
function takeForCommit(uploadId) {
  prune();
  const u = held.get(String(uploadId || ""));
  if (!u || u.committed) return null;
  u.committed = true;
  held.delete(u.id);
  return u;
}

/** Peek without consuming — used if we ever need to re-render the review. */
function peek(uploadId) {
  prune();
  const u = held.get(String(uploadId || ""));
  if (!u || u.committed) return null;
  return { uploadId: u.id, filename: u.filename, createdAt: u.createdAt };
}

/** Drop everything (used by clear-all / admin). */
function clear() {
  held.clear();
}

module.exports = { hold, takeForCommit, peek, clear, TTL_MS };
