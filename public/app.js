import { detectEmergency } from "./prompt.js";
import * as browserEngine from "./inference-browser.js";
import * as serverEngine from "./inference-server.js";

// Global Configuration
const MAX_TURNS = 12; // Maximum prompt turn depth before memory pruning

// DOM Elements
const messagesEl = document.getElementById("messages");
const introEl = document.getElementById("intro");
const formEl = document.getElementById("chat-form");
const inputEl = document.getElementById("chat-input");
const sendBtn = document.getElementById("send-btn");
const bannerEl = document.getElementById("emergency-banner");
const emergencyTextEl = document.getElementById("emergency-text");
const signalEl = document.getElementById("signal");
const signalLabelEl = document.getElementById("signal-label");
const statusTextEl = document.getElementById("status-text");
const progressTrackEl = document.getElementById("status-progress");
const progressFillEl = document.getElementById("status-progress-fill");
const memoryTextEl = document.getElementById("memory-text");
const clearBtn = document.getElementById("clear-btn");
const soundToggleBtn = document.getElementById("sound-toggle");
const themeToggleBtn = document.getElementById("theme-toggle");
const metaThemeColor = document.getElementById("meta-theme-color");

// Application State
let engine = null;
let engineName = "";
let history = [];
let audioEnabled = true;

// Configure Marked.js parser if available
if (typeof marked !== "undefined") {
  marked.setOptions({
    breaks: true,
    gfm: true
  });
}

/**
 * Audio Feedback Helper (Generates a soft, non-intrusive sound on assistant completion)
 */
function playBeep() {
  if (!audioEnabled || !window.AudioContext) return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5 musical pitch
    gain.gain.setValueAtTime(0.04, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.00001, ctx.currentTime + 0.15);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.15);
  } catch (e) {
    /* Silent catch for browser WebAudio restrictions prior to user interaction */
  }
}

/**
 * Updates the context memory usage indicator in the toolbar
 */
function updateMemoryMeter() {
  const totalSlots = MAX_TURNS * 2; // Each turn consists of user + assistant message
  const usagePct = Math.min(100, Math.round((history.length / totalSlots) * 100));
  if (memoryTextEl) {
    memoryTextEl.textContent = `Memory: ${usagePct}% used (${history.length / 2}/${MAX_TURNS} turns)`;
  }
}

/**
 * Returns a clean local time string (e.g., 02:45 PM)
 */
function getTimeString() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/**
 * Formats Markdown responses safely using marked.js & DOMPurify
 */
function parseAndSanitizeMarkdown(content, isUser = false) {
  let formattedContent = content;

  if (!isUser) {
    // Add extra spacing for numbered lists in assistant medical steps
    formattedContent = formattedContent.replace(/(\s)(\d+\.\s+\*\*)/g, "\n\n$2");
    formattedContent = formattedContent.trim();
  }

  let parsedHtml = formattedContent;
  if (typeof marked !== "undefined") {
    parsedHtml = isUser ? marked.parseInline(formattedContent) : marked.parse(formattedContent);
  }

  if (typeof DOMPurify !== "undefined") {
    return DOMPurify.sanitize(parsedHtml);
  }
  return parsedHtml;
}

/**
 * Enables or disables user chat controls
 */
function updateInputState(enabled, placeholderText) {
  if (inputEl) {
    inputEl.disabled = !enabled;
    if (placeholderText) inputEl.placeholder = placeholderText;
  }
  if (sendBtn) {
    sendBtn.disabled = !enabled;
  }
}

/**
 * Picks and initializes the available AI engine (Browser WebGPU or Local Server)
 */
async function pickEngine() {
  if (statusTextEl) statusTextEl.textContent = "Checking AI model capabilities…";

  // Check 1: WebGPU On-Device Browser Engine
  if (await browserEngine.isAvailable()) {
    try {
      if (statusTextEl) statusTextEl.textContent = "Loading Gemma model into local WebGPU memory…";
      if (progressTrackEl) progressTrackEl.hidden = false;

      await browserEngine.load((progress) => {
        const pct = Math.round(progress * 100);
        if (statusTextEl) statusTextEl.textContent = `Downloading Gemma model: ${pct}%`;
        if (progressFillEl) progressFillEl.style.width = `${pct}%`;
      });

      if (progressTrackEl) progressTrackEl.hidden = true;
      engine = browserEngine;
      engineName = "on-device";
      updateInputState(true, "Ask Gemma about symptoms or first aid…");
      return;
    } catch (err) {
      console.warn("Browser on-device load failed:", err);
      if (progressTrackEl) progressTrackEl.hidden = true;
    }
  }

  // Check 2: Local Backend API Server Engine
  if (await serverEngine.isAvailable()) {
    try {
      await serverEngine.load();
      engine = serverEngine;
      engineName = "local-server";
      updateInputState(true, "Connected to local server. Type your message…");
      return;
    } catch (err) {
      console.warn("Local server engine error:", err);
    }
  }

  // Fallback: Engine Unavailable
  engineName = "offline";
  if (statusTextEl) statusTextEl.textContent = "Model inactive or unreachable.";
  updateInputState(false, "Engine unavailable");
  appendSystemNotice("⚠️ **Model inactive.** Please open in a WebGPU-compatible browser (Chrome 113+) or connect to a local backend server.");
}

