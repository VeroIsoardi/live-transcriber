// Consume el stream de la pestaña y lo manda a Deepgram.
// Los offscreen documents solo tienen chrome.runtime: la config llega por mensaje.

let session = null; // { stream, audioCtx, ws, recorder, keepAlive }
const state = { lines: [], status: { text: "Detenido", kind: "idle" } };

const toPanel = (msg) => chrome.runtime.sendMessage({ target: "panel", ...msg }).catch(() => {});

function setStatus(text, kind = "idle") {
  state.status = { text, kind };
  toPanel({ type: "status", text, kind });
}

async function start(streamId, { apiKey, language = "es", model = "nova-3" }) {
  setStatus("Conectando…");

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { mandatory: { chromeMediaSource: "tab", chromeMediaSourceId: streamId } },
    video: false,
  });

  // tabCapture silencia la pestaña: reenviamos el audio a los parlantes.
  const audioCtx = new AudioContext();
  audioCtx.createMediaStreamSource(stream).connect(audioCtx.destination);

  const params = new URLSearchParams({
    model, language,
    smart_format: "true",
    interim_results: "true",
    endpointing: "300",
  });
  // En el navegador no se pueden mandar headers: Deepgram acepta la key como subprotocolo.
  const ws = new WebSocket(`wss://api.deepgram.com/v1/listen?${params}`, ["token", apiKey]);
  session = { stream, audioCtx, ws, recorder: null, keepAlive: null };

  ws.onopen = () => {
    const recorder = new MediaRecorder(stream, { mimeType: "audio/webm;codecs=opus" });
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0 && ws.readyState === WebSocket.OPEN) ws.send(e.data);
    };
    recorder.start(250);
    session.recorder = recorder;
    session.keepAlive = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "KeepAlive" }));
    }, 8000);
    setStatus("En vivo", "live");
  };

  ws.onmessage = (msg) => {
    const data = JSON.parse(msg.data);
    if (data.type !== "Results") return;
    const text = data.channel?.alternatives?.[0]?.transcript?.trim();
    if (data.is_final) {
      toPanel({ type: "interim", text: "" });
      if (text) {
        const line = { t: data.start, text };
        state.lines.push(line);
        toPanel({ type: "final", ...line });
      }
    } else {
      toPanel({ type: "interim", text: text || "" });
    }
  };

  ws.onclose = (e) => {
    if (session?.ws !== ws) return;
    const neverStarted = !session.recorder;
    cleanup();
    if (neverStarted) setStatus("Deepgram rechazó la conexión (¿key inválida?)", "error");
    else setStatus(e.code === 1000 ? "Detenido" : `Conexión cerrada (${e.code})`, e.code === 1000 ? "idle" : "error");
  };

  stream.getAudioTracks()[0].addEventListener("ended", stop);
}

function stop() {
  if (!session) return;
  const { ws } = session;
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "CloseStream" }));
  cleanup();
  setStatus("Detenido");
}

function cleanup() {
  if (!session) return;
  const { stream, audioCtx, ws, recorder, keepAlive } = session;
  session = null;
  clearInterval(keepAlive);
  if (recorder && recorder.state !== "inactive") recorder.stop();
  stream.getTracks().forEach((t) => t.stop());
  audioCtx.close();
  setTimeout(() => {
    if (ws.readyState <= WebSocket.OPEN) ws.close();
    chrome.runtime.sendMessage({ target: "background", type: "stopped" }).catch(() => {});
  }, 1500);
  toPanel({ type: "interim", text: "" });
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.target !== "offscreen") return;
  switch (msg.type) {
    case "start":
      start(msg.streamId, msg.settings).catch((err) => {
        console.error(err);
        cleanup();
        setStatus("No se pudo capturar el audio", "error");
      });
      sendResponse({ ok: true });
      break;
    case "stop":
      stop();
      sendResponse({ ok: true });
      break;
    case "getState":
      sendResponse({ ...state, recording: !!session });
      break;
    case "clear":
      state.lines = [];
      sendResponse({ ok: true });
      break;
  }
});
