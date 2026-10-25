// Zero-dependency server: Node >= 20.12 (built-in http, fetch, loadEnvFile).
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildDemoPlan } from "./demoPlan.js";

try { process.loadEnvFile(); } catch { /* no .env file, that's fine */ }

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, "public");
const PORT = Number(process.env.PORT) || 3000;
const MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-5-5";
const API_KEY = process.env.ANTHROPIC_API_KEY || "";
const MAX_PHOTOS = 6;
const MAX_BODY = 30 * 1024 * 1024;
const IMG_RE = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/;

const MIME = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon" };

const SYSTEM = `You are an experienced interior designer and project planner. The user sends photos of a space they want to redesign plus their goals, budget and comfort priorities.
Study the photos closely: layout, furniture, lighting, colours, clutter, windows, flooring, problems. Then produce a complete, realistic, actionable redesign plan.
Rules:
- Ground observations in what is visible in the photos. Do not invent features you cannot see; say when something is unclear.
- Respect the budget. Costs are in US dollars. The sum of budget_breakdown must not exceed the budget and should include a contingency line of about 5-10%.
- Respect constraints: renter vs owner, DIY level, items to keep, timeline.
- Prefer high-impact, low-cost changes first. Order phases logically.
- Be specific: name item types, sizes or materials, and approximate prices. No vague advice.
- Reply with a single JSON object and nothing else (no markdown fences).`;

const SCHEMA = `{
  "summary": "2-3 sentence overview of the plan",
  "space_assessment": { "observations": ["what you see"], "issues": ["problems to fix"] },
  "design_concept": { "name": "short name", "description": "1-2 sentences", "palette": [{"name":"", "hex":"#RRGGBB"}], "materials": [""] },
  "phases": [ { "name": "", "timeframe": "", "tasks": [ { "task": "", "cost": 0, "diy": true } ] } ],
  "shopping_list": [ { "item": "", "qty": "", "est_cost": 0, "priority": "high|medium|low", "notes": "" } ],
  "budget_breakdown": [ { "category": "", "amount": 0 } ],
  "total_estimate": 0,
  "timeline": "overall duration",
  "comfort_upgrades": [""],
  "watch_outs": ["risks, permits, lead times, lease issues"],
  "if_budget_tight": [""],
  "if_budget_grows": [""]
}`;

function validate(body) {
  const { photos, answers } = body || {};
  if (!Array.isArray(photos) || photos.length < 1) return "Add at least one photo.";
  if (photos.length > MAX_PHOTOS) return `Use at most ${MAX_PHOTOS} photos.`;
  if (!photos.every((p) => typeof p === "string" && IMG_RE.test(p))) return "Photos must be JPEG, PNG or WebP.";
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) return "Missing answers.";
  return null;
}

function extractJson(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("Model did not return JSON");
  return JSON.parse(text.slice(start, end + 1));
}

const arr = (v) => (Array.isArray(v) ? v : []);
const num = (v) => (Number.isFinite(Number(v)) ? Math.max(0, Number(v)) : 0);

