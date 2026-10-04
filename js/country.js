/* ═══════════════════════════════════════════════════════════════
   Entity — the country screen
   What opens when a country is clicked on the map.  Three layers: a
   header of status chips (only what is true right now), an essentials
   card (six vitals, the government, the last decision, and the
   outbreak outlook for the player), and collapsible sections for the
   rest — resources, stats, economy, diplomacy, conflict, decisions,
   links, outbreak, news, history.  Every label carries a hover
   tooltip in the tuning panel's form ("name — what it does"), from
   the TIPS table below, first match wins, no double quotes.

   Presentation only: reads world.js (state, supply, income, drift
   targets), decide.js (strength, defence, threat) and the links, and
   refreshes while open once a second at most.  Section open state is
   a per-viewer convenience kept in localStorage.  Registers
   openCountryModal on ENTITY; map.js and wire.js call it on a click.
   ═══════════════════════════════════════════════════════════════ */
(() => {
"use strict";
const { $, modal, uiAlert, rgb } = window.UI;
const { REGION_NAME, REGION_IDS, COUNTRY_REGION, popOf } = window.GEO;
const W = window.WORLD, CO = window.COUNTRIES, G = window.GOV, D = window.DECIDE;
const { RES_KEYS, STAT_KEYS } = CO;
const S = window.ENTITY;                 // player, openDeployModal, openRegionModal, deployCost — read at click time
const cfg = () => window.ENTITY_CONFIG;

const r0   = v => Math.round(v);
const pct  = v => `${r0(v * 100)}%`;
const sign = v => (v >= 0 ? "+" : "") + r0(v);
const cap  = s => s.charAt(0).toUpperCase() + s.slice(1);
const esc  = t => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const nameOrStat = t => (typeof t === "string" && t.length === 2 && t === t.toUpperCase()) ? W.nameOf(t) : t;
const fmtQ = v => v >= 1e6 ? (v / 1e6).toFixed(1) + "M" : v >= 1e3 ? (v / 1e3).toFixed(1) + "k" : v >= 10 ? String(r0(v)) : v.toFixed(1);
const fmtForce = f => f >= 1e6 ? (f / 1e6).toFixed(1) + "M" : f >= 1e3 ? (f / 1e3).toFixed(f >= 1e4 ? 0 : 1) + "k" : String(r0(f));

/* ── TIPS — hover text for every label.  First match wins.  Kept free
   of double quotes so they can sit inside title="…" attributes. ──── */
const TIPS = [
  [/^economy$/,    "output per head as an index — grows toward a cap from infrastructure and technology, faster with technology; the worst resource balance holds it back and, past the shortage bite, contracts it; war and the outbreak slow it"],
  [/^output$/,     "output per head, the number the index is made from — unbounded, so a rich country can keep growing or overshoot"],
  [/^growth$/,     "today's growth rate of output, shown per year"],
  [/^boom$/,       "confidence — builds while the balances hold and sets the pace of growth and the size of credit; a shortage, a debt over the limit or a crash on the exchange breaks a confident economy: output falls at once and nothing grows for a while"],
  [/^sales$/,      "money from surplus sold on the exchange at today's prices"],
  [/^bought$/,     "money spent on the exchange covering the worst shortage, one type a day"],
  [/^projects$/,   "investments in progress — each is paid and pays out day by day over its term, and stalls when the money runs out"],
  [/^interest$/,   "interest charged on a negative treasury"],
  [/^debt$/,       "a negative treasury — allowed up to a credit limit of some days of income; past it nothing more can be bought and stability suffers"],
  [/^stock$/,      "the stockpile — filled from surplus up to a size set by infrastructure, drawn down in shortage"],
  [/^stability$/,  "order at home 0..100 — below 15 for a month the government falls (longer for a regime that can coerce: authority over the floor times the army holds the street); war, sanctions, a fresh bust, occupation, weariness and the outbreak drag it"],
  [/^military$/,   "force — the army as people under arms: the military level times population, scaled by technology and infrastructure; with allies it decides wars, and it is spent every day of one"],
  [/^resources$/,  "the worst of the four resource balances, in percent of need — below the shortage bite the economy contracts; short food or water starves the population"],
  [/^treasury$/,   "money on hand — taxes on output and market sales pay in; upkeep, purchases, projects, wars and interest pay out; it may go into debt up to a credit limit"],
  [/^population$/, "millions — grows with food, water and hospitals up to what the land carries; famine, crowding, war and disaster kill; migrants move it; under half a million never fights"],
  [/^infra$/,      "roads, ports and grid 0..100 — opens the endowment, carries trade and travel, raises the growth cap and the stockpiles; costs upkeep and decays unpaid; quakes and storms break it"],
  [/^academia$/,   "research base 0..100 — discoveries start here and spread to friends"],
  [/^medical$/,    "health system 0..100 — how fast an outbreak is noticed and fought, how many the land carries and how few die; costs upkeep and decays unpaid"],
  [/^technology$/, "know-how 0..100 — multiplies military strength and desalination; follows academia"],
  [/^government$/, "the regime: a label from authority and political freedom, its type (how it can be replaced), when it took office, and its legitimacy"],
  [/^regimeType$/, "elected regimes change by election; hereditary when the monarch dies; military by appointment or coup; party by congress or purge"],
  [/^programme$/,  "what this government set out to do when it took office: a drawn pool of works, standing measures and acts, each ready, under way, done or resting on its cooldown"],
  [/^legitimacy$/, "how well the regime fits its nation and performs 0..100 — the distance from the nation's base, growth, shortage, defeat and occupation all count; it feeds stability and sets the odds of coups, revolutions and strongman elections"],
  [/^election$/,   "the next scheduled election — a low-legitimacy regime is thrown out with a large swing; under stress a strongman ticket wins"],
  [/^axes$/,       "the effective axes: the nation's base plus the regime's modifiers (shown in brackets); only a revolution moves the base"],
  [/^authority$/,  "how much the state commands 0..100 — high means junta or autocracy, low means fractured or liberal; it arms the country and hoards its money"],
  [/^freedom$/,    "political freedom 0..100 — consent: who is asked, how dissent shows; elections, academia and legitimacy read it"],
  [/^openness$/,   "economic openness 0..100 — trade posture: deals, tourism, migration and diffusion read it"],
  [/^energy$/,     "oil, gas and hydro — produced from the potential as far as infrastructure, technology and the workforce allow; burnt by output, the army and desalination"],
  [/^materials$/,  "ores, metals and industrial materials — produced from the potential; consumed by output and the army"],
  [/^food$/,       "farmland and fisheries — produced from the potential, swung by the year's weather, cut by drought and flood; eaten per head"],
  [/^water$/,      "usable fresh water — produced from the potential, swung by the weather, halved by drought, plus desalination from energy; drunk per head"],
  [/^relations$/,  "-100 hostile .. 100 friendly — starts from region, borders, government gap and the rivalry table; deals and pacts raise it, sanctions and war sink it"],
  [/^threat$/,     "the strongest hostile neighbour's military edge over ours"],
  [/^weary$/,      "war-weariness 0..100 — gained by fighting, shed slowly at peace; drags stability and makes the next war unlikely"],
  [/^strength$/,   "military scaled by technology and infrastructure, plus 30% of pact allies' armies"],
  [/^defended$/,   "our strength as an attacker meets it — dug in, and behind mountains on a range border"],
  [/^score$/,      "war score — the attacker wins at +1, the defender at -1, a stalemate after 240 days"],
  [/^war$/,        "a campaign — each day the two strengths move the score while both sides bleed economy, infrastructure, stability and armies"],
  [/^occupation$/, "the winner takes the loser's decisions, half its income and half its native resources until the term ends, then bends its government toward its own; it posts a garrison sized to what the loser could still muster, and by how full that garrison is it levies the loser's people and keeps them quiet — a thin garrison invites an uprising; an occupied neighbour's borders are the occupier's borders"],
  [/^income$/,     "today's treasury change — taxes and sales in; purchases, upkeep, projects, wars and interest out; plus or minus any occupation skim"],
  [/^upkeep$/,     "the daily cost of infrastructure, the army and the hospitals — rate × level × population; unpaid, the stat decays"],
  [/^deal$/,       "a supply deal — a recurring swap: each side puts up a named amount of a resource (or money, or a technology term) every day until the term ends; it beats the exchange when the partner is close, and breaks if a side cannot deliver"],
  [/^partners$/,   "how many deals this country runs against how many its infrastructure can carry"],
  [/^marketAccess$/, "the share of the exchange still open to it — whoever sanctions it closes off their weight in world trade"],
  [/^truce$/,      "no new war between these two for a while after the last one"],
  [/^refugees$/,   "people who fled a disaster or a war to linked friends — they come back once home is calm: no war, no occupation, no disaster still biting, supply recovered"],
  [/^rebuild$/,    "after a large disaster or a lost war, infrastructure projects cost half for a year"],
  [/^mobilised$/,  "reserves under arms: a fast, dear military project taken at war, standing down again at peace"],
  [/^techUpkeep$/, "technology consumes energy; when the country is short, the laboratories go dark first and technology decays slowly until the energy is back"],
  [/^prices$/,     "today's world prices on the exchange (1 is the base) — what this country pays landed for its binding type adds the spread and the transport from where the sellers are; sanctions cut its access"],
  [/^weather$/,    "the climate zone and this year's rainfall anomaly — the zone's answer to the world's multi-year oscillation, the region's shared year and the country's own; droughts, floods, fires and dust storms follow it"],
  [/^pact$/,       "a defence pact — allies add 30% of their army to each other's strength and share outbreak response"],
  [/^sanction$/,   "sanctions — cut the target's access to the exchange by the sanctioners' weight in world trade, end the deals between the two, and cost the sanctioner goodwill with the target's friends; lifted once relations recover"],
  [/^border$/,     "border policy — open, restricted (40% of travel) or closed (5%); slows the outbreak and the economy alike"],
  [/^flow$/,       "today's travellers and migrants along the links — the outbreak rides them"],
  [/^coverage$/,   "share of the country the entity has spread through"],
  [/^detection$/,  "how sure the authorities are that something is loose — reactions start above 30%"],
  [/^govAction$/,  "how hard the state is clamping down — slows local growth and incoming hops"],
  [/^response$/,   "progress toward containing it — the weighted world total ends the game at 100%"],
  [/^profile$/,    "the entity loose here — its mode and type"],
  [/^traits$/,     "the traits of the entity loose here"],
  [/^detects$/,    "how fast an outbreak here is noticed — the medical stat, boosted by a fresh breakthrough"],
  [/^spreads$/,    "how far an outbreak here would travel — today's outgoing flow over every link, ranked against every other country"],
  [/^responds$/,   "how hard the state can push back — medical, military and technology"],
  [/^outlook$/,    "what deploying here would meet — how fast it is noticed, how far it spreads, how hard it is fought"],
  [/^decision$/,   "a decision — weekly for deals, sanctions, pacts and borders; monthly for projects, research, war and peace; the likeliest of the scored options usually wins, not always; outbreak reactions come between"],
  [/^priorities$/, "what the country weighs when it decides — from its temperament for now, from its government later"],
  [/^budget$/,     "the monthly budget — a country that cannot carry two months of upkeep stops paying for what it values least, and the stat decays"],
  [/^market$/,     "the daily market rule — buy the worst shortage a few days ahead, within the reserve and below the price limit; sell the surplus"],
  [/^deploy$/,     "release a stored variant here — costs money and scrutiny, starts coverage"],
  [/^stats$/,      "the eight stats, each with where it is heading today"],
  [/^news$/,       "this country's headlines from the world log — click one to find it on the map"],
  [/^history$/,    "monthly samples over the last three years"],
];
const tip = key => { for (const [re, t] of TIPS) if (re.test(key)) return t; return ""; };
const T = (key, label) => { const t = tip(key); return `title="${esc(label || key)}${t ? " — " + esc(t) : ""}"`; };
const chip = (cls, text, key) => `<span class="chip ${cls}" ${T(key, text)}>${esc(text)}</span>`;
const row  = (key, label, v) => `<div class="row"><span class="k" ${T(key, label)}>${esc(label)}</span><span class="v">${v}</span></div>`;

const countryModal = modal("countryModal", { onClose: () => { current = null; } });
let current = null, lastRender = 0, trailing = 0;

const OPEN_KEY = "entity_country_open";
function loadOpen() { try { return JSON.parse(localStorage.getItem(OPEN_KEY) || "{}") || {}; } catch (e) { return {}; } }
function saveOpen(o) { try { localStorage.setItem(OPEN_KEY, JSON.stringify(o)); } catch (e) {} }

/* Everything the renderers read, gathered once per render. */
function context(iso) {
  const s = W.ensureCountry(iso), L = window.LINKS;
  const sp = s.res ? W.supplyOf(iso) : null;
  const floor = sp ? Math.min(...sp) : 100;
  return { iso, s, c: cfg(), links: L && L.ready ? L : null, sp, floor, bind: sp ? sp.indexOf(Math.min(...sp)) : -1,
           name: W.nameOf(iso), region: COUNTRY_REGION[iso] || null, wars: W.warsOf(iso), fronts: W.frontsOf(iso), day: W.day };
}

/* ── Header, chips, vitals, essentials ─────────────────────────── */
function header(x) {
  $("cmSw").style.background = x.s.profile && window.C ? rgb(C.profileColor(x.s.profile.g0, x.s.profile.g1)) : "#333";
  $("cmName").textContent = x.name;
  $("cmIso").textContent = x.iso;
  $("cmRegion").textContent = x.region && REGION_NAME[x.region] ? REGION_NAME[x.region] : "";
}
function chips(x) {
  const s = x.s, out = [];
  for (const w of x.wars) {
    const foe = w.att === x.iso ? w.def : w.att, lead = w.att === x.iso ? w.score : -w.score;
    out.push(chip("bad", `${w.att === x.iso ? "at war with" : "defending against"} ${W.nameOf(foe)} · ${lead >= 0 ? "ahead" : "behind"} ${Math.abs(lead).toFixed(2)}`, "score"));
  }
  for (const f of x.fronts) {
    const mine = f.front.a === x.iso, foe = mine ? f.front.d : f.front.a, lead = mine ? f.front.score : -f.front.score;
    out.push(chip("bad", `on a front against ${W.nameOf(foe)} · ${lead >= 0 ? "ahead" : "behind"} ${Math.abs(lead).toFixed(2)}`, "front"));
  }
  if (s.occupiedBy) out.push(chip("bad", `occupied by ${W.nameOf(s.occupiedBy)} until ${W.fmtDate(s.occupiedUntil)}`, "occupation"));
  if (s.legit != null && s.legit < 35) out.push(chip("bad", `legitimacy ${r0(s.legit)}`, "legitimacy"));
  if (s.refugees && s.refugees.length) out.push(chip("warn", `${(s.refugees.reduce((a, r) => a + r[1], 0)).toFixed(1)}M abroad as refugees`, "refugees"));
  if (x.day < (s.rebuildUntil || 0)) out.push(chip("warn", `rebuilding until ${W.fmtDate(s.rebuildUntil)}`, "rebuild"));
  if (s.techUnpaid > 0.2) out.push(chip("bad", `energy short: technology decaying`, "techUpkeep"));
  if (s.mobilised > 0.5) out.push(chip("warn", `mobilised (+${r0(s.mobilised)} military)`, "mobilised"));
  if (x.day < (s.disgraceUntil || 0)) out.push(chip("warn", "disgraced abroad", "legitimacy"));
  for (const o in W.COUNTRY_STATE) if (W.COUNTRY_STATE[o].occupiedBy === x.iso) out.push(chip("warn", `occupying ${W.nameOf(o)}`, "occupation"));
  if (s.border) out.push(chip("warn", ["", "borders restricted", "borders closed"][s.border], "border"));
  if (s.ban && x.day < s.banUntil) out.push(chip("warn", `travel ban on ${W.nameOf(s.ban)}`, "border"));
  if (x.day < (s.dryUntil || 0)) out.push(chip("warn", `drought until ${W.fmtDate(s.dryUntil)}`, "water"));
  if (x.day < (s.wetUntil || 0)) out.push(chip("warn", `floods until ${W.fmtDate(s.wetUntil)}`, "food"));
  if (s.covered) out.push(chip("bad", `COVERED ${pct(s.coverageLevel)}`, "coverage"));
  if (s.detection > 0.05) out.push(chip(s.detection > 0.3 ? "bad" : "warn", `detection ${pct(s.detection)}`, "detection"));
  if (x.day < (s.breakthroughUntil || 0)) out.push(chip("good", "detection breakthrough", "detects"));
  return out.join("") || `<span class="chip dim">nothing out of the ordinary</span>`;
}
function vitals(x) {
  const s = x.s, st = s.st, inc = W.incomeLine(s, x.iso);
  const tiles = [
    ["economy", r0(W.ecoIndexOf(x.iso)), `output ${(s.output || 0).toFixed(0)}`],
    ["stability", r0(st.stability), s.legit != null ? `legitimacy ${r0(s.legit)}` : ""],
    ["military", fmtForce(W.force(x.iso)), `level ${r0(st.military)}`],
    ["resources", r0(x.floor), x.bind >= 0 ? `${RES_KEYS[x.bind]} binds` : ""],
    ["treasury", r0(s.treasury), `${sign(inc.net)}/day`],
    ["population", (s.pop || popOf(x.iso)).toFixed(s.pop >= 10 ? 0 : 1) + "M", ""],
  ];
  return tiles.map(([k, v, sub]) => `<div class="vital" data-k="${k}"><span class="k" ${T(k)}>${k}</span><b>${v}</b><span class="sub">${esc(sub)}</span></div>`).join("");
}
function outflowRank(iso) {                 // this country's outgoing flow against every other's
  const L = window.LINKS; if (!L || !L.ready) return null;
  const totals = Object.create(null);
  for (let i = 0; i < L.edges.length; i++) {
    const e = L.edges[i];
    totals[e.a] = (totals[e.a] || 0) + L.flowAt(i, 0);
    totals[e.b] = (totals[e.b] || 0) + L.flowAt(i, 1);
  }
  const mine = totals[iso] || 0; let below = 0, n = 0;
  for (const k in totals) { n++; if (totals[k] < mine) below++; }
  return { pct: n ? below / n : 0, flow: mine };
}
function outlook(x) {
  const st = x.s.st, c = x.c;
  const medF = (0.3 + st.medical / 100 * c.detectMedical) * (x.day < (x.s.breakthroughUntil || 0) ? c.breakthroughMult : 1);
  const resp = (0.5 * st.medical + 0.2 * st.military + 0.3 * st.technology) / 100;
  const fl = outflowRank(x.iso);
  const grade = (v, lo, hi, words) => v <= lo ? words[0] : v >= hi ? words[2] : words[1];
  const items = [
    ["detects", grade(medF, 0.6, 0.95, ["slowly", "in time", "quickly"]), `detection factor ${medF.toFixed(2)} from medical ${r0(st.medical)}`],
    ["spreads", fl ? grade(fl.pct, 0.33, 0.67, ["poorly", "somewhat", "widely"]) : "unknown", fl ? `outgoing flow ${fl.flow.toFixed(2)}, above ${r0(fl.pct * 100)}% of countries` : "no links yet"],
    ["responds", grade(resp, 0.4, 0.65, ["weakly", "steadily", "strongly"]), `response weight ${resp.toFixed(2)} from medical ${r0(st.medical)}, military ${r0(st.military)}, technology ${r0(st.technology)}`],
  ];
  return `<div class="row"><span class="k" ${T("outlook", "Outbreak outlook")}>Outbreak outlook</span><span class="v outlook">`
    + items.map(([k, w, detail]) => `<span class="chip" title="${esc(cap(k))} ${esc(w)} — ${esc(tip(k))}. ${esc(detail)}">${k} ${esc(w)}</span>`).join("")
    + `</span></div>`;
}
function essentials(x) {
  const s = x.s;
  const b = s.base || { authority: s.authority, freedom: s.freedom, econOpen: s.econOpen }, type = G.typeOf(s);
  const dev = (v, base) => { const d = Math.round(v - base); return d ? ` <span class="dim">(${d > 0 ? "+" : ""}${d})</span>` : ""; };
  const legit = s.legit != null ? s.legit : G.legitimacyOf(x.iso, s);
  // the programme: each power the government holds, and where it stands with it
  const programme = (() => {
    const R = s.regime, pw = G.powersOf ? G.powersOf(s) : [];
    if (!pw.length) return "";
    const tag = k => R.enacting === k ? "under way" : (R.done || []).indexOf(k) >= 0 ? "done" : R.cooldown && W.day < (R.cooldown[k] || 0) ? "resting" : "ready";
    return ` <span class="dim" ${T("programme")}>· ${pw.map(k => `${esc(G.powerLabel(k))} (${tag(k)})`).join(", ")}</span>`;
  })();
  const gov = row("government", "Government", `${esc(G.labelOf(s))} <span class="dim" ${T("regimeType")}>· ${esc(type)}${s.regime && s.regime.since ? " since " + W.fmtDate(s.regime.since) : ""}</span>${programme}`
                  + ` <b class="${legit >= 60 ? "good" : legit >= 35 ? "warn" : "bad"}" ${T("legitimacy")}>legitimacy ${r0(legit)}</b>`
                  + (type === "elected" && s.nextElection ? ` <span class="dim" ${T("election")}>· election ${W.fmtDate(s.nextElection)}</span>` : ""))
            + row("axes", "Axes", `<span ${T("authority")}>authority ${r0(s.authority)}${dev(s.authority, b.authority)}</span> · <span ${T("freedom")}>freedom ${r0(s.freedom != null ? s.freedom : s.econOpen)}${dev(s.freedom != null ? s.freedom : s.econOpen, b.freedom)}</span> · <span ${T("openness")}>openness ${r0(s.econOpen)}${dev(s.econOpen, b.econOpen)}</span>`);
  const last = s.last
    ? `${esc(s.last.action)}${s.last.target != null ? " · " + esc(nameOrStat(s.last.target)) : ""} <span class="dim">(${W.fmtDate(s.last.day)}) — ${(s.last.reasons || []).map(esc).join("; ")}</span>`
    : "none yet";
  return gov + row("decision", "Last decision", last) + outlook(x);
}

/* ── Sections ──────────────────────────────────────────────────── */
function secResources(x) {
  const s = x.s, E = window.ECONOMY, a = E && s.potential ? E.assess(x.iso) : null;
  if (!a) return `<span class="dim">no resource data</span>`;
  const c = x.c, wx = a.weather, pc = v => `${v >= 0 ? "+" : ""}${r0(v)}%`;
  const bind = a.balance.indexOf(Math.min(...a.balance)), stock = s.stock || [0, 0, 0, 0];
  const rows = RES_KEYS.map((k, i) => {
    const b = a.balance[i], isBind = i === bind && b < 1;
    const notes = [`potential ${fmtQ(s.potential[i])}`, `access ${r0(a.access * 100)}%`];
    if (i === 3 && a.desal > 0.5) notes.push(`desalination +${fmtQ(a.desal)}`);
    if (a.occupiedShare) notes.push(`${r0(a.occupiedShare * 100)}% taken by ${W.nameOf(s.occupiedBy)}`);
    for (const [o, g] of a.taken) if (g[i] > 0.5) notes.push(`from ${W.nameOf(o)} +${fmtQ(g[i])}`);
    if (s.dealIn && s.dealIn[i] > 0.005) notes.push(`deals bring ${fmtQ(s.dealIn[i])}`);
    if (s.dealOut && s.dealOut[i] > 0.005) notes.push(`deals send ${fmtQ(s.dealOut[i])}`);
    if (s.bought && s.bought[i] > 0) notes.push(`bought ${fmtQ(s.bought[i])}`);
    if (s.bill && s.bill[i] > 0.5) notes.push(`costs us ${r0(s.bill[i])}/day`);
    if (s.withheld && s.withheld[i] > 0.005) notes.push(`held back ${fmtQ(s.withheld[i])} (floor ${(s.reservation[i] || 0).toFixed(2)})`);
    if (i === 0 && a.techEnergy > 0.005) notes.push(`laboratories ${fmtQ(a.techEnergy)}${s.techUnpaid > 0 ? ` · ${r0(s.techUnpaid * 100)}% dark, technology decaying` : ""}`);
    if (s.surplus && s.surplus[i] > 0) notes.push(`sold ${fmtQ(s.surplus[i])}`);
    if (i === 2 || i === 3) {
      const f = i === 2 ? (1 + c.foodWeather * wx) * (a.dry ? 1 - c.droughtFood : 1) * (a.wet ? 1 - c.floodFood : 1)
                        : (1 + c.waterWeather * wx) * (a.dry ? 0.5 : 1);
      if (Math.abs(f - 1) > 0.005) notes.push(`weather ×${f.toFixed(2)}`);
    }
    return `<div class="res-row${isBind ? " bind" : ""}"><span class="k" ${T(k)}>${k}</span><span class="v">makes ${fmtQ(a.production[i])} · needs ${fmtQ(a.consumption[i])} · <b>${r0(b * 100)}%</b>${isBind ? " · limits growth" : ""} · <span ${T("stock")}>stock ${fmtQ(stock[i])}/${fmtQ(a.stockCap[i])}</span></span></div>`
         + `<div class="feeds">${esc(notes.join(" · "))}</div>`;
  }).join("");
  const M = W.WORLD_STATE.market, E2 = window.ECONOMY;
  const prices = M && M.price ? RES_KEYS.map((k, i) => `${k} ${M.price[i].toFixed(2)}`).join(" · ")
                 + (bind >= 0 && a.balance[bind] < 1 ? ` · we pay ${(M.price[bind] * (1 + c.marketSpread + E2.frictionFor(x.iso, bind))).toFixed(2)} for ${RES_KEYS[bind]} landed` : "")
                 + (s.marketAccess != null && s.marketAccess < 0.999 ? ` · market access ${r0(s.marketAccess * 100)}%` : "") : "no market yet";
  const marks = [a.dry ? `drought until ${W.fmtDate(s.dryUntil)}` : "", a.wet ? `floods until ${W.fmtDate(s.wetUntil)}` : "", a.smoke ? `smoke and dust until ${W.fmtDate(s.smokeUntil)}` : ""].filter(Boolean);
  const cl = W.climateOf(x.iso), osc = W.oscillation();
  const weather = `${cl.zone} · ${wx < -0.3 ? "a dry year" : wx > 0.3 ? "a wet year" : "an ordinary year"} (water ${pc(wx * c.waterWeather * 100)}, food ${pc(wx * c.foodWeather * 100)}; oscillation ${osc >= 0 ? "+" : ""}${osc.toFixed(2)})`
                + (marks.length ? " · " + marks.join(", ") : "");
  return `<div class="res-table">${rows}<div class="res-row wx"><span class="k" ${T("prices")}>prices</span><span class="v">${esc(prices)}</span></div>`
       + `<div class="res-row wx"><span class="k" ${T("weather")}>weather</span><span class="v">${esc(weather)}</span></div></div>`;
}
function secStats(x) {
  const st = x.s.st, t = W.driftTargetsOf(x.iso) || {};
  return `<div class="stat-bars">` + STAT_KEYS.map(k => {
    const tv = t[k], d = tv == null ? 0 : tv - st[k];
    const arrow = Math.abs(d) < 1 ? "·" : d > 0 ? "▲" : "▼";
    const title = `${cap(k)} ${r0(st[k])}${tv == null ? "" : ` — heading for ${r0(Math.max(0, Math.min(100, tv)))}`}`;
    return `<div class="stat-bar"><span class="k" ${T(k)}>${k}</span><span class="track"><span class="fill" style="width:${r0(st[k])}%"></span></span><b title="${esc(title)}">${r0(st[k])} <i class="arrow">${arrow}</i></b></div>`;
  }).join("") + `</div>`;
}
function secEconomy(x) {
  const s = x.s, inc = W.incomeLine(s, x.iso), E = window.ECONOMY;
  let html = row("output", "Output per head", `${(s.output || 0).toFixed(1)} <span class="dim">(cap ${r0(s.cap || 0)})</span>`)
           + row("growth", "Growth", `${((s.growth || 0) * 36500).toFixed(1)}% a year`)
           + row("boom", "Confidence", `${r0((s.boom || 0) * 100)}%${W.day < (s.bustUntil || 0) ? ` <span class="bad">· bust: recovering for ${r0(s.bustUntil - W.day)} days</span>` : ""}`)
           + row("income", "Tax income", sign(inc.tax)) + row("sales", "Market sales", sign(inc.sales))
           + (inc.bought ? row("bought", "Market purchases", sign(inc.bought)) : "")
           + row("upkeep", "Upkeep", sign(inc.upkeep) + (s.unpaid && s.unpaid.length ? ` <span class="bad">unpaid: ${s.unpaid.join(", ")}</span>` : ""))
           + (inc.projects ? row("projects", "Projects", sign(inc.projects)) : "") + (inc.war ? row("war", "War", sign(inc.war)) : "")
           + (inc.interest ? row("interest", "Interest", sign(inc.interest)) : "") + (inc.skim ? row("occupation", "Occupation skim", sign(inc.skim)) : "")
           + row("income", "Net per day", `<b>${sign(inc.net)}</b>`)
           + (s.treasury < 0 ? row("debt", "Debt", `${r0(-s.treasury)} of ${r0(E ? E.credit(s) : 0)} credit${s.broke ? ` <span class="bad">· over the limit</span>` : ""}`) : "");
  const pj = (s.projects || []).map(p => `${p.stat} +${(p.gain * p.days).toFixed(1)} over ${p.days} days${p.stalled ? ` (stalled ${p.stalled} d)` : ""}`);
  html += `<div class="traits" ${T("projects", "Projects")}>Projects: ${pj.map(esc).join(", ") || "none"}</div>`;
  const deals = [], sanOut = [], sanIn = [];
  for (const key in W.PAIRS) {
    const p = W.PAIRS[key], i = key.indexOf("|"), a = key.slice(0, i), b = key.slice(i + 1);
    if (a !== x.iso && b !== x.iso) continue;
    const other = a === x.iso ? b : a;
    for (const d of (p.deals || [])) deals.push(`${esc(W.nameOf(other))} <span class="dim">(since ${W.fmtDate(d.since)})</span>`);
    if (a === x.iso ? p.sanA : p.sanB) sanOut.push(esc(W.nameOf(other)));
    if (a === x.iso ? p.sanB : p.sanA) sanIn.push(esc(W.nameOf(other)));
  }
  html += `<div class="traits" ${T("deal", "Trade deals")}>Trade deals (${deals.length}): ${deals.join(", ") || "none"}</div>`;
  if (sanOut.length || sanIn.length)
    html += `<div class="traits" ${T("sanction", "Sanctions")}>Sanctions on ${sanOut.join(", ") || "nobody"} · sanctioned by ${sanIn.join(", ") || "nobody"}</div>`;
  return html;
}
function baselineNote(x, other) {
  const key = x.iso < other ? x.iso + "|" + other : other + "|" + x.iso, riv = CO.RIVALRIES[key];
  if (riv != null) return `from the rivalry table: ${riv}`;
  const o = W.COUNTRY_STATE[other], parts = [];
  if (x.region && x.region === COUNTRY_REGION[other]) parts.push("same region +15");
  if (x.links && x.links.linkedBy(x.iso, other, "land")) parts.push("shared border +5");
  if (o) parts.push(`government gap -${r0(x.c.relGovGap * (Math.abs((x.s.freedom != null ? x.s.freedom : x.s.econOpen) - (o.freedom != null ? o.freedom : o.econOpen)) + Math.abs(x.s.econOpen - o.econOpen)) / 2)}`);
  return "baseline: " + (parts.join(", ") || "0");
}
function secDiplomacy(x) {
  const rels = [];
  for (const k in W.PAIRS) {
    const i = k.indexOf("|"), a = k.slice(0, i), b = k.slice(i + 1);
    if (a !== x.iso && b !== x.iso) continue;
    rels.push([a === x.iso ? b : a, W.PAIRS[k]]);
  }
  rels.sort((p, q) => (q[1].deals || []).length - (p[1].deals || []).length || Math.abs(q[1].rel) - Math.abs(p[1].rel));
  if (!rels.length) return `<span class="dim">no dealings yet</span>`;
  const access = window.ECONOMY.marketAccess(x.iso), cap = W.partnerCapOf(x.iso);
  const held = (W.pairCounts()[x.iso] || {}).deals || 0;
  const head = `<div class="row"><span class="k" ${T("partners")}>deals</span><span class="v"><b>${held}</b> of ${cap} it can run`
             + (access < 0.999 ? ` · <span class="bad" ${T("marketAccess")}>market access ${r0(access * 100)}%</span>` : "")
             + `</span></div>`;
  return head + rels.slice(0, 12).map(([o, p]) => {
    const mine = x.iso < o;                                  // the record is written from the pair's first ISO
    const legs = (p.deals || []).map(d => {
      if (d.fk != null && d.fk >= 0) return `<div class="feeds">${esc(`price floor: ${RES_KEYS[d.fk]} at ${(d.fp || 0).toFixed(2)} · to ${W.fmtDate(d.until)}${d.short ? ` · ranks broken ${d.short}d` : ""}`)}</div>`;
      const gives = d.g >= 0 ? `${RES_KEYS[d.g]} ${fmtQ(d.gq)}` : d.mq > 0 ? `$${r0(Math.abs(d.mq))}` : "";
      const takes = d.t >= 0 ? `${RES_KEYS[d.t]} ${fmtQ(d.tq)}` : d.mq < 0 ? `$${r0(Math.abs(d.mq))}` : "";
      const ours = mine ? gives : takes, theirs = mine ? takes : gives;
      const tech = d.tech ? (mine ? " + technology out" : " + technology in") : "";
      const late = d.short ? ` · short ${d.short}d` : "";
      return `<div class="feeds">${esc((ours ? "we send " + ours : "we send nothing") + (theirs ? ", they send " + theirs : "") + tech
             + " · to " + W.fmtDate(d.until) + late)}</div>`;
    }).join("");
    return `<div class="row"><span class="k" title="${esc(W.nameOf(o))} — ${esc(baselineNote(x, o))}">${esc(W.nameOf(o))}</span><span class="v">`
    + `<b class="${p.rel >= 0 ? "good" : "bad"}" ${T("relations")}>${r0(p.rel)}</b>`
    + (p.pact ? ` <span class="chip good" ${T("pact")}>pact</span>` : "")
    + ((p.deals || []).length ? ` <span class="chip" ${T("deal")}>${(p.deals || []).length} deal${(p.deals || []).length > 1 ? "s" : ""}</span>` : "")
    + (p.warId ? ` <span class="chip bad" ${T("war")}>war</span>` : "") + ((mine ? p.sanA : p.sanB) ? ` <span class="chip warn" ${T("sanction")}>we sanction</span>` : "")
    + ((mine ? p.sanB : p.sanA) ? ` <span class="chip warn" ${T("sanction")}>sanctions us</span>` : "")
    + (p.truce && W.day < p.truce ? ` <span class="chip" ${T("truce")}>truce</span>` : "")
    + `</span></div>` + legs;
  }).join("");
}
function secMilitary(x) {
  const s = x.s, c = x.c;
  const my = D.strength(x.iso, D.allies(x.iso, null)), def = D.defended(x.iso, null), threat = D.threatTo(x.iso, s);
  let html = row("strength", "Strength with allies", r0(my)) + row("defended", "As a defender", r0(def))
           + row("threat", "Threat", threat > 0 ? `outgunned by ${r0(threat)}` : "none")
           + row("weary", "War-weariness", `<span class="wbar"><i style="width:${r0(s.weary || 0)}%"></i></span> ${r0(s.weary || 0)}`);
  for (const w of x.wars) {
    const att = w.att === x.iso, foe = att ? w.def : w.att, lead = att ? w.score : -w.score;
    const side = list => list.length ? " with " + list.map(W.nameOf).map(esc).join(", ") : "";
    html += `<div class="war">` + row("war", `${att ? "Attacking" : "Defending against"} ${W.nameOf(foe)}`, `since ${W.fmtDate(w.since)} · ${lead >= 0 ? "ahead" : "behind"} ${Math.abs(lead).toFixed(2)}`)
          + `<div class="score" ${T("score")}><i style="left:${r0((Math.max(-1, Math.min(1, w.score)) + 1) / 2 * 100)}%"></i></div>`
          + `<div class="dim">${esc(W.nameOf(w.att))}${side(w.allies.att)} vs ${esc(W.nameOf(w.def))}${side(w.allies.def)}`
          + (w.asked && (w.asked.att.length || w.asked.def.length) ? ` · asked: ${esc([...w.asked.att, ...w.asked.def].filter(a => !(w.decided || {})[a]).map(W.nameOf).join(", ") || "all have answered")}` : "")
          + (w.fronts && w.fronts.length ? ` · fronts: ${esc(w.fronts.map(f => `${W.nameOf(f.a)} v ${W.nameOf(f.d)} ${f.score >= 0 ? "+" : ""}${f.score.toFixed(2)}`).join(", "))}` : "")
          + `</div></div>`;
  }
  for (const f of x.fronts) {
    const w = f.war, mine = f.front.a === x.iso, foe = mine ? f.front.d : f.front.a, lead = mine ? f.front.score : -f.front.score;
    html += `<div class="war">` + row("front", `A front against ${W.nameOf(foe)}`, `since ${W.fmtDate(f.front.since)} · ${lead >= 0 ? "ahead" : "behind"} ${Math.abs(lead).toFixed(2)}`)
          + `<div class="score" ${T("score")}><i style="left:${r0((Math.max(-1, Math.min(1, f.front.score)) + 1) / 2 * 100)}%"></i></div>`
          + `<div class="dim">in the war of ${esc(W.nameOf(w.att))} against ${esc(W.nameOf(w.def))}</div></div>`;
  }
  if (s.occupiedBy)
    html += `<div class="traits" ${T("occupation")}>Occupied by <b>${esc(W.nameOf(s.occupiedBy))}</b> until ${W.fmtDate(s.occupiedUntil)} — ${r0(c.occupyRes * 100)}% of resources and ${r0(c.occupySkim * 100)}% of income taken; held ${r0((s.hold || 0) * 100)}% (uprising ${(100 * (D.upriseChanceOf ? D.upriseChanceOf(x.iso) : 0)).toFixed(2)}% a day); decisions made in ${esc(W.nameOf(s.occupiedBy))}</div>`;
  const occ = [];
  for (const o in W.COUNTRY_STATE) if (W.COUNTRY_STATE[o].occupiedBy === x.iso) occ.push(`${esc(W.nameOf(o))} until ${W.fmtDate(W.COUNTRY_STATE[o].occupiedUntil)} (held ${r0((W.COUNTRY_STATE[o].hold || 0) * 100)}%)`);
  if (occ.length) html += `<div class="traits" ${T("occupation")}>Occupying: ${occ.join(", ")} — levies ${(s.levy || 0).toFixed(1)} M people, garrisons ${r0(s.garrison || 0)} force</div>`;
  const past = W.WORLD_STATE.log.filter(e => (e.iso === x.iso || e.iso2 === x.iso) && /^(war|peace|stalemate|victory|front|offer|occupation|release)$/.test(e.kind)).slice(-6).reverse();
  if (past.length) html += `<div class="traits">War history:<br>${past.map(e => `${W.fmtDate(e.d)} ${esc(e.text)}`).join("<br>")}</div>`;
  return html;
}
function secDecisions(x) {
  const s = x.s, h = s.hist || [], P = D.prioritiesOf ? D.prioritiesOf(x.iso) : null;
  let html = "";
  if (P) html += row("priorities", "Priorities", `growth ${P.growth.toFixed(1)} · order ${P.order.toFixed(1)} · guns ${P.guns.toFixed(1)} · science ${P.science.toFixed(1)} · standing ${P.standing.toFixed(1)} <span class="dim">· looks ${r0(P.horizon)} days ahead, keeps ${r0(P.reserve)} days of income</span>`);
  const plan = s.upkeepPlan || {}, skipped = Object.keys(plan).filter(k => plan[k] === 0);
  html += row("budget", "Upkeep", skipped.length ? `<span class="bad">not paying: ${skipped.join(", ")}</span>` : "paid in full");
  if (s.lastMarket) html += row("market", "Market", `bought ${fmtQ(s.lastMarket.qty)} of ${RES_KEYS[s.lastMarket.type]}${s.lastMarket.types > 1 ? ` and ${s.lastMarket.types - 1} other type${s.lastMarket.types > 2 ? "s" : ""}` : ""} on ${W.fmtDate(s.lastMarket.day)}`);
  if (!h.length) return html + `<div class="dim">no decisions yet</div>`;
  return html + h.map(e => row("decision", `${W.fmtDate(e.day)} <span class="dim">${e.loop || ""}</span>`,
    `${esc(e.action)}${e.target != null ? " · " + esc(nameOrStat(e.target)) : ""} <span class="dim">— ${(e.reasons || []).map(esc).join("; ")}</span>`)).join("");
}
function secLinks(x) {
  const L = x.links; if (!L) return `<span class="dim">no links yet</span>`;
  const groups = { land: [], sea: [], air: [] }; let tin = 0, tout = 0;
  for (const i of (L.byIso[x.iso] || [])) {
    const e = L.edges[i], mine = e.a === x.iso, other = mine ? e.b : e.a;
    const out = L.flowAt(i, mine ? 0 : 1), inn = L.flowAt(i, mine ? 1 : 0); tin += inn; tout += out;
    const mount = e.type === "land" && e.range < 1;
    groups[e.type].push([out + inn, `<span title="${esc(W.nameOf(other))} — out ${out.toFixed(2)}, in ${inn.toFixed(2)}${mount ? `, mountains ×${e.range}` : ""}">${esc(W.nameOf(other))}${mount ? " ⛰" : ""}</span>`]);
  }
  let html = row("border", "Borders", ["open", "restricted", "closed"][x.s.border | 0]) + row("flow", "Travel today", `out ${tout.toFixed(1)} · in ${tin.toFixed(1)}`);
  for (const t of ["land", "sea", "air"]) if (groups[t].length) {
    groups[t].sort((a, b) => b[0] - a[0]);
    html += `<div class="routes"><b>${t}</b> ${groups[t].map(g => g[1]).join(", ")}</div>`;
  }
  return html;
}
function secOutbreak(x) {
  const s = x.s;
  if (!s.covered && s.detection <= 0.01) return `<span class="dim">clean — nothing detected here</span>`;
  let profile = "—", traits = "—";
  if (s.profile && window.C) {
    const st = C.statsOf(s.profile.g0, s.profile.g1);
    profile = `${C.MODE_NAME[st.mode]} (Type ${st.type ? "A" : "B"})`;
    traits = ["shield", "dormancy", "adaptor", "reserve", "brewer", "recycler", "lodging"].filter(k => st[k]).join(", ") || "none";
  }
  let html = row("coverage", "Coverage", pct(s.coverageLevel)) + row("detection", "Detection", pct(s.detection))
           + row("govAction", "Gov. action", pct(s.govAction)) + row("response", "Response", `${(s.responseProgress * 100).toFixed(1)}%`)
           + row("profile", "Profile", esc(profile)) + row("traits", "Traits", esc(traits));
  if (x.day < (s.breakthroughUntil || 0)) html += row("detects", "Breakthrough", `until ${W.fmtDate(s.breakthroughUntil)}`);
  const re = (s.hist || []).filter(e => String(e.action).startsWith("react:"));
  if (re.length) html += `<div class="traits">Reactions: ${re.map(e => `${W.fmtDate(e.day)} ${esc(e.action.slice(6))}${e.target != null ? " · " + esc(nameOrStat(e.target)) : ""}`).join("; ")}</div>`;
  return html;
}
function secNews(x) {
  const rows = W.WORLD_STATE.log.filter(e => e.iso === x.iso || e.iso2 === x.iso).slice(-30).reverse();
  if (!rows.length) return `<span class="dim">no headlines yet</span>`;
  return `<div class="news">` + rows.map(e =>
    `<div class="wire-row sev-${e.sev}" data-iso="${e.iso || ""}"><span class="d">${W.fmtDate(e.d)}</span><span class="t">${esc(e.text)}</span></div>`).join("") + `</div>`;
}
function spark(label, series, idx, color, norm) {
  const rows = series.filter(r => r[idx] != null), n = rows.length;
  if (n < 2) return `<div class="spark-item"><span class="lbl" ${T("history", label)}>${label}</span> <span class="dim">needs two months</span></div>`;
  const f = norm || (v => v);                                      // to 0..100 for the line; the label keeps the raw value
  const VW = 120, VH = 40, xs = i => (i / (n - 1)) * VW, ys = v => VH - 2 - (Math.max(0, Math.min(100, f(v))) / 100) * (VH - 4), slot = VW / (n - 1);
  const pts = rows.map((r, i) => `${xs(i).toFixed(1)},${ys(r[idx]).toFixed(1)}`).join(" ");
  const hits = rows.map((r, i) => `<rect x="${(xs(i) - slot / 2).toFixed(1)}" y="0" width="${slot.toFixed(1)}" height="${VH}" fill="transparent"><title>${esc(W.fmtDate(r[0]))} — ${label} ${r[idx]}</title></rect>`).join("");
  return `<div class="spark-item"><span class="lbl" ${T("history", label)}>${label} <b>${rows[n - 1][idx]}</b></span>`
       + `<svg viewBox="0 0 ${VW} ${VH}" preserveAspectRatio="none"><polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.5" vector-effect="non-scaling-stroke"/>${hits}</svg></div>`;
}
function secHistory(x) {
  const ser = x.s.series || [];
  const p0 = ser.length && ser[0][5] ? ser[0][5] : 1;               // population against the first sample: 50 is where it started, 100 is double
  return `<div class="spark">` + spark("economy", ser, 1, "var(--cold)", v => Math.min(100, v)) + spark("stability", ser, 2, "var(--good)")
       + spark("resources", ser, 3, "#e8c650") + spark("military", ser, 4, "var(--warm)")
       + spark("population", ser, 5, "#9fd7ff", v => v / p0 * 50) + spark("legitimacy", ser, 6, "#c9a0ff") + `</div>`;
}
const SECTIONS = [
  { id: "resources", title: "Resources & weather", key: "resources", def: () => true,  render: secResources },
  { id: "stats",     title: "Stats",               key: "stats",     def: () => false, render: secStats },
  { id: "economy",   title: "Economy & treasury",  key: "income",    def: () => false, render: secEconomy },
  { id: "diplomacy", title: "Diplomacy",           key: "relations", def: () => false, render: secDiplomacy },
  { id: "military",  title: "Military & conflict", key: "strength",  def: x => x.wars.length > 0 || x.fronts.length > 0 || !!x.s.occupiedBy, render: secMilitary },
  { id: "decisions", title: "Decisions",           key: "decision",  def: () => false, render: secDecisions },
  { id: "links",     title: "Links & flows",       key: "flow",      def: () => false, render: secLinks },
  { id: "outbreak",  title: "Outbreak",            key: "coverage",  def: x => !!x.s.covered, render: secOutbreak },
  { id: "news",      title: "News",                key: "news",      def: () => false, render: secNews },
  { id: "history",   title: "History",             key: "history",   def: () => false, render: secHistory },
];
function safe(sec, x) {
  try { return sec.render(x); }
  catch (e) { console.error("country screen:", sec.id, e); return `<span class="dim">unavailable</span>`; }
}

/* ── Build, refresh, wire ──────────────────────────────────────── */
function deployLabel() {
  try { return S.player.variants.length ? ` (${S.deployCost(S.player.variants[0])})` : ""; } catch (e) { return ""; }
}
function build(x) {
  header(x);
  const open = loadOpen();
  $("cmBody").innerHTML =
      `<div class="chips" id="cmChips">${chips(x)}</div>`
    + `<div class="vitals" id="cmVitals">${vitals(x)}</div>`
    + `<div class="essentials" id="cmEss">${essentials(x)}</div>`
    + `<div class="country-btns"><button class="good" id="cmDeploy" ${T("deploy", "Deploy here")}>🌍 Deploy here${deployLabel()}</button>`
    + `<button id="cmRegion"${x.region && REGION_IDS.includes(x.region) ? "" : " disabled"}>📊 See region</button>`
    + `<button id="cmPulse" title="Show on map — close this and flash the country">🎯 Show on map</button></div>`
    + `<div class="sections">` + SECTIONS.map(sec => {
        const isOpen = open[sec.id] == null ? sec.def(x) : !!open[sec.id];
        return `<details data-sec="${sec.id}"${isOpen ? " open" : ""}><summary ${T(sec.key, sec.title)}>${sec.title}</summary><div class="sec">${safe(sec, x)}</div></details>`;
      }).join("") + `</div>`;
  wire(x);
}
function refresh() {
  if (!current) return;
  const x = context(current);
  header(x);
  $("cmChips").innerHTML = chips(x);
  $("cmVitals").innerHTML = vitals(x);
  $("cmEss").innerHTML = essentials(x);
  for (const sec of SECTIONS) {
    const d = $("cmBody").querySelector(`details[data-sec="${sec.id}"]`);
    if (d && d.open) d.querySelector(".sec").innerHTML = safe(sec, x);
  }
  lastRender = performance.now();
}
function wire(x) {
  $("cmDeploy").onclick = async () => {
    if (!S.player.variants.length) { await uiAlert("Nothing in storage yet — collect a variant from a plate first."); return; }
    countryModal.close();
    S.openDeployModal(S.player.variants[0], x.iso);
  };
  $("cmRegion").onclick = () => { if (!x.region) return; countryModal.close(); S.openRegionModal(x.region); };
  $("cmPulse").onclick = () => { countryModal.close(); const m = W.worldMap; if (m && m.pulse) m.pulse(x.iso); };
  $("cmBody").querySelectorAll("details").forEach(d => {
    d.addEventListener("toggle", () => {
      const o = loadOpen(); o[d.dataset.sec] = d.open; saveOpen(o);
      if (d.open && current) d.querySelector(".sec").innerHTML = safe(SECTIONS.find(s => s.id === d.dataset.sec), context(current));
    });
  });
  $("cmBody").onclick = e => {
    const r = e.target.closest(".wire-row"); if (!r) return;
    const iso = r.dataset.iso, m = W.worldMap;
    countryModal.close();
    if (m && m.pulse && iso) m.pulse(iso);
  };
}
function openCountryModal(iso2) {
  const c = W.worldMap ? W.worldMap.countries.find(k => k.iso2 === iso2) : null;
  if ((!c && !W.COUNTRY_STATE[iso2]) || !W.isAgent(iso2)) return;   // scenery has no screen
  current = iso2;
  build(context(iso2));
  lastRender = performance.now();
  countryModal.open();
}
$("cmClose").onclick = () => countryModal.close();
$("cmExpand").onclick = () => {
  const ds = [...$("cmBody").querySelectorAll("details")], anyClosed = ds.some(d => !d.open);
  ds.forEach(d => { d.open = anyClosed; });
  $("cmExpand").textContent = anyClosed ? "Collapse all" : "Expand all";
};
// While open, follow the world: at most once a second, with a trailing
// render so the last day of a burst is shown too.
addEventListener("entity:day", () => {
  if (!current) return;
  if (performance.now() - lastRender > 1000) refresh();
  else { clearTimeout(trailing); trailing = setTimeout(() => { if (current) refresh(); }, 1100); }
});
addEventListener("entity:world", () => { if (current) refresh(); });

Object.assign(window.ENTITY, { openCountryModal, refreshCountry: refresh });
})();
