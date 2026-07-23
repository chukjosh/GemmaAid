"""
GemmaAid backend – serves the PWA and provides the /api/chat
fallback used when a device can't run Gemma 4 in-browser.

This complements the in-browser MediaPipe engine rather than competing
with it: the PWA tries on-device inference first, and only calls this
server if the device lacks WebGPU/enough RAM. Run this on a laptop at the
venue (or any local machine on the same network) as a safety net.

Setup:
    ollama pull gemma4
    ollama serve &
    pip install fastapi uvicorn ollama --break-system-packages
    uvicorn main:app --host 0.0.0.0 --port 8000

Then open http://<this-machine-ip>:8000 on any device on the same network
(no internet needed beyond the initial `ollama pull`).
"""

import re
from pathlib import Path

import ollama
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel

MODEL_NAME = "gemma3:1b"

SYSTEM_PROMPT = """You are GemmaAid, a first-aid and general health information
assistant designed to run fully offline for communities with limited or no
internet access and limited access to nearby clinics.

STRICT RULES:
1. You are NOT a doctor and NEVER give a diagnosis. Use language like
   "this could be consistent with..." not "you have...".
2. NEVER give medication dosing instructions.
3. ALWAYS end every response with a short reminder that this is general
   information, not a medical diagnosis, and a health worker or clinic
   should be consulted when possible.
4. If the user describes possible emergency symptoms (chest pain, trouble
   breathing, severe bleeding, stroke signs, loss of consciousness, severe
   allergic reaction, a child with very high fever or seizures, suspected
   poisoning, severe pregnancy complications) you MUST clearly say to seek
   urgent/emergency care immediately, first, before anything else.
5. Never downplay symptoms. When in doubt, recommend in-person care.
6. Keep responses short and structured: 1) what it might involve in plain
   terms, 2) home-care steps if appropriate, 3) red flags for seeking care,
   4) the disclaimer."""

app = FastAPI()

PUBLIC_DIR = Path(__file__).parent.parent / "public"


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage]


@app.get("/api/health")
def health():
    return {"status": "ok", "model": MODEL_NAME}


@app.post("/api/chat")
def chat(req: ChatRequest):
    messages = [{"role": "system", "content": SYSTEM_PROMPT}] + [
        {"role": m.role, "content": m.content} for m in req.messages
    ]
    response = ollama.chat(model=MODEL_NAME, messages=messages)
    return {"reply": response["message"]["content"]}


# Serve the PWA itself so the whole app works from one server during
# the demo – no separate frontend host needed.
app.mount("/", StaticFiles(directory=PUBLIC_DIR, html=True), name="static")
