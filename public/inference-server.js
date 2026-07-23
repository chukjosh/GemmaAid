// Server-mode inference: calls the local FastAPI backend, which runs
// Gemma 4 via Ollama. Used as a fallback when the device can't run the
// model in-browser (no WebGPU, too little RAM), or during the hackathon
// demo where a controlled server is more reliable than venue-laptop WebGPU.

const API_URL = "/api/chat"; // FastAPI served on the same origin, see server/main.py

export async function isAvailable() {
  try {
    const res = await fetch("/api/health", { method: "GET" });
    return res.ok;
  } catch {
    return false; // server not reachable – e.g. truly offline with no local server
  }
}

export async function load() {
  // No local load step needed – the model already lives on the server.
  return true;
}

export async function chat(history) {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: history }),
  });
  if (!res.ok) throw new Error("Server inference failed");
  const data = await res.json();
  return data.reply;
}
