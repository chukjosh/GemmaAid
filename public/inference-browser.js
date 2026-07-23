// In-browser inference using MediaPipe's LLM Inference API.
// Model runs entirely on-device via WebGPU — no server, no network calls
// after the model file is downloaded and cached once.
//
// Requires a quantized Gemma model file (.task/.bin format for MediaPipe).
// Host it yourself or point MODEL_URL at a public model asset.
// See: https://ai.google.dev/edge/mediapipe/solutions/genai/llm_inference/web_js

import { SYSTEM_PROMPT } from "./prompt.js";

const MODEL_URL = "/models/gemma3-1b-it-int4-web.task"; // swap for your hosted model file

let llmInference = null;

export async function isAvailable() {
  // Rough capability check: WebGPU + enough device memory to be worth trying.
  if (!("gpu" in navigator)) return false;
  const memGB = navigator.deviceMemory || 0; // Chrome-only hint, not guaranteed
  return memGB === 0 || memGB >= 4; // if unknown, allow the attempt
}

export async function load(onProgress) {
  const { FilesetResolver, LlmInference } = await import(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-genai@latest"
  );

  const genaiFileset = await FilesetResolver.forGenAiTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-genai@latest/wasm"
  );

  llmInference = await LlmInference.createFromOptions(genaiFileset, {
    baseOptions: { modelAssetPath: MODEL_URL },
    maxTokens: 2048,
    topK: 40,
    temperature: 0.6,
    // onProgress fires during the (one-time) model download so the UI
    // can show a real progress bar instead of a spinner.
    onProgress,
  });
}

export async function chat(history) {
  if (!llmInference) throw new Error("Model not loaded yet");

  // Keep only the most recent 6 messages to save context room
  const recentHistory = history.slice(-6);

  // Clearly delineate the instructions from the user's input so Gemma 
  // doesn't treat system guidelines as current symptoms.
  const turns = recentHistory.map((m, index) => {
    let content = m.content;

    if (index === 0 && m.role === "user") {
      content = `[System Instructions: ${SYSTEM_PROMPT}]\n\n[User Input: ${m.content}]`;
    }

    const turnRole = m.role === "user" ? "user" : "model";
    return `<start_of_turn>${turnRole}\n${content}<end_of_turn>`;
  });

  const fullPrompt = `${turns.join("\n")}\n<start_of_turn>model\n`;

  const result = await llmInference.generateResponse(fullPrompt);
  return result;
}