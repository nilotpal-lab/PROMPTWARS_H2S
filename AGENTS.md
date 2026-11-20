# Rules for AI coding agents

1. **`engine.js` is the single source of truth for every delay, passenger and crew number.** Never recompute these in the UI or server. Import `simulate`, `recommend`, `explainFlight`.
2. Do not edit `engine.js` or `flight_network.json` unless the task is explicitly about simulation rules. If you do, run `npm test` and update `README.md` assumptions.
3. **The AI never produces numbers.** LLM output uses `{{placeholders}}` resolved by `server/dispatcher.js`. Do not weaken `validateNarrative()` or `auditNumbers()`.
4. Never expose the repo root over HTTP and never put `GEMINI_API_KEY` in client code. The API key stays in `.env` (gitignored).
5. The UI must render only what the API/engine returns. Show the verification badge (`verification.source`, `numbersVerifiedAgainstEngine`).
6. Keep the app fully functional without a Gemini key (deterministic fallback).
7. Vanilla JS ES modules; no TypeScript, no build step, no heavy frameworks. Dependencies: `express`, `dotenv` only.
8. Before finishing any change: `npm test` must pass (19 tests).
9. Design changes are visual only; do not alter logic when polishing.
