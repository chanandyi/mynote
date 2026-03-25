import { marked } from "marked";

type Note = {
  id: string;
  title: string;
  body: string;
  updated_at: number;
};

const api = (path: string, init?: RequestInit) => fetch(path, init);

let notes: Note[] = [];
let currentId: string | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

const app = document.getElementById("app")!;

function fmtTime(ts: number) {
  const d = new Date(ts);
  return d.toLocaleString();
}

function render() {
  const current = currentId ? notes.find((n) => n.id === currentId) : null;

  app.innerHTML = `
    <aside class="sidebar">
      <div class="sidebar-head">
        <button class="btn btn-primary" type="button" id="new-note">新建</button>
      </div>
      <ul class="note-list" id="note-list"></ul>
      <div class="status" id="status"></div>
      <div class="error" id="err"></div>
    </aside>
    <main class="main">
      ${
        !current
          ? `<div class="empty">选择左侧笔记或点击「新建」</div>`
          : `
      <div class="toolbar">
        <input class="title" id="note-title" value="${escapeAttr(
          current.title
        )}" placeholder="标题" />
        <button class="btn btn-ghost" type="button" id="upload-img">插入图片</button>
        <input type="file" id="file" accept="image/*" hidden />
        <span class="toolbar-spacer"></span>
        <button class="btn" type="button" id="toggle-preview">预览</button>
        <button class="btn" type="button" id="del-note" style="color:var(--danger)">删除</button>
      </div>
      <div class="editor-panes" id="panes">
        <textarea class="body" id="note-body" spellcheck="false"></textarea>
        <div class="preview-pane" id="preview"></div>
      </div>`
      }
    </main>
  `;

  const listEl = document.getElementById("note-list");
  if (listEl) {
    listEl.innerHTML = notes
      .map(
        (n) => `
      <li class="note-item ${n.id === currentId ? "active" : ""}" data-id="${
        n.id
      }">
        <div class="note-item-title">${escapeHtml(n.title || "无标题")}</div>
        <div class="note-item-meta">${fmtTime(n.updated_at)}</div>
      </li>`
      )
      .join("");
    listEl.querySelectorAll(".note-item").forEach((el) => {
      el.addEventListener("click", () => {
        currentId = el.getAttribute("data-id");
        render();
      });
    });
  }

  document.getElementById("new-note")?.addEventListener("click", createNote);

  if (current) {
    const titleEl = document.getElementById(
      "note-title"
    ) as HTMLInputElement | null;
    const bodyEl = document.getElementById(
      "note-body"
    ) as HTMLTextAreaElement | null;
    if (bodyEl) bodyEl.value = current.body;
    const previewEl = document.getElementById("preview");

    const updatePreview = () => {
      if (previewEl && bodyEl) {
        previewEl.innerHTML = `<div class="md">${marked.parse(
          bodyEl.value,
          { async: false }
        )}</div>`;
      }
    };

    titleEl?.addEventListener("input", () => scheduleSave());
    bodyEl?.addEventListener("input", () => {
      updatePreview();
      scheduleSave();
    });
    updatePreview();

    let previewOn = true;
    document.getElementById("toggle-preview")?.addEventListener("click", () => {
      previewOn = !previewOn;
      const p = document.getElementById("preview");
      const panes = document.getElementById("panes");
      if (p) p.style.display = previewOn ? "" : "none";
      if (panes && window.innerWidth > 900)
        panes.style.gridTemplateColumns = previewOn ? "1fr 1fr" : "1fr";
    });

    document.getElementById("del-note")?.addEventListener("click", async () => {
      if (!currentId || !confirm("确定删除这篇笔记？")) return;
      setErr("");
      const res = await api(`/api/notes/${currentId}`, { method: "DELETE" });
      if (!res.ok) {
        setErr(await res.text());
        return;
      }
      notes = notes.filter((n) => n.id !== currentId);
      currentId = notes[0]?.id ?? null;
      render();
    });

    const fileInput = document.getElementById("file") as HTMLInputElement;
    document.getElementById("upload-img")?.addEventListener("click", () => {
      fileInput?.click();
    });
    fileInput?.addEventListener("change", async () => {
      const f = fileInput.files?.[0];
      fileInput.value = "";
      if (!f || !bodyEl || !currentId) return;
      setErr("");
      const fd = new FormData();
      fd.append("file", f);
      const res = await api("/api/upload", { method: "POST", body: fd });
      if (!res.ok) {
        setErr(await res.text());
        return;
      }
      const { url } = (await res.json()) as { url: string };
      const insert = `\n![](${url})\n`;
      const start = bodyEl.selectionStart ?? bodyEl.value.length;
      const end = bodyEl.selectionEnd ?? bodyEl.value.length;
      bodyEl.value =
        bodyEl.value.slice(0, start) + insert + bodyEl.value.slice(end);
      bodyEl.focus();
      bodyEl.selectionStart = bodyEl.selectionEnd = start + insert.length;
      updatePreview();
      scheduleSave();
    });
  }
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(s: string) {
  return escapeHtml(s).replace(/'/g, "&#39;");
}

function setErr(msg: string) {
  const el = document.getElementById("err");
  if (el) el.textContent = msg;
}

function setStatus(msg: string) {
  const el = document.getElementById("status");
  if (el) el.textContent = msg;
}

async function loadNotes() {
  setErr("");
  const res = await api("/api/notes");
  if (!res.ok) {
    setErr("加载失败：请确认后端已启动 (npm run dev:server)");
    return;
  }
  notes = await res.json();
  if (!currentId && notes.length) currentId = notes[0].id;
  render();
}

async function createNote() {
  setErr("");
  const res = await api("/api/notes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: "新笔记", body: "" }),
  });
  if (!res.ok) {
    setErr(await res.text());
    return;
  }
  const n = (await res.json()) as Note;
  notes.unshift(n);
  currentId = n.id;
  render();
}

function scheduleSave() {
  if (!currentId) return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => void saveNow(), 500);
}

async function saveNow() {
  if (!currentId) return;
  const titleEl = document.getElementById("note-title") as HTMLInputElement | null;
  const bodyEl = document.getElementById("note-body") as HTMLTextAreaElement | null;
  if (!titleEl || !bodyEl) return;
  setStatus("保存中…");
  const res = await api(`/api/notes/${currentId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: titleEl.value, body: bodyEl.value }),
  });
  if (!res.ok) {
    setStatus("");
    setErr(await res.text());
    return;
  }
  const updated = (await res.json()) as Note;
  notes = notes.map((n) => (n.id === updated.id ? updated : n));
  notes.sort((a, b) => b.updated_at - a.updated_at);
  setStatus(`已保存 ${fmtTime(updated.updated_at)}`);
}

loadNotes();
