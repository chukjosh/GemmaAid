import { detectEmergency } from "./prompt.js";
import * as browserEngine from "./inference-browser.js";
import * as serverEngine from "./inference-server.js";

// Configure marked if available, with safe fallback defaults
if (typeof marked !== "undefined") {
  marked.setOptions({
    breaks: true, // newlines become <br> inside paragraphs
    gfm: true, // GitHub Flavoured Markdown (tables, lists, bold, etc.)
  });
}

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
  if (statusEl) statusEl.textContent = "Checking device capabilities…";

  if (await browserEngine.isAvailable()) {
    try {
      if (statusEl) statusEl.textContent = "Loading on-device model (first run only)…";
      await browserEngine.load((progress) => {
        if (statusEl) statusEl.textContent = `Downloading model: ${Math.round(progress * 100)}%`;
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
  if (!signalEl || !signalLabelEl) return;

  signalEl.classList.remove("on-device", "local-server", "offline");
  signalEl.classList.add(engineName);

  signalLabelEl.textContent =
    engineName === "on-device"
      ? "On-device — no server needed"
      : engineName === "local-server"
        ? "Local server (Ollama + Gemma)"
        : "Not connected";

  if (statusEl) {
    statusEl.textContent =
      engineName === "offline"
        ? "Connect once to download the on-device model, or start the local server."
        : "";
  }
}

function parseAndSanitizeMarkdown(content, isUser = false) {
  let formattedContent = content;

  if (!isUser) {
    // 1. Force double line breaks before numbered items like " 1. ", " 2. "
    formattedContent = formattedContent.replace(/(\s)(\d+\.\s+\*\*)/g, "\n\n$2");

    // 2. Force double line breaks before bold titles or headers like " **Disclaimer:**" or " **Here's"
    formattedContent = formattedContent.replace(/(\.\s+|\!\s+)(\*\*[^*]+\*\*:?)/g, "$1\n\n$2");

    // 3. Clean up extra spacing
    formattedContent = formattedContent.trim();
  }

  let parsedHtml = formattedContent;

  // Use marked parser if available
  if (typeof marked !== "undefined") {
    parsedHtml = isUser ? marked.parseInline(formattedContent) : marked.parse(formattedContent);
  }

  // Use DOMPurify if loaded
  if (typeof DOMPurify !== "undefined") {
    return DOMPurify.sanitize(parsedHtml);
  }

  return parsedHtml;
}

function appendMessage(role, content) {
  if (introEl) introEl.remove();
  const el = document.createElement("div");
  el.className = `msg msg-${role}`;

  const raw = parseAndSanitizeMarkdown(content, role === "user");

  el.innerHTML = raw;
  messagesEl.appendChild(el);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function showEmergency(reason) {
  if (!bannerEl) return;
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

  if (statusEl) statusEl.textContent = "Thinking…";

  // Show visual typing indicator
  const typingIndicator = document.createElement("div");
  typingIndicator.className = "msg msg-assistant msg-typing";
  typingIndicator.id = "typing-indicator";
  typingIndicator.innerHTML = '<span class="dot"></span><span class="dot"></span><span class="dot"></span>';
  messagesEl.appendChild(typingIndicator);
  messagesEl.scrollTop = messagesEl.scrollHeight;

  try {
    const reply = await engine.chat(history);

    // Remove visual typing indicator
    const indicatorEl = document.getElementById("typing-indicator");
    if (indicatorEl) indicatorEl.remove();

    appendMessage("assistant", reply);
    history.push({ role: "assistant", content: reply });

    const replyEmergency = detectEmergency(reply);
    if (replyEmergency) showEmergency(replyEmergency.reason);
  } catch (err) {
    // Remove visual typing indicator
    const indicatorEl = document.getElementById("typing-indicator");
    if (indicatorEl) indicatorEl.remove();

    appendMessage("assistant", "Something went wrong reaching the model. Please try again.");
    console.error(err);
  } finally {
    if (engineName !== "offline" && statusEl) statusEl.textContent = "";
    inputEl.focus();
  }
});

pickEngine().then(renderSignal);

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch((err) => {
    console.warn("ServiceWorker registration failed:", err);
  });
}

// Theme Toggle Handler
const themeToggleBtn = document.getElementById("theme-toggle");
const metaThemeColor = document.getElementById("meta-theme-color");

themeToggleBtn?.addEventListener("click", () => {
  const isLight = document.documentElement.classList.toggle("light-mode");

  // Save preference
  localStorage.setItem("theme", isLight ? "light" : "dark");

  // Update mobile status bar theme color
  if (metaThemeColor) {
    metaThemeColor.setAttribute("content", isLight ? "#f4f9f6" : "#070c0a");
  }
});
