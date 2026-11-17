// El clic en el ícono es el único gesto que habilita tabCapture,
// así que la captura arranca acá y el audio se procesa en un offscreen document.

async function hasOffscreen() {
  const ctx = await chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"] });
  return ctx.length > 0;
}

function notifyPanel(text, kind = "error") {
  chrome.runtime.sendMessage({ target: "panel", type: "status", text, kind }).catch(() => {});
}

chrome.action.onClicked.addListener(async (tab) => {
  // Sin await antes: sidePanel.open necesita el gesto del usuario.
  chrome.sidePanel.open({ windowId: tab.windowId }).catch(console.error);

  if (await hasOffscreen()) return; // ya está transcribiendo

  const settings = await chrome.storage.local.get(["apiKey", "language", "model"]);
  if (!settings.apiKey) {
    setTimeout(() => notifyPanel("Falta API key: guardala y volvé a tocar el ícono"), 500);
    return;
  }

  try {
    const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id });
    await chrome.offscreen.createDocument({
      url: "offscreen.html",
      reasons: ["USER_MEDIA"],
      justification: "Capturar el audio de la pestaña para transcribirlo",
    });
    await chrome.runtime.sendMessage({ target: "offscreen", type: "start", streamId, settings });
    chrome.action.setBadgeText({ text: "REC" });
    chrome.action.setBadgeBackgroundColor({ color: "#dc2626" });
  } catch (err) {
    console.error(err);
    if (await hasOffscreen()) await chrome.offscreen.closeDocument();
    const msg = String(err?.message || err);
    setTimeout(() => notifyPanel(
      msg.includes("capturing") ? "La pestaña ya se está capturando" : "No se pudo capturar la pestaña",
    ), 500);
  }
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.target === "background" && msg.type === "stopped") {
    chrome.action.setBadgeText({ text: "" });
    hasOffscreen().then((open) => open && chrome.offscreen.closeDocument());
  }
});
