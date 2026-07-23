// Shared system prompt + emergency keyword logic, used identically by both
// the in-browser engine and the server engine, so behavior doesn't drift
// between the two modes.

export const SYSTEM_PROMPT = `You are GemmaAid, a first-aid and general health information
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
   4) the disclaimer.`;

// Lightweight client-side keyword check used to trigger the UI banner
// immediately, without waiting on the model — this works the same whether
// we're running in-browser or via the server, and acts as a safety net in
// case the model itself doesn't call out the emergency clearly.
const EMERGENCY_PATTERNS = [
  /chest (pain|pressure|tightness)/i,
  /(can't|cannot|difficulty) breath/i,
  /severe bleeding/i,
  /(face|arm).{0,15}(droop|weak|numb)/i,
  /slurred speech/i,
  /unconscious|passed out|unresponsive/i,
  /swelling.{0,15}(face|throat|lips)/i,
  /seizure/i,
  /poison|overdose/i,
  /heavy bleeding.{0,15}pregnan|pregnan.{0,15}heavy bleeding/i,
];

export function detectEmergency(text) {
  for (const pattern of EMERGENCY_PATTERNS) {
    const match = text.match(pattern);
    if (match) return { reason: match[0], severity: "critical" };
  }
  return null;
}