/**
 * Updates the top signal badge UI
 */
function renderSignal() {
  if (!signalEl || !signalLabelEl) return;
  signalEl.classList.remove("on-device", "local-server", "offline");
  signalEl.classList.add(engineName);

  signalLabelEl.textContent =
    engineName === "on-device" ? "Gemma On-Device" :
      engineName === "local-server" ? "Local Server" : "Inactive";
}

/**
 * Appends a new chat message bubble into the log
 */
function appendMessage(role, content) {
  if (introEl) introEl.remove();

  const row = document.createElement("div");
  row.className = `msg-row ${role}`;

  const avatar = document.createElement("div");
  avatar.className = "msg-avatar";
  avatar.textContent = role === "user" ? "You" : "GA";

  const container = document.createElement("div");
  container.className = "msg-container";

  const bubble = document.createElement("div");
  bubble.className = "msg-bubble";
  bubble.innerHTML = parseAndSanitizeMarkdown(content, role === "user");

  const meta = document.createElement("div");
  meta.className = "msg-meta";
  meta.textContent = `${role === "user" ? "You" : "Gemma"} • ${getTimeString()}`;

  container.appendChild(bubble);
  container.appendChild(meta);
  row.appendChild(avatar);
  row.appendChild(container);

  messagesEl.appendChild(row);
  messagesEl.scrollTop = messagesEl.scrollHeight;

  if (role === "assistant") playBeep();
}

/**
 * Appends system notifications or warn badges
 */
function appendSystemNotice(content) {
  if (introEl) introEl.remove();
  const notice = document.createElement("div");
  notice.className = "msg-system";
  notice.innerHTML = parseAndSanitizeMarkdown(content, true);
  messagesEl.appendChild(notice);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

/**
 * Displays red-flag emergency alert banner at top
 */
function showEmergency(reason) {
  if (!bannerEl) return;
  bannerEl.hidden = false;
  if (emergencyTextEl) {
    emergencyTextEl.textContent = `🚨 Critical Symptoms Detected: ${reason}`;
  }
}

/**
 * Core handler to process user message submissions
 */
async function handleSendMessage(text) {
  if (!text || !engine) return;

  appendMessage("user", text);
  history.push({ role: "user", content: text });

  // Check & prune memory when exceeding MAX_TURNS limit
  if (history.length > MAX_TURNS * 2) {
    history = history.slice(-MAX_TURNS * 2);
    appendSystemNotice("ℹ️ *Older turns pruned automatically to preserve context memory.*");
  }
  updateMemoryMeter();

  // Scan input for life-threatening keywords
  const emergency = detectEmergency(text);
  if (emergency) showEmergency(emergency.reason);

  if (statusTextEl) statusTextEl.textContent = "Gemma is thinking…";
  updateInputState(false, "Waiting for response…");

  try {
    const reply = await engine.chat(history);
    appendMessage("assistant", reply);
    history.push({ role: "assistant", content: reply });

    // Also scan assistant reply for secondary red flags
    const replyEmergency = detectEmergency(reply);
    if (replyEmergency) showEmergency(replyEmergency.reason);
  } catch (err) {
    console.error("Inference Error:", err);
    appendSystemNotice("⚠️ **Response interrupted.** Please rephrase or submit your query again.");
  } finally {
    if (statusTextEl) statusTextEl.textContent = "";
    updateInputState(true, "Ask a follow-up or describe another symptom…");
    inputEl.focus();
  }
}

// Event Listeners

// Chat Form Submit
formEl.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = inputEl.value.trim();
  if (text) {
    inputEl.value = "";
    handleSendMessage(text);
  }
});

// Quick Shortcut Chips
document.addEventListener("click", (e) => {
  if (e.target.classList.contains("chip")) {
    const prompt = e.target.getAttribute("data-prompt");
    if (prompt && engine) {
      handleSendMessage(prompt);
    }
  }
});

// Clear Chat Session
clearBtn?.addEventListener("click", () => {
  history = [];
  messagesEl.innerHTML = "";
  if (bannerEl) bannerEl.hidden = true;
  appendSystemNotice("🧹 **Session cleared.** Chat context has been reset.");
  updateMemoryMeter();
});

// Sound / Audio Feedback Toggle
soundToggleBtn?.addEventListener("click", () => {
  audioEnabled = !audioEnabled;
  soundToggleBtn.style.opacity = audioEnabled ? "1" : "0.4";
});

// Light/Dark Theme Switcher
themeToggleBtn?.addEventListener("click", () => {
  const isLight = document.documentElement.classList.toggle("light-mode");
  localStorage.setItem("theme", isLight ? "light" : "dark");
  if (metaThemeColor) {
    metaThemeColor.setAttribute("content", isLight ? "#f4f9f6" : "#070c0a");
  }
});

// Register Service Worker for PWA / Offline capability
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch((err) => {
      console.warn("ServiceWorker registration failed:", err);
    });
  });
}

// Initialize Application Engine
pickEngine().then(renderSignal);