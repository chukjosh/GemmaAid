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
const engineSelectEl = document.getElementById("engine-select");
const metaThemeColor = document.getElementById("meta-theme-color");
const toastContainer = document.getElementById("toast-container");

// Application State
let engine = null;
let engineName = "offline";
let history = [];
let audioEnabled = true;
let isInitializing = false;

// Configure Marked.js parser if available
if (typeof marked !== "undefined" && marked.setOptions) {
  marked.setOptions({
    breaks: true,
    gfm: true
  });
}

/**
 * Toast Notification System (Auto-disappears after specified timeout)
 * @param {string} message - Notification text
 * @param {string} type - 'info' | 'warning' | 'success' | 'danger'
 * @param {number} durationMs - Display time in milliseconds (default: 5000ms / 5s)
 */
function showToast(message, type = "info", durationMs = 5000) {
  if (!toastContainer) return;

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.role = "alert";
  toast.innerHTML = `
    <span class="toast-message">${message}</span>
    <button class="toast-close" aria-label="Close notification">&times;</button>
  `;

  // Manual dismissal button
  toast.querySelector(".toast-close").addEventListener("click", () => {
    toast.classList.add("fade-out");
    setTimeout(() => toast.remove(), 300);
  });

  toastContainer.appendChild(toast);

  // Trigger entrance animation frame
  requestAnimationFrame(() => toast.classList.add("show"));

  // Automatic removal fallback timer
  setTimeout(() => {
    if (toast.parentNode) {
      toast.classList.remove("show");
      toast.classList.add("fade-out");
      setTimeout(() => toast.remove(), 300);
    }
  }, durationMs);
}

/**
 * Audio Feedback Helper (Generates a soft chime sound on completion)
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
    /* Silent catch for browser WebAudio restrictions */
  }
}

/**
 * Updates the context memory usage indicator in the toolbar
 */
