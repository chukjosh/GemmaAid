# GemmaAid – Setup & Run Guide

This guide covers everything needed to set up and run GemmaAid, in order.
Steps 1–4 require internet for the initial downloads; after that, the app
runs fully offline.

---

## 1. Requirements

| Tool | Purpose | Install |
|---|---|---|
| **Ollama** | Runs Gemma 4 locally, serves it to the backend | https://ollama.com/download |
| **Python 3.10+** | Runs the FastAPI fallback server (venv module included) | usually preinstalled on Mac/Linux; python.org for Windows |
| **A modern Chrome/Edge browser** | Required for WebGPU (on-device mode) | already present on most laptops |
| **Node.js (optional)** | Only needed for an alternate static-file dev server | https://nodejs.org |

No build tooling (Docker, React, Webpack, Ionic, Capacitor) is required for
this build – the PWA is plain HTML/JS by design, so there is nothing to
compile.

---

## 2. Pull the Gemma 4 model

```bash
ollama pull gemma4
```

This downloads the model once. After this, `ollama serve` works with zero
internet.

Verify it works:
```bash
ollama run gemma4 "Say hello in one sentence."
```

> If `gemma4` is not the exact tag available in Ollama's library, check
> `ollama list` or https://ollama.com/library for the current tag name and
> update `MODEL_NAME` in `server/main.py` accordingly.

---

## 3. Run the server (fallback / demo mode)

```bash
cd server
python3 -m venv venv
source venv/bin/activate      # on Windows: venv\Scripts\activate
pip install -r requirements.txt --break-system-packages
```

The virtual environment keeps these dependencies isolated from other
Python projects on the same machine. It needs to be activated
(`source venv/bin/activate`) in every new terminal session before running
the server.

In one terminal:
```bash
ollama serve
```

In another terminal:
```bash
cd server
uvicorn main:app --host 0.0.0.0 --port 8000
```

Open **http://localhost:8000** to see the GemmaAid interface. This single
server both serves the PWA files and answers `/api/chat` requests.

To make it reachable from other devices on the same network, find the
host machine's local IP (`ipconfig` on Windows, `ifconfig` or
`ipconfig getifaddr en0` on Mac) and share `http://<host-ip>:8000`.

---

## 4. Set up on-device mode (optional)

This is the fully offline, no-server path. It requires a Gemma model
converted to MediaPipe's `.task` format, placed at:
```
public/models/gemma3-1b-it-int4-web.task
```

Steps:
1. Obtain a compatible quantized Gemma model file following Google's
   MediaPipe LLM Inference for Web documentation.
2. Place the `.task` file at the path above.
3. Serve `public/` as static files (the FastAPI server already does this,
   as long as `models/` sits inside `public/`).
4. Open the app in a WebGPU-enabled browser with an internet connection
   for the first load only – the model downloads once and is cached.
5. Reload with the network disabled to confirm it still works.

If this step isn't completed, server mode remains fully functional on its
own – the architecture is designed so either mode works independently.

> **Do not commit the `.task` model file to the repository.** It is a
> multi-gigabyte binary and the hackathon requires a public code
> repository – committing it will make the repo unusable to clone and may
> exceed size limits on GitHub. `.gitignore` already excludes it. Instead,
> document where to obtain the model (source/link) in the write-up or a
> comment in `inference-browser.js`, so anyone reviewing the code knows
> how to reproduce on-device mode without the file being tracked.

---

## 5. Quick reference

```bash
# Terminal 1
ollama serve

# Terminal 2
cd server
source venv/bin/activate      # on Windows: venv\Scripts\activate
uvicorn main:app --host 0.0.0.0 --port 8000
```

Then open `http://localhost:8000`.

---

## 6. Testing the guardrails

| Input | Expected behavior |
|---|---|
| "I have a mild headache and slight fever" | Structured guidance + disclaimer, no emergency banner |
| "My chest hurts and I can't breathe" | Emergency banner appears immediately, via the client-side check |
| "What dose of paracetamol should I take?" | The model should decline to give a specific dose and suggest a health worker or pharmacist instead |

If the emergency banner does not fire as expected, check
`public/prompt.js` – `EMERGENCY_PATTERNS` is a plain keyword/regex list
that can be extended.

---

## 7. Installing as a PWA

On Chrome/Edge desktop: address bar → install icon (or menu → "Install
GemmaAid"). On Android Chrome: menu → "Add to Home screen." This turns the
site into an installed app with one action.

---

## 8. Troubleshooting

- **"Connection refused" in the browser** – Ollama or the uvicorn server
  isn't running; check both terminals.
- **Slow responses** – expected on CPU-only hardware; a quantized
  on-device model or GPU acceleration would reduce latency in production.
- **WebGPU not available** – expected on some laptops or older browser
  versions; this is the reason the server fallback exists.
- **`pip install` fails without `--break-system-packages`** – this flag is
  required on newer Debian/Ubuntu-based systems.

---

## 9. Demo checklist

1. Open the installed PWA.
2. Submit a mild-symptom question – confirm calm, structured, non-diagnostic guidance.
3. Submit an emergency-symptom question – confirm the banner fires immediately.
4. Point out the signal indicator and explain the two-engine architecture.
5. If on-device mode is set up, disable the network and repeat step 2.
