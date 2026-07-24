// inference-server.js
// Dual-tier Server Inference:
// Tier 1: Local FastAPI backend (/api/chat & /api/health)
// Tier 2: Remote Render backend (https://gemmaaid.onrender.com)

const LOCAL_HEALTH_URL = "/api/health";
const LOCAL_CHAT_URL = "/api/chat";
const RENDER_BASE_URL = "https://gemmaaid.onrender.com";

// Remembers which backend endpoint proved available
let activeBackend = null; // "local" | "render" | null

/**
 * Checks if either the local server or the remote Render server is online.
 * Prioritizes local first, then fails over to Render.
 */
export async function isAvailable() {
  // 1. Try Local Server first
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000); // Fast 2s local check

    const res = await fetch(LOCAL_HEALTH_URL, {
      method: "GET",
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      activeBackend = "local";
      console.log("Server Engine: Connected to Local API Server");
      return true;
    }
  } catch (err) {
    console.warn("Local API server unreachable, checking Render fallback...", err);
  }

  // 2. Fallback to Render Service
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000); // 8s check for Render cold starts

    const res = await fetch(`${RENDER_BASE_URL}/docs`, {
      method: "GET",
      signal: controller.signal,
      mode: "cors"
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      activeBackend = "render";
      console.log("Server Engine: Connected to Render Remote API");
      return true;
    }
  } catch (err) {
    console.warn("Render backend health check failed:", err);
  }

  activeBackend = null;
  return false;
}

/**
 * Placeholder initialization step for engine compatibility.
 */
export async function load() {
  return true;
}

/**
 * Sends chat history to whichever server backend is active (Local API first, Render fallback second).
 */
export async function chat(history) {
  // If no backend was previously detected, perform a quick availability check
  if (!activeBackend) {
    const available = await isAvailable();
    if (!available) {
      throw new Error("Neither local backend nor Render API server are reachable.");
    }
  }

  // Determine endpoint URL & options based on resolved active backend
  const targetUrl = activeBackend === "local" 
    ? LOCAL_CHAT_URL 
    : `${RENDER_BASE_URL}/api/chat`;

  try {
    const res = await fetch(targetUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: history })
    });

    if (!res.ok) {
      throw new Error(`Server returned HTTP ${res.status}`);
    }

    const data = await res.json();
    return data.reply || data.response || data.choices?.[0]?.message?.content || data;
  } catch (err) {
    // If local attempt failed mid-chat, attempt automatic failover to Render
    if (activeBackend === "local") {
      console.warn("Local API failed during chat call. Retrying with Render fallback...", err);
      activeBackend = "render";
      return chat(history); // Retry once against Render
    }
    throw err;
  }
}