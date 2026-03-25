import Database from "better-sqlite3";
import { mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const dataDir = join(root, "data");
mkdirSync(dataDir, { recursive: true });

const dbPath = join(dataDir, "notes.db");
const db = new Database(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL DEFAULT '',
    body TEXT NOT NULL DEFAULT '',
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS images (
    id TEXT PRIMARY KEY,
    mime TEXT NOT NULL,
    data BLOB NOT NULL,
    created_at INTEGER NOT NULL
  );
`);

export function insertImage({ id, mime, data }) {
  const created_at = Date.now();
  db.prepare(
    `INSERT INTO images (id, mime, data, created_at) VALUES (?, ?, ?, ?)`
  ).run(id, mime, data, created_at);
}

export function getImage(id) {
  return db
    .prepare(`SELECT id, mime, data, created_at FROM images WHERE id = ?`)
    .get(id);
}

export function listNotes() {
  return db
    .prepare(
      `SELECT id, title, body, updated_at FROM notes ORDER BY updated_at DESC`
    )
    .all();
}

export function getNote(id) {
  return db
    .prepare(`SELECT id, title, body, updated_at FROM notes WHERE id = ?`)
    .get(id);
}

export function createNote({ id, title, body }) {
  const updated_at = Date.now();
  db.prepare(
    `INSERT INTO notes (id, title, body, updated_at) VALUES (?, ?, ?, ?)`
  ).run(id, title ?? "", body ?? "", updated_at);
  return getNote(id);
}

export function updateNote(id, { title, body }) {
  const row = getNote(id);
  if (!row) return null;
  const updated_at = Date.now();
  db.prepare(
    `UPDATE notes SET title = ?, body = ?, updated_at = ? WHERE id = ?`
  ).run(title ?? row.title, body ?? row.body, updated_at, id);
  return getNote(id);
}

export function deleteNote(id) {
  const r = db.prepare(`DELETE FROM notes WHERE id = ?`).run(id);
  return r.changes > 0;
}