function updateMemoryMeter() {
  const totalSlots = MAX_TURNS * 2;
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
  if (isUser) {
    const div = document.createElement("div");
    div.textContent = content;
    return div.innerHTML;
  }

  let rawContent = content || "";

  let parsedHtml = rawContent;
  if (typeof marked !== "undefined" && typeof marked.parse === "function") {
    parsedHtml = marked.parse(rawContent);
  } else {
    parsedHtml = rawContent.replace(/\n/g, "<br>");
  }

  if (typeof DOMPurify !== "undefined" && typeof DOMPurify.sanitize === "function") {
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
 * Loads the WebGPU On-Device engine
 */
async function loadOnDeviceEngine() {
  if (statusTextEl) statusTextEl.textContent = "Checking WebGPU hardware support...";

  if (!(await browserEngine.isAvailable())) {
    throw new Error("WebGPU is not supported or enabled in this browser.");
  }

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
  showToast("Gemma loaded on-device via WebGPU", "success", 5000);
}

/**
 * Loads the Local Server API engine
 */
async function loadLocalServerEngine() {
  if (statusTextEl) statusTextEl.textContent = "Connecting to local Gemma server...";

  if (!(await serverEngine.isAvailable())) {
    throw new Error("Local backend server is unreachable. Is it running on localhost?");
  }

  await serverEngine.load();
  engine = serverEngine;
  engineName = "local-server";
  updateInputState(true, "Connected to local server. Type your message…");
  showToast("Connected to local Gemma server API", "info", 5000);
}

/**
 * Initializes or switches the AI engine based on user selection or auto-detection
 * @param {string} targetEngine - 'auto' | 'on-device' | 'local-server'
 */
async function switchEngine(targetEngine = "auto") {
  if (isInitializing) return;
  isInitializing = true;
  updateInputState(false, "Switching engine...");

  try {
    if (targetEngine === "on-device") {
      await loadOnDeviceEngine();
    } else if (targetEngine === "local-server") {
      await loadLocalServerEngine();
    } else {
      // Auto-detect mode: Try WebGPU first, then fall back to Local Server API
      try {
        await loadOnDeviceEngine();
      } catch (err) {
        console.warn("Auto-detect: WebGPU unavailable. Trying local server...", err);
        await loadLocalServerEngine();
      }
    }
  } catch (err) {
    console.error("Engine switch failed:", err);
    if (progressTrackEl) progressTrackEl.hidden = true;
    engine = null;
    engineName = "offline";
    if (statusTextEl) statusTextEl.textContent = "Model inactive or unreachable.";
    updateInputState(false, "Engine unavailable");
    appendSystemNotice(`⚠️ **Engine error:** ${err.message || "Failed to load requested engine."}`);
    showToast("Selected engine unreachable.", "warning", 5000);
  } finally {
    isInitializing = false;
    renderSignal();
    if (statusTextEl && engine) statusTextEl.textContent = "";
  }
}

/**
 * Appends a new chat message bubble into the log
 */
function appendMessage(role, content) {
  if (introEl && introEl.parentNode) introEl.remove();

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
  if (introEl && introEl.parentNode) introEl.remove();
  const notice = document.createElement("div");
  notice.className = "msg-system";
  notice.innerHTML = parseAndSanitizeMarkdown(content, false);
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
  showToast(`🚨 Urgent: ${reason}`, "danger", 5000);
}

/**
 * Core handler to process user message submissions
 */
async function handleSendMessage(text) {
  if (!text || !engine) {
    showToast("Engine not ready. Please wait for model initialization.", "warning", 5000);
    return;
  }

  appendMessage("user", text);
  history.push({ role: "user", content: text });

  if (history.length > MAX_TURNS * 2) {
    history = history.slice(-MAX_TURNS * 2);
    appendSystemNotice("ℹ️ *Older turns pruned automatically to preserve memory.*");
    showToast("Chat memory trimmed to preserve performance.", "info", 5000);
  }
  updateMemoryMeter();

  const emergency = detectEmergency(text);
  if (emergency) showEmergency(emergency.reason);

  if (statusTextEl) statusTextEl.textContent = "Gemma is thinking…";
  updateInputState(false, "Waiting for response…");

  try {
    const reply = await engine.chat(history);
    appendMessage("assistant", reply);
    history.push({ role: "assistant", content: reply });

    const replyEmergency = detectEmergency(reply);
    if (replyEmergency) showEmergency(replyEmergency.reason);
  } catch (err) {
    console.error("Inference Error:", err);
    appendSystemNotice("⚠️ **Response interrupted.** Please try again.");
    showToast("Failed to generate response. Check connection or engine status.", "danger", 5000);
  } finally {
    if (statusTextEl) statusTextEl.textContent = "";
    updateInputState(true, "Ask a follow-up or describe another symptom…");
    inputEl.focus();
  }
}

// Event Listeners

// Dropdown Switcher for Engine Selection
engineSelectEl?.addEventListener("change", (e) => {
  const selectedEngine = e.target.value;
  switchEngine(selectedEngine);
});

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
    } else if (!engine) {
      showToast("Engine is initializing. Please wait...", "warning", 5000);
    }
  }
});

// Clear Chat Session
clearBtn?.addEventListener("click", () => {
  history = [];
  messagesEl.innerHTML = "";
  if (bannerEl) bannerEl.hidden = true;
  appendSystemNotice("🧹 Session cleared. Context has been reset.");
  updateMemoryMeter();
  showToast("Session cleared successfully", "success", 5000);
});

// Sound / Audio Feedback Toggle
soundToggleBtn?.addEventListener("click", () => {
  audioEnabled = !audioEnabled;
  soundToggleBtn.style.opacity = audioEnabled ? "1" : "0.4";
  showToast(audioEnabled ? "Audio chime enabled" : "Audio chime muted", "info", 3000);
});

// Light/Dark Theme Switcher
themeToggleBtn?.addEventListener("click", () => {
  const isLight = document.documentElement.classList.toggle("light-mode");
  localStorage.setItem("theme", isLight ? "light" : "dark");
  if (metaThemeColor) {
    metaThemeColor.setAttribute("content", isLight ? "#f4f9f6" : "#070c0a");
  }
  showToast(`Switched to ${isLight ? "Light" : "Dark"} mode`, "info", 3000);
});

// Restore Theme Preference on Load
if (localStorage.getItem("theme") === "light") {
  document.documentElement.classList.add("light-mode");
  if (metaThemeColor) metaThemeColor.setAttribute("content", "#f4f9f6");
}

// Register Service Worker for PWA / Offline capability
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch((err) => {
      console.warn("ServiceWorker registration failed:", err);
    });
  });
}

// Initialize Application Engine with default auto-detect behavior
switchEngine("auto");