import { detectEmergency } from "./prompt.js";
import * as browserEngine from "./inference-browser.js";
import * as serverEngine from "./inference-server.js";

const messagesEl = document.getElementById("messages");
const introEl = document.getElementById("intro");
const formEl = document.getElementById("chat-form");
const inputEl = document.getElementById("chat-input");
const bannerEl = document.getElementById("emergency-banner");
const signalEl = document.getElementById("signal");
const signalLabelEl = document.getElementById("signal-label");
const statusEl = document.getElementById("status");

let engine = null;
let engineName = "";
let history = [];

async function pickEngine() {
  statusEl.textContent = "Checking device capabilities…";

  if (await browserEngine.isAvailable()) {
    try {
      statusEl.textContent = "Loading on-device model (first run only)…";
      await browserEngine.load((progress) => {
        statusEl.textContent = `Downloading model: ${Math.round(progress * 100)}%`;
      });
      engine = browserEngine;
      engineName = "on-device";
      return;
    } catch (err) {
      console.warn("In-browser engine failed to load, falling back:", err);
    }
  }

  if (await serverEngine.isAvailable()) {
    await serverEngine.load();
    engine = serverEngine;
    engineName = "local-server";
    return;
  }

  engineName = "offline";
}

function renderSignal() {
  signalEl.classList.remove("on-device", "local-server", "offline");
  signalEl.classList.add(engineName);

  signalLabelEl.textContent =
    engineName === "on-device"
      ? "On-device — no server needed"
      : engineName === "local-server"
      ? "Local server (Ollama + Gemma 4)"
      : "Not connected";

  statusEl.textContent =
    engineName === "offline"
      ? "Connect once to download the on-device model, or start the local server."
      : "";
}

function appendMessage(role, content) {
  if (introEl) introEl.remove();
  const el = document.createElement("div");
  el.className = `msg msg-${role}`;
  el.textContent = content;
  messagesEl.appendChild(el);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function showEmergency(reason) {
  bannerEl.hidden = false;
  bannerEl.textContent = `Seek emergency care immediately — flagged: ${reason}`;
}

formEl.addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = inputEl.value.trim();
  if (!text || !engine) return;

  inputEl.value = "";
  appendMessage("user", text);
  history.push({ role: "user", content: text });

  // Immediate client-side safety net — don't wait on the model to react
  // to an obvious emergency phrase.
  const emergency = detectEmergency(text);
  if (emergency) showEmergency(emergency.reason);

  statusEl.textContent = "Thinking…";
  try {
    const reply = await engine.chat(history);
    appendMessage("assistant", reply);
    history.push({ role: "assistant", content: reply });

    const replyEmergency = detectEmergency(reply);
    if (replyEmergency) showEmergency(replyEmergency.reason);
  } catch (err) {
    appendMessage("assistant", "Something went wrong reaching the model. Please try again.");
    console.error(err);
  } finally {
    if (engineName !== "offline") statusEl.textContent = "";
  }
});

pickEngine().then(renderSignal);

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js");
}
