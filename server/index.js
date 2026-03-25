import cors from "cors";
import express from "express";
import multer from "multer";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { v4 as uuidv4 } from "uuid";
import * as db from "./db.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const isProd = process.env.NODE_ENV === "production";

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /^image\//.test(file.mimetype);
    cb(ok ? null : new Error("仅支持图片"), ok);
  },
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/notes", (_req, res) => {
  res.json(db.listNotes());
});

app.get("/api/notes/:id", (req, res) => {
  const row = db.getNote(req.params.id);
  if (!row) return res.status(404).json({ error: "not found" });
  res.json(row);
});

app.post("/api/notes", (req, res) => {
  const id = uuidv4();
  const { title = "", body = "" } = req.body ?? {};
  const row = db.createNote({ id, title, body });
  res.status(201).json(row);
});

app.put("/api/notes/:id", (req, res) => {
  const { title, body } = req.body ?? {};
  const row = db.updateNote(req.params.id, { title, body });
  if (!row) return res.status(404).json({ error: "not found" });
  res.json(row);
});

app.delete("/api/notes/:id", (req, res) => {
  const ok = db.deleteNote(req.params.id);
  if (!ok) return res.status(404).json({ error: "not found" });
  res.status(204).end();
});

app.post("/api/upload", upload.single("file"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "缺少文件字段 file" });
  }
  const id = uuidv4();
  db.insertImage({
    id,
    mime: req.file.mimetype,
    data: req.file.buffer,
  });
  const base =
    process.env.PUBLIC_BASE_URL?.replace(/\/$/, "") ||
    `${req.protocol}://${req.get("host")}`;
  const url = `${base}/api/images/${id}`;
  res.json({ url, id });
});

app.get("/api/images/:id", (req, res) => {
  const row = db.getImage(req.params.id);
  if (!row) return res.status(404).end();
  res.setHeader("Content-Type", row.mime);
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  res.send(Buffer.from(row.data));
});

if (isProd) {
  const dist = join(root, "dist");
  app.use(express.static(dist));
  app.get("*", (_req, res) => {
    res.sendFile(join(dist, "index.html"));
  });
}

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => {
  console.log(
    `[mynote] ${isProd ? "production" : "dev"} http://localhost:${port}`
  );
});
