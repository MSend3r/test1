const $ = (s, r = document) => r.querySelector(s);
const MAX_PHOTOS = 6;
const MAX_SIDE = 1280;

const GOALS = [
  ["storage", "More storage"], ["brighter", "Brighter / better light"], ["cozier", "Cozier"],
  ["functional", "Better layout & function"], ["modern", "Fresher, more modern look"],
  ["pets_kids", "Pet & kid friendly"], ["entertaining", "Hosting & entertaining"], ["workspace", "Work or study zone"],
];
const STYLES = [
  ["modern", "Modern"], ["minimal", "Minimal"], ["scandinavian", "Scandinavian"], ["cozy", "Cozy"],
  ["bohemian", "Bohemian"], ["industrial", "Industrial"], ["traditional", "Traditional"],
];
const COMFORT = [
  ["seating", "Comfortable seating"], ["lighting", "Soft, glare-free lighting"], ["acoustics", "Quieter / less echo"],
  ["temperature", "Temperature & drafts"], ["ergonomics", "Ergonomics"], ["privacy", "Privacy"],
];
const PRESETS = [250, 750, 1500, 5000, 15000, 30000];
const LOAD_MSGS = ["Studying your photos...", "Spotting what works and what doesn't...", "Matching ideas to your budget...", "Sequencing the work...", "Pricing your shopping list..."];

const state = { step: 1, photos: [], plan: null, mode: "demo" };
const TOTAL_STEPS = 4;

// ---------- helpers ----------
const money = (n) => "$" + Math.round(Number(n) || 0).toLocaleString("en-US");
function el(tag, props = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") e.className = v;
    else if (k === "style") e.style.cssText = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) e.setAttribute(k, v === true ? "" : v);
  }
  for (const k of kids.flat()) if (k != null && k !== false) e.append(k.nodeType ? k : document.createTextNode(String(k)));
  return e;
}
function chips(container, items, name, { max = Infinity, defaults = [] } = {}) {
  container.replaceChildren(
    ...items.map(([val, text]) => {
      const input = el("input", { type: "checkbox", name, value: val, checked: defaults.includes(val) });
      input.addEventListener("change", () => {
        const on = [...container.querySelectorAll("input:checked")];
        if (on.length > max) input.checked = false;
      });
      return el("label", { class: "chip" }, input, el("span", {}, text));
    })
  );
}
const picked = (container) => [...container.querySelectorAll("input:checked")].map((i) => i.value);

// ---------- photos ----------
function downscale(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL("image/jpeg", 0.82));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("unreadable")); };
    img.src = url;
  });
}
async function addFiles(fileList) {
  const msg = $("#photoMsg");
  msg.textContent = "";
  for (const f of fileList) {
    if (state.photos.length >= MAX_PHOTOS) { msg.textContent = `Max ${MAX_PHOTOS} photos. Extra ones were skipped.`; break; }
    try { state.photos.push(await downscale(f)); }
    catch { msg.textContent = "One file couldn't be read as an image (HEIC may not work in some browsers)."; }
  }
  renderPhotos();
  updateNav();
}
function renderPhotos() {
  $("#photos").replaceChildren(
    ...state.photos.map((src, i) =>
      el("div", { class: "photo" },
        el("img", { src, alt: `Photo ${i + 1}` }),
        el("button", { type: "button", "aria-label": `Remove photo ${i + 1}`, onclick: () => { state.photos.splice(i, 1); renderPhotos(); updateNav(); } }, "×"))
    )
  );
}

// ---------- wizard ----------
function show(step) {
  state.step = step;
  document.querySelectorAll(".step[data-step]").forEach((s) => (s.hidden = Number(s.dataset.step) !== step));
  $("#progress span").style.width = (step / TOTAL_STEPS) * 100 + "%";
  $("#error").hidden = true;
  $("#next").textContent = step === TOTAL_STEPS ? "Generate my plan" : "Next";
  $("#back").style.visibility = step === 1 ? "hidden" : "visible";
  updateNav();
  window.scrollTo({ top: 0 });
}
function updateNav() {
  $("#next").disabled = state.step === 1 && state.photos.length === 0;
}
function gather() {
  const budget = Math.max(50, Number($("#budget").value) || 0);
  return {
    roomType: $("#roomType").value,
    goals: picked($("#goals")),
    styles: picked($("#styles")),
    budget,
    comfort: picked($("#comfort")),
    tenure: $("#tenure").value,
    diy: $("#diy").value,
    timeline: $("#timeline").value,
    keep: $("#keep").value.trim().slice(0, 600),
    notes: $("#notes").value.trim().slice(0, 600),
  };
}

