const $ = (id) => document.getElementById(id);
const els = {
  apiKey: $("apiKey"), language: $("language"), model: $("model"), save: $("save"),
  settings: $("settings"), stop: $("stop"), status: $("status"),
  transcript: $("transcript"), interim: $("interim"),
  copy: $("copy"), export: $("export"), clear: $("clear"),
};

let lines = []; // [{ t: segundos, text }]

// ---------- Configuración ----------
async function loadSettings() {
  const s = await chrome.storage.local.get(["apiKey", "language", "model"]);
  els.apiKey.value = s.apiKey || "";
  els.language.value = s.language || "es";
  els.model.value = s.model || "nova-3";
  if (!s.apiKey) {
    els.settings.open = true;
    setStatus("Falta API key", "error");
  }
}

els.save.addEventListener("click", async () => {
  await chrome.storage.local.set({
    apiKey: els.apiKey.value.trim(),
    language: els.language.value,
    model: els.model.value,
  });
  els.settings.open = false;
  setStatus("Guardado. Tocá el ícono para empezar");
});

// ---------- UI ----------
function setStatus(text, kind = "idle") {
  els.status.textContent = text;
  els.status.className = `status ${kind}`;
  els.stop.disabled = kind !== "live" && text !== "Conectando…";
}

function fmt(sec) {
  const s = Math.floor(sec), h = Math.floor(s / 3600);
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

function appendLine({ t, text }) {
  lines.push({ t, text });
  els.transcript.querySelector(".empty")?.remove();
  const p = document.createElement("p");
  const ts = document.createElement("span");
  ts.className = "ts";
  ts.textContent = fmt(t);
  p.append(ts, document.createTextNode(text));
  const atBottom =
    els.transcript.scrollHeight - els.transcript.scrollTop - els.transcript.clientHeight < 40;
  els.transcript.append(p);
  if (atBottom) els.transcript.scrollTop = els.transcript.scrollHeight;
}

const asText = () => lines.map((l) => `[${fmt(l.t)}] ${l.text}`).join("\n");

// ---------- Mensajes del offscreen / background ----------
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.target !== "panel") return;
  if (msg.type === "status") setStatus(msg.text, msg.kind);
  if (msg.type === "final") appendLine(msg);
  if (msg.type === "interim") els.interim.textContent = msg.text;
});

// Si el panel se abre con una transcripción en curso, recupera lo que ya hay.
async function syncState() {
  try {
    const s = await chrome.runtime.sendMessage({ target: "offscreen", type: "getState" });
    if (!s) return;
    els.transcript.innerHTML = "";
    lines = [];
    s.lines.forEach(appendLine);
    setStatus(s.status.text, s.status.kind);
  } catch {
    // No hay offscreen: no se está transcribiendo.
  }
}

// ---------- Acciones ----------
els.stop.addEventListener("click", () => {
  chrome.runtime.sendMessage({ target: "offscreen", type: "stop" }).catch(() => {});
});

els.copy.addEventListener("click", () => navigator.clipboard.writeText(asText()));

els.export.addEventListener("click", () => {
  const blob = new Blob([asText()], { type: "text/plain" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `transcripcion-${new Date().toISOString().slice(0, 16).replace(":", "-")}.txt`;
  a.click();
  URL.revokeObjectURL(a.href);
});

els.clear.addEventListener("click", () => {
  lines = [];
  els.transcript.innerHTML = "";
  chrome.runtime.sendMessage({ target: "offscreen", type: "clear" }).catch(() => {});
});

loadSettings().then(syncState);
