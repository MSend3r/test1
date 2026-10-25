// Rule-based fallback used when no ANTHROPIC_API_KEY is set.
// It cannot see the photos; it builds a sensible plan from the answers only.

const PALETTES = {
  modern: [["Warm White", "#F4F1EA"], ["Charcoal", "#2F3237"], ["Oak", "#B98B5E"], ["Sage", "#8FA48A"]],
  cozy: [["Cream", "#F2E8D8"], ["Terracotta", "#C0714F"], ["Walnut", "#6B4A35"], ["Olive", "#7A7F4C"]],
  minimal: [["Chalk", "#F7F7F5"], ["Stone", "#C9C6BE"], ["Ash", "#8C8F91"], ["Ink", "#1F2123"]],
  bohemian: [["Sand", "#E8D9BF"], ["Rust", "#B5532E"], ["Teal", "#2F7F7B"], ["Mustard", "#D1A02D"]],
  scandinavian: [["Snow", "#FAFAF8"], ["Birch", "#DDBF98"], ["Fog", "#B7C2C7"], ["Pine", "#4B6454"]],
  industrial: [["Concrete", "#A7A9AA"], ["Iron", "#3A3C3F"], ["Brick", "#9C4E3A"], ["Leather", "#8A5A3B"]],
  traditional: [["Ivory", "#F3EEE2"], ["Navy", "#2A3B5C"], ["Mahogany", "#6E3B2A"], ["Brass", "#B8964B"]],
};

const GOAL_TASKS = {
  storage: { task: "Add closed storage (shelving, cabinet or under-furniture bins) to clear surfaces", cost: 0.12, diy: true, item: "Storage units and bins" },
  brighter: { task: "Layer lighting: ambient, task and accent sources; swap bulbs to a consistent warm temperature", cost: 0.09, diy: true, item: "Lamps, LED bulbs, dimmer plugs" },
  cozier: { task: "Add textiles: area rug, curtains, throw blankets, cushions", cost: 0.1, diy: true, item: "Rug, curtains, textiles" },
  functional: { task: "Re-plan the layout around traffic paths and how the room is actually used", cost: 0.02, diy: true, item: "Furniture sliders, measuring tape" },
  modern: { task: "Update visible hardware and fixtures (handles, switch plates, light fittings)", cost: 0.07, diy: true, item: "Hardware and fixtures" },
  pets_kids: { task: "Switch to wipeable or washable finishes and secure low-level hazards", cost: 0.06, diy: true, item: "Washable covers, anchors, cord organisers" },
  entertaining: { task: "Create a flexible seating cluster with a conversation-friendly layout", cost: 0.12, diy: false, item: "Extra seating and side tables" },
  workspace: { task: "Set up an ergonomic work zone with task lighting and cable management", cost: 0.12, diy: true, item: "Desk, chair, task lamp, cable tray" },
};

const COMFORT_TASKS = {
  seating: "Upgrade or add supportive seating with correct seat height and depth",
  lighting: "Put lamps on dimmers and avoid glare on screens and reading spots",
  acoustics: "Soften hard surfaces with rugs, drapes and bookshelves to cut echo",
  temperature: "Seal drafts, add thermal curtains and use fans or a heater for hot and cold spots",
  ergonomics: "Check heights: desk at elbow level, screen top at eye level, feet flat",
  privacy: "Add layered window treatments such as sheers plus blackout lining",
};

const label = (s) => String(s).replace(/_/g, " ");
const round10 = (n) => Math.max(0, Math.round(n / 10) * 10);

