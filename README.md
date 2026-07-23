# GemmaAid

**Health guidance that works without a signal.**

A Gemma-powered offline health information PWA, built with two
complementary inference modes so the app works across device capability
levels.

Track: **Healthcare & Well-being**

For setup and run instructions, see [`GUIDE.md`](./GUIDE.md).

## Problem

People far from a clinic, with limited or no internet access, often have
no reliable way to know whether a symptom needs urgent care or can be
managed at home. GemmaAid provides plain-language health guidance and
clear escalation prompts, running entirely offline once set up.

## Why two inference modes

Devices in low-connectivity settings vary widely in capability. An
in-browser-only approach excludes low-end phones without WebGPU; a
server-only approach isn't truly offline or portable. GemmaAid selects the
best available option automatically:

1. **On-device** – MediaPipe LLM Inference running Gemma 4 in the browser
   via WebGPU. The model downloads once, then runs with zero network and
   zero server, indefinitely.
2. **Local server** – FastAPI + Ollama + Gemma 4, for devices that can't
   run the model in-browser. Still no internet required – only a nearby
   machine on the same local network.

A signal indicator in the header shows which mode is active in real time,
reflecting how the app is actually running rather than a static label.

## How Gemma 4 is used

- On-device model (E2B/E4B) via MediaPipe's LLM Inference API
- Native system-role support for guardrails (no diagnosis, no dosing,
  always escalate uncertain cases)
- A single shared guardrail prompt used by both engines, so behavior is
  identical regardless of which mode is active

## Project structure

```
public/                     the PWA (works standalone as a static site)
  index.html
  app.js                    selects engine, drives chat + emergency banner
  inference-browser.js      MediaPipe / on-device engine
  inference-server.js       calls the FastAPI fallback
  prompt.js                 shared system prompt + emergency keyword check
  sw.js                     service worker – caches the app shell offline
  styles.css                visual design
  manifest.json
server/
  main.py                   FastAPI app: serves the PWA + /api/chat via Ollama
GUIDE.md                    setup, run, and demo instructions
```

## Guardrails

- Never diagnoses – uses "could be consistent with" language
- Never gives medication dosing
- Every response ends with a disclaimer
- A client-side keyword check flags obvious emergencies immediately,
  without waiting on the model, in both inference modes

## Possible extensions

- Local-language output (Yoruba / Hausa / Igbo)
- Voice input via Gemma 4's native audio support on E2B/E4B
- Packaging with Capacitor for app-store distribution
