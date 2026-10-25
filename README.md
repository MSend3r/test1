# Room Redesigner

Take photos of a space, answer a few questions about what you want (goals, style, budget, comfort, constraints), and get a complete redesign plan: assessment, design concept with palette, budget breakdown, phased task list, shopping list, and fallbacks if the budget is tight.

## Run it

Needs Node 20.12 or newer. No `npm install`; there are no dependencies.

```bash
cp .env.example .env     # optional: add your ANTHROPIC_API_KEY
npm start                # or: node server.js
```

Open http://localhost:3000. On a phone, use your computer's LAN address; "Take photo" opens the camera.

- **With `ANTHROPIC_API_KEY`**: photos and answers go to Claude (`CLAUDE_MODEL`, default `claude-sonnet-5-5`), which returns a plan grounded in what's visible in the photos.
- **Without a key**: demo mode builds a rule-based plan from your answers only (photos are not analysed), so you can try the full flow.

## How it works

1. `public/` is a no-build frontend: a 4-step wizard (photos, goals and style, budget and comfort, constraints). Photos are downscaled to 1280px JPEG in the browser before upload.
2. `server.js` validates input, sends images and answers to the Claude Messages API, parses the JSON plan, and normalises it (totals are recomputed from the budget breakdown so they always add up).
3. The plan page supports task checkboxes, print / save as PDF, and copy as text.

## Notes

- Photos are sent to the server only to generate the plan and are not stored.
- Cost figures are estimates, not quotes. Check local prices and permit rules before buying or building.
- Camera capture needs HTTPS or localhost on most mobile browsers.