async function generate() {
  const answers = gather();
  $("#nav").hidden = true;
  $("#progress").hidden = true;
  document.querySelectorAll(".step[data-step]").forEach((s) => (s.hidden = true));
  $("#loading").hidden = false;
  $("#error").hidden = true;
  let i = 0;
  const timer = setInterval(() => { i = (i + 1) % LOAD_MSGS.length; $("#loadMsg").textContent = LOAD_MSGS[i]; }, 3500);
  try {
    const res = await fetch("/api/plan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ photos: state.photos, answers }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Something went wrong.");
    state.plan = data.plan;
    state.mode = data.mode;
    state.answers = answers;
    renderPlan();
  } catch (e) {
    $("#loading").hidden = true;
    $("#nav").hidden = false;
    $("#progress").hidden = false;
    show(TOTAL_STEPS);
    const err = $("#error");
    err.textContent = e.message || "Network problem. Please try again.";
    err.hidden = false;
  } finally {
    clearInterval(timer);
  }
}

// ---------- plan rendering ----------
const list = (items) => el("ul", { class: "clean" }, items.map((t) => el("li", {}, t)));
const section = (title, ...kids) => el("div", { class: "card" }, el("h2", {}, title), ...kids);

function renderPlan() {
  const p = state.plan;
  const budget = state.answers.budget;
  const over = p.total_estimate > budget;
  const root = $("#result");
  const maxAmt = Math.max(1, ...p.budget_breakdown.map((b) => b.amount));

  root.replaceChildren(...[
    state.mode === "demo" ? el("div", { class: "demo-note" }, "Demo mode: this plan comes from your answers only. Add an ANTHROPIC_API_KEY on the server and the plan will be built from what's actually in your photos.") : null,
    el("div", { class: "hero" },
      el("h1", {}, p.design_concept.name),
      el("p", {}, p.summary),
      el("div", { class: "kpis" },
        el("div", { class: "kpi" }, el("b", {}, money(p.total_estimate)), el("span", {}, `estimated of ${money(budget)}`)),
        el("div", { class: "kpi" }, el("b", {}, p.timeline || state.answers.timeline), el("span", {}, "timeline")),
        el("div", { class: "kpi" }, el("b", {}, String(p.phases.length)), el("span", {}, "phases")))),
    over ? el("p", { class: "msg error" }, `Heads up: the estimate is ${money(p.total_estimate - budget)} over your budget. See "If money is tight" below.`) : null,
    el("div", { class: "actions" },
      el("button", { class: "btn primary", type: "button", onclick: () => window.print() }, "Save as PDF / print"),
      el("button", { class: "btn", type: "button", id: "copyBtn", onclick: copyMarkdown }, "Copy as text"),
      el("button", { class: "btn", type: "button", onclick: restart }, "Start over")),

    section("What we see",
      p.space_assessment.observations.length ? list(p.space_assessment.observations) : null,
      p.space_assessment.issues.length ? el("p", {}, el("b", {}, "Problems to solve")) : null,
      p.space_assessment.issues.length ? list(p.space_assessment.issues) : null),

    section("Design concept",
      el("p", {}, p.design_concept.description),
      el("div", { class: "swatches" }, p.design_concept.palette.map((c) => el("div", { class: "swatch" }, el("i", { style: `background:${c.hex}` }), c.name))),
      p.design_concept.materials.length ? el("p", {}, el("b", {}, "Materials: "), p.design_concept.materials.join(", ")) : null),

    section("Where the money goes",
      p.budget_breakdown.map((b) => el("div", { class: "bar" }, el("span", {}, b.category), el("div", {}, el("i", { style: `width:${(b.amount / maxAmt) * 100}%` })), el("b", {}, money(b.amount))))),

    ...p.phases.map((ph, pi) =>
      el("div", { class: "card" },
        el("div", { class: "phase-h" }, el("h2", {}, ph.name), el("span", {}, ph.timeframe)),
        ph.tasks.map((t, ti) => {
          const id = `t${pi}_${ti}`;
          return el("label", { class: "task", for: id },
            el("input", { type: "checkbox", id }),
            el("span", { class: "t" }, t.task, el("span", { class: "tag" }, t.diy ? "DIY" : "Pro")),
            el("span", { class: "c" }, t.cost ? money(t.cost) : "Free"));
        }))),

    p.shopping_list.length
      ? section("Shopping list",
          el("table", {},
            el("thead", {}, el("tr", {}, ["Item", "Qty", "Priority", "Est.", "Notes"].map((h) => el("th", {}, h)))),
            el("tbody", {}, p.shopping_list.map((s) => el("tr", {},
              el("td", {}, s.item), el("td", {}, s.qty), el("td", {}, s.priority),
              el("td", { class: "num" }, money(s.est_cost)), el("td", {}, s.notes))))))
      : null,

    p.comfort_upgrades.length ? section("Comfort upgrades", list(p.comfort_upgrades)) : null,
    p.watch_outs.length ? section("Watch-outs", list(p.watch_outs)) : null,
    p.if_budget_tight.length ? section("If money is tight", list(p.if_budget_tight)) : null,
    p.if_budget_grows.length ? section("If you can spend more", list(p.if_budget_grows)) : null,
  ].filter(Boolean));

  $("#loading").hidden = true;
  root.hidden = false;
  window.scrollTo({ top: 0 });
}