export function buildDemoPlan(a) {
  const budget = Math.max(50, Number(a.budget) || 1000);
  const goals = (a.goals?.length ? a.goals : ["cozier", "functional"]).filter((g) => GOAL_TASKS[g]);
  const comfort = (a.comfort || []).filter((c) => COMFORT_TASKS[c]);
  const style = PALETTES[a.styles?.[0]] ? a.styles[0] : "modern";
  const room = a.roomType || "room";

  // Weight each goal by its cost factor, then scale to ~88% of budget, leaving a contingency.
  const spendable = budget * 0.88;
  const weights = goals.map((g) => GOAL_TASKS[g].cost);
  const wSum = weights.reduce((x, y) => x + y, 0) || 1;
  const goalCosts = goals.map((g, i) => round10((weights[i] / wSum) * spendable * 0.8));
  const comfortCost = comfort.length ? round10(spendable * 0.2) : 0;
  const goalTotal = goalCosts.reduce((x, y) => x + y, 0);
  const contingency = round10(budget * 0.08);

  const breakdown = goals.map((g, i) => ({ category: label(g)[0].toUpperCase() + label(g).slice(1), amount: goalCosts[i] }));
  if (comfortCost) breakdown.push({ category: "Comfort upgrades", amount: comfortCost });
  breakdown.push({ category: "Contingency", amount: contingency });

  const diyNote = a.diy === "pro" ? "Hire a pro for anything electrical or structural." : a.diy === "diy" ? "All DIY-friendly." : "Mix of DIY and hired help.";
  const rental = a.tenure === "rent";

  const phases = [
    { name: "Phase 1: Declutter and plan", timeframe: "Weekend 1", tasks: [
      { task: `Empty and sort the ${room}: keep, donate, relocate`, cost: 0, diy: true },
      { task: "Measure walls, windows, doorways and note outlet and light positions", cost: 0, diy: true },
      { task: "Sketch two layout options on paper and pick the one with the clearest walking paths", cost: 0, diy: true },
    ] },
    { name: "Phase 2: Core changes", timeframe: "Weeks 1-3", tasks: goals.map((g, i) => ({ task: GOAL_TASKS[g].task, cost: goalCosts[i], diy: GOAL_TASKS[g].diy })) },
    { name: "Phase 3: Comfort and finishing", timeframe: "Weeks 3-5", tasks: [
      ...comfort.map((c) => ({ task: COMFORT_TASKS[c], cost: round10(comfortCost / comfort.length), diy: true })),
      { task: "Style surfaces: art, plants, and a few meaningful objects; edit down rather than add up", cost: 0, diy: true },
    ] },
  ];

  const shopping = goals.map((g, i) => ({
    item: GOAL_TASKS[g].item, qty: "as needed", est_cost: goalCosts[i], priority: i === 0 ? "high" : "medium",
    notes: "Compare 2-3 retailers; check secondhand marketplaces first.",
  }));

  return {
    mode: "demo",
    summary: `A ${style} refresh of your ${room} aimed at: ${goals.map((g) => GOAL_TASKS[g].item.toLowerCase()).join("; ")}. Built to stay within $${budget.toLocaleString()}. ${diyNote}`,
    space_assessment: {
      observations: ["Demo mode is on, so your photos were not analysed. Add an Anthropic API key to get a plan based on what is actually in your photos."],
      issues: [],
    },
    design_concept: {
      name: `${style[0].toUpperCase() + style.slice(1)} ${room}`,
      description: `A cohesive ${style} direction using a restrained palette so the space reads as intentional and calm.`,
      palette: PALETTES[style].map(([name, hex]) => ({ name, hex })),
      materials: ["Natural fibres", "Matte finishes", "Warm 2700K lighting"],
    },
    phases,
    shopping_list: shopping,
    budget_breakdown: breakdown,
    total_estimate: goalTotal + comfortCost + contingency,
    timeline: a.timeline || "4-6 weeks",
    comfort_upgrades: comfort.map((c) => COMFORT_TASKS[c]),
    watch_outs: [
      rental ? "You rent: favour removable options (plug-in lighting, command hooks, freestanding storage) and check your lease before painting." : "Check for permits before moving walls, wiring or plumbing.",
      "Order large items first; lead times are the usual cause of delays.",
      "Keep the contingency for surprises such as extra paint, fixings or delivery fees.",
    ],
    if_budget_tight: ["Do the lighting and layout changes first; they give the biggest effect per dollar.", "Buy rugs, shelving and seating secondhand."],
    if_budget_grows: ["Upgrade the one piece you touch daily (seating or desk chair) to a higher-quality item.", "Add custom window treatments."],
  };
}