// Make sure the shape is safe to render and the totals add up.
export function normalize(p) {
  const breakdown = arr(p.budget_breakdown).map((b) => ({ category: String(b?.category ?? ""), amount: num(b?.amount) }));
  return {
    summary: String(p.summary ?? ""),
    space_assessment: { observations: arr(p.space_assessment?.observations).map(String), issues: arr(p.space_assessment?.issues).map(String) },
    design_concept: {
      name: String(p.design_concept?.name ?? "Your redesign"),
      description: String(p.design_concept?.description ?? ""),
      palette: arr(p.design_concept?.palette)
        .map((c) => ({ name: String(c?.name ?? ""), hex: /^#[0-9a-f]{6}$/i.test(c?.hex) ? c.hex : "#cccccc" }))
        .slice(0, 8),
      materials: arr(p.design_concept?.materials).map(String),
    },
    phases: arr(p.phases).map((ph) => ({
      name: String(ph?.name ?? ""),
      timeframe: String(ph?.timeframe ?? ""),
      tasks: arr(ph?.tasks).map((t) => ({ task: String(t?.task ?? ""), cost: num(t?.cost), diy: t?.diy !== false })),
    })),
    shopping_list: arr(p.shopping_list).map((s) => ({
      item: String(s?.item ?? ""), qty: String(s?.qty ?? ""), est_cost: num(s?.est_cost),
      priority: ["high", "medium", "low"].includes(s?.priority) ? s.priority : "medium", notes: String(s?.notes ?? ""),
    })),
    budget_breakdown: breakdown,
    total_estimate: breakdown.reduce((sum, b) => sum + b.amount, 0),
    timeline: String(p.timeline ?? ""),
    comfort_upgrades: arr(p.comfort_upgrades).map(String),
    watch_outs: arr(p.watch_outs).map(String),
    if_budget_tight: arr(p.if_budget_tight).map(String),
    if_budget_grows: arr(p.if_budget_grows).map(String),
  };
}

async function generateWithClaude(photos, answers) {
  const content = photos.map((p) => {
    const [, media_type, data] = p.match(IMG_RE);
    return { type: "image", source: { type: "base64", media_type, data } };
  });
  content.push({
    type: "text",
    text: `Here are my answers:\n${JSON.stringify(answers, null, 2)}\n\nReturn the plan as JSON matching exactly this shape:\n${SCHEMA}`,
  });

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": API_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: MODEL, max_tokens: 8000, system: SYSTEM, messages: [{ role: "user", content }] }),
    signal: AbortSignal.timeout(180_000),
  });
  if (!res.ok) throw new Error(`Anthropic API returned ${res.status}`);
  const data = await res.json();
  const text = arr(data.content).filter((b) => b.type === "text").map((b) => b.text).join("");
  return normalize(extractJson(text));
}

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { "content-type": "application/json", "content-length": Buffer.byteLength(body) });
  res.end(body);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(Object.assign(new Error("Photos are too large."), { status: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); }
      catch { reject(Object.assign(new Error("Invalid JSON."), { status: 400 })); }
    });
    req.on("error", reject);
  });
}

async function serveStatic(req, res) {
  const urlPath = decodeURIComponent(new URL(req.url, "http://x").pathname);
  const rel = urlPath === "/" ? "index.html" : urlPath.replace(/^\/+/, "");
  const file = path.resolve(PUBLIC_DIR, rel);
  if (file !== PUBLIC_DIR && !file.startsWith(PUBLIC_DIR + path.sep)) { res.writeHead(403).end("Forbidden"); return; }
  try {
    const data = await fs.readFile(file);
    res.writeHead(200, { "content-type": MIME[path.extname(file)] || "application/octet-stream", "cache-control": "no-cache" });
    res.end(data);
  } catch {
    res.writeHead(404, { "content-type": "text/plain" }).end("Not found");
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const { pathname } = new URL(req.url, "http://x");
    if (req.method === "GET" && pathname === "/api/status") return sendJson(res, 200, { mode: API_KEY ? "ai" : "demo", model: API_KEY ? MODEL : null });

    if (req.method === "POST" && pathname === "/api/plan") {
      const body = await readJson(req);
      const problem = validate(body);
      if (problem) return sendJson(res, 400, { error: problem });
      if (!API_KEY) return sendJson(res, 200, { plan: normalize(buildDemoPlan(body.answers)), mode: "demo" });
      try {
        return sendJson(res, 200, { plan: await generateWithClaude(body.photos, body.answers), mode: "ai" });
      } catch (err) {
        console.error("Plan generation failed:", err?.message || err);
        return sendJson(res, 502, { error: "Could not generate the plan. Please try again." });
      }
    }

    if (req.method === "GET" || req.method === "HEAD") return serveStatic(req, res);
    res.writeHead(405).end("Method not allowed");
  } catch (err) {
    sendJson(res, err.status || 500, { error: err.status ? err.message : "Server error." });
  }
});

server.listen(PORT, () => {
  console.log(`Room Redesigner running at http://localhost:${PORT} (${API_KEY ? "AI mode, " + MODEL : "demo mode: set ANTHROPIC_API_KEY"})`);
});