function planToMarkdown() {
  const p = state.plan;
  const L = [];
  L.push(`# ${p.design_concept.name}`, "", p.summary, "", `**Estimate:** ${money(p.total_estimate)} of ${money(state.answers.budget)} budget · **Timeline:** ${p.timeline}`, "");
  if (p.space_assessment.observations.length) L.push("## What we see", ...p.space_assessment.observations.map((x) => `- ${x}`), "");
  if (p.space_assessment.issues.length) L.push("### Problems to solve", ...p.space_assessment.issues.map((x) => `- ${x}`), "");
  L.push("## Design concept", p.design_concept.description, "", "Palette: " + p.design_concept.palette.map((c) => `${c.name} ${c.hex}`).join(", "), "");
  L.push("## Budget", ...p.budget_breakdown.map((b) => `- ${b.category}: ${money(b.amount)}`), "");
  for (const ph of p.phases) L.push(`## ${ph.name} (${ph.timeframe})`, ...ph.tasks.map((t) => `- [ ] ${t.task} (${t.diy ? "DIY" : "Pro"}, ${t.cost ? money(t.cost) : "free"})`), "");
  if (p.shopping_list.length) L.push("## Shopping list", ...p.shopping_list.map((s) => `- ${s.item}${s.qty ? " x" + s.qty : ""} [${s.priority}] ${money(s.est_cost)}${s.notes ? " - " + s.notes : ""}`), "");
  for (const [title, items] of [["Comfort upgrades", p.comfort_upgrades], ["Watch-outs", p.watch_outs], ["If money is tight", p.if_budget_tight], ["If you can spend more", p.if_budget_grows]])
    if (items.length) L.push(`## ${title}`, ...items.map((x) => `- ${x}`), "");
  return L.join("\n");
}
async function copyMarkdown() {
  const btn = $("#copyBtn");
  try { await navigator.clipboard.writeText(planToMarkdown()); btn.textContent = "Copied!"; }
  catch { btn.textContent = "Copy failed"; }
  setTimeout(() => (btn.textContent = "Copy as text"), 2000);
}
function restart() {
  state.photos = []; state.plan = null;
  renderPhotos();
  $("#result").hidden = true;
  $("#nav").hidden = false;
  $("#progress").hidden = false;
  show(1);
}

// ---------- init ----------
function init() {
  chips($("#goals"), GOALS, "goals", { defaults: ["cozier", "functional"] });
  chips($("#styles"), STYLES, "styles", { max: 2, defaults: ["modern"] });
  chips($("#comfort"), COMFORT, "comfort", { defaults: ["seating", "lighting"] });
  $("#budgetPresets").replaceChildren(...PRESETS.map((n) => el("button", { type: "button", class: "btn", onclick: () => ($("#budget").value = n) }, money(n))));

  $("#cam").addEventListener("change", (e) => { addFiles(e.target.files); e.target.value = ""; });
  $("#upl").addEventListener("change", (e) => { addFiles(e.target.files); e.target.value = ""; });
  $("#back").addEventListener("click", () => show(Math.max(1, state.step - 1)));
  $("#next").addEventListener("click", () => (state.step === TOTAL_STEPS ? generate() : show(state.step + 1)));

  fetch("/api/status").then((r) => r.json()).then((s) => {
    const m = $("#mode");
    m.textContent = s.mode === "ai" ? "AI mode" : "Demo mode";
    m.hidden = false;
  }).catch(() => {});
  show(1);
}
init();
