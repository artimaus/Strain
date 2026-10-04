/* ═══════════════════════════════════════════════════════════════
   Entity — live tuning panel
   Every lever in core, editable while the plates run: the grids and
   groups, units and tips, the feeder-income estimate, export/import.
   Owns every #tune* element and shares nothing back.  Edits reach the
   plates through window.ENTITY_PLATES, which host.js publishes on its
   last line - so it is read only inside tuneApply, never at load.
   ═══════════════════════════════════════════════════════════════ */
(() => {
"use strict";
const { $, modal } = window.UI;
const tuneModal = modal("tune");
const groupOf = path => path.startsWith("TINT_") ? "TINT"
                      : path.includes(".") ? path.slice(0, path.indexOf(".")) : "scalars";
const GROUP_TITLES = { TINT: "Colour — the profile accent", FEEDERS: "FEEDERS", scalars: "scalars" };
const LEVER_LABELS = {
  MODES: p => { const [, i, f] = p.split("."); return C.MODE_NAME[+i] + " · " + f; },
  TINT: p => ({ TINT_BASE:  "accent · all other modes",
                TINT_NET:   "accent · Network scavengers",
                TINT_BLOOM: "accent · hunting Blooms",
                TINT_SAT:   "Network · added saturation",
                TINT_TURN:  "Network · hue sweep",
                TINT_LMAX:  "Network · lightness ceiling" })[p] || p,
  BITCOST: p => { const [, row, i] = p.split("."); return row + " · " + C.MODE_NAME[+i]; },
  SUB: p => { const [, i, f] = p.split("."); return C.SUB[+i].name + " · " + f; },
  FEEDERS: p => { const [, i, f] = p.split("."); return C.SUB[C.FEEDERS[+i].q].name + " feeder · " + f; },
  ADAPT: p => p.slice(6).replace(".", " · "),
  LADR: p => "count multiplier r · " + p.slice(5),
};
const TUNED = new Map();
function tuneApply(path, value) {
  if (!C.tune(path, value)) return false;
  TUNED.set(path, value);
  for (const p of window.ENTITY_PLATES || []) p.ops.push({ op: "tune", path, value });
  return true;
}
const UNITS = [
  [/^MODES\.\d+\.upkeep$/,      "µe/t",       1e6],
  [/^MODES\.\d+\.bank$/,        "e",          1],
  [/^MODES\.\d+\.divThresh$/,   "× bank",     1],
  [/^MODES\.\d+\.divChance$/,   "p/tick",     1],
  [/^MODES\.\d+\.divCost$/,     "e",          1],
  [/^MODES\.\d+\.senT$/,        "ticks",      1],
  [/^MODES\.\d+\.mutScale$/,    "×",          1],
  [/^BITCOST\./,                  "µe/t",       1e6],
  [/^SUB\.\d+\.rate$/,          "m·conc/t",   1e3],
  [/^SUB\.\d+\.K$/,             "conc",       1],
  [/^SUB\.\d+\.yield$/,         "e/conc",     1],
  [/^SUB\.\d+\.polymer$/,       "fraction",   1],
  [/^FEEDERS\.\d+\.rate$/,      "µconc/tile/t", 1e6],
  [/^FEEDERS\.\d+\.gapMed$/,    "ticks",      1],
  [/^FEEDERS\.\d+\.sigma$/,     "σ (log)",    1],
  [/^FEEDERS\.\d+\.amp$/,       "conc peak",  1],
  [/^FEEDERS\.\d+\.dropR$/,     "tiles",      1],
  [/^FEEDERS\.\d+\.drops/,      "count",      1],
  [/^FEEDERS\.\d+\.drop/,       "×",          1],
  [/^ADAPT\.\w+\.p$/,             "‰/birth",    1e3],
  [/^ADAPT\.\w+\.mean$/,          "bits",       1],
  [/^LADR\./,                     "r",          1],
  [/^(BITE_DMG|SHARE_EPS)$/,       "me",         1e3],
  [/^(BITE_XFER|BITE_XFER_SHIELD|SHIELD_BLOCK|SHIELD_SOAK|DORM_UPK|DORM_SLEEP|BATCH_FRAC|RECYCLE_FRAC|BASE_RECYCLE_FRAC|REMAINS_EFF|DIFF_RATE|COMP_DECAY|SCRUB_FRAC|SHARE_KEEP|DIAG_W|FILA_RUN|FILA_BRANCH|HUNT_BANK|HUNT_ROAM|SPILL_FRAC)$/, "fraction", 1],
  [/^(WAKE_MARGIN|RESERVE_BANK|ADAPT_BOOST|MASK_POT|BREW_POT|SHARE_PULL|REMAINS_K|DORM_DIV|RECYCLE_DIV|VAULT_DIV|VAULT_COST|VAULT_AGE)$/, "×", 1],
  [/^(BITE_CD|MOVE_TICKS|DIFF_EVERY|REACH_EVERY|FILA_MAXNB|NS|AGE_P)$/, "count", 1],
  [/^MOVE_GATE$/,                  "µe/t",       1e6],
  [/^EMIT_RATE$/,                  "m·conc/t",   1e3],
  [/^DOSE_DMG$/,                   "µe/conc/t",  1e6],
  [/^REMAINS_DECAY$/,              "µ/t",        1e6],
  [/^CAP$/,                        "conc",       1],
  [/^LATENT_CH$/,                  "fraction",   1],
  [/^TINT_TURN$/,                  "degrees",    1],
  [/^TINT_(SAT|LMAX|BASE|NET|BLOOM)$/, "fraction", 1],
];
function unitOf(path, val) {
  for (const [re, label, scale] of UNITS) if (re.test(path)) return { label, scale };
  if (Math.abs(val) > 0 && Math.abs(val) < .01) return { label: "×10⁻⁶", scale: 1e6 };
  return { label: "", scale: 1 };
}
/* ── TIPS — hover text for every lever. First match wins. Kept free
   of double quotes so they can sit inside title="…" attributes.
   Adapted from the culture-bench tooltip set; every description is
   short, terse, and explains the mechanic rather than restating the
   lever name. */
const TIPS = [
  [/^MODES\.\d+\.upkeep$/,     "base energy this mode burns per tick just to exist — every specialty, kit, and trait bills on top"],
  [/^MODES\.\d+\.bank$/,       "energy storage ceiling — income above a full bank is wasted"],
  [/^MODES\.\d+\.divThresh$/,  "fraction of the bank an entity must hold before it will try to divide"],
  [/^MODES\.\d+\.divChance$/,  "per-tick probability of actually dividing once over the threshold — multiplied by DORM_DIV, RECYCLE_DIV and VAULT_DIV for carriers"],
  [/^MODES\.\d+\.divCost$/,    "flat energy destroyed per division event — the friction of dividing, paid once per event even for Bloom's four"],
  [/^MODES\.\d+\.senT$/,       "senescence timescale in ticks — per-tick death hazard is (age/senT)^AGE_P / senT, so median death lands near 1.2× this"],
  [/^MODES\.\d+\.mutScale$/,   "multiplies every non-mode adaptation rate for this mode"],
  [/^BITCOST\.enzGlu/,         "per-tick upkeep of the glucose enzyme, scaled by the enz ladder for the total enzyme count"],
  [/^BITCOST\.enzSuc/,         "per-tick upkeep of the sucrose enzyme, scaled by the enz ladder for the total enzyme count"],
  [/^BITCOST\.enzPro/,         "per-tick upkeep of the protein enzyme, scaled by the enz ladder for the total enzyme count"],
  [/^BITCOST\.enzCel/,         "per-tick upkeep of the cellulose enzyme, scaled by the enz ladder for the total enzyme count"],
  [/^BITCOST\.enzNec/,         "per-tick upkeep of the necrose (remains) enzyme, scaled by the enz ladder for the total enzyme count"],
  [/^BITCOST\.kitB/,           "hunting kit for Type B prey — needed to bite them; bills zero while the cooldown runs"],
  [/^BITCOST\.kitA/,           "hunting kit for Type A prey — needed to bite them; bills zero while the cooldown runs"],
  [/^BITCOST\.shield/,         "armour trait — SHIELD_BLOCK chance a bite glances off, and chemical damage is blunted to SHIELD_SOAK. Paired with lodging, also scrubs SCRUB_FRAC of the tile's brew each tick"],
  [/^BITCOST\.dormancy/,       "sleep trait — idle through famine at DORM_UPK upkeep, at the price of dividing DORM_DIV as often"],
  [/^BITCOST\.adaptor/,        "raises every adaptation rate for the carrier by ADAPT_BOOST ×"],
  [/^BITCOST\.reserve/,        "deepens the energy bank by RESERVE_BANK × (the divide-at bar scales with it)"],
  [/^BITCOST\.brewer/,         "brewing trait — emits EMIT_RATE conc/tick of the compound matching its brew mask"],
  [/^BITCOST\.lodging/,        "host gene — opens the tile to a cross-type tenant; both at half scavenge, half upkeep. Paired with a shield, also scrubs SCRUB_FRAC of the tile's brew each tick"],
  [/^BITCOST\.recycleEnz/,     "byproduct recycler, billed per enzyme carried — digestion leaks RECYCLE_FRAC of the grazed energy as the diet's waste substrate, and divides RECYCLE_DIV as often"],
  [/^BITCOST\.cloakBit/,       "per hidden identity bit — hides from teeth and brews alike (cloak ladder applies)"],
  [/^BITCOST\.tgtOffBit/,      "per disabled target channel — WIDENS a hunter's menu (fewer bits to satisfy under the subset rule) at the price of bite potency, which scales with the bits left on; bills zero while hunting live and digesting"],
  [/^BITCOST\.brewOffBit/,     "per disabled brew channel — WIDENS a compound to more victims, each hit for less: potency scales with the bits left on"],
  [/^SUB\.\d+\.rate$/,         "maximum graze per tick at saturating concentration"],
  [/^SUB\.\d+\.K$/,            "half-saturation concentration — lower means easier to eat when scarce"],
  [/^SUB\.\d+\.yield$/,        "energy gained per unit of concentration grazed"],
  [/^SUB\.\d+\.polymer$/,      "mobility: 0 diffuses freely across the plate, 1 stays where it lands"],
  [/^FEEDERS\.\d+\.rate$/,     "the seep tide — concentration welling up in every plate tile, every tick"],
  [/^FEEDERS\.\d+\.gapMed$/,   "median gap between drip events at the 84-plate (log-normal clock, scaled by plate area)"],
  [/^FEEDERS\.\d+\.sigma$/,    "log-normal spread of the gaps — bigger means wetter clusters and harsher droughts"],
  [/^FEEDERS\.\d+\.dropsMin$/, "fewest droplets a drip event scatters"],
  [/^FEEDERS\.\d+\.dropsMax$/, "most droplets a drip event scatters (the count skews low)"],
  [/^FEEDERS\.\d+\.dropR$/,    "base droplet radius in tiles — each droplet is its own gaussian bell"],
  [/^FEEDERS\.\d+\.amp$/,      "droplet peak concentration before its per-droplet size factor"],
  [/^FEEDERS\.\d+\.dropFloor$/, "minimum droplet size factor — the stingiest possible speck"],
  [/^FEEDERS\.\d+\.dropSpread$/, "range of the droplet size factor above the floor — how fat the fattest prize is"],
  [/^FEEDERS\.\d+\.dropPow$/,  "skew of the size factor — higher means more nibbles and rarer feasts"],
  [/^ADAPT\.mode\.p$/,         "chance per birth of a lifestyle flip: Swarm↔Bloom for Type B, Network↔Shower for Type A"],
  [/^ADAPT\.\w+\.p$/,          "chance per birth that this field adapts at all"],
  [/^ADAPT\.\w+\.mean$/,       "average bits flipped when an adaptation fires (geometric draw)"],
  [/^LADR\.enz$/,              "count multiplier for enzymes + hunting kits: carrying n reprices each at cell × r^(n−1)"],
  [/^LADR\.cloak$/,            "count multiplier for hidden identity bits: hiding n reprices each at cell × r^(n−1)"],
  [/^LADR\.tgt$/,              "count multiplier for disabled target channels: n off reprices each at cell × r^(n−1)"],
  [/^LADR\.brew$/,             "count multiplier for disabled brew channels: n off reprices each at cell × r^(n−1)"],
  [/^CAP$/,                    "concentration ceiling per tile — anything poured or leaked above this is lost"],
  [/^HUNT_BANK$/,              "each hunting kit deepens the bank by this fraction — predators can gorge on siege income"],
  [/^RESERVE_BANK$/,           "reserve trait: bank multiplier (the divide-at energy scales with it)"],
  [/^MOVE_GATE$/,              "Swarm chemotaxis threshold — moves when a neighbour beats home income by this (grazers only; prowling hunters ignore the gate)"],
  [/^MOVE_TICKS$/,             "a Swarm move holds both tiles this many ticks: paying upkeep, unable to eat, hunt, brew, or divide"],
  [/^HUNT_ROAM$/,              "a Swarm hunter's chance of prowling at random instead of following the substrate gradient — its food is prey, which the gradient cannot see"],
  [/^SHARE_EPS$/,              "Network sharing skips differences smaller than this — grow instead"],
  [/^SHARE_PULL$/,             "frontier bias of Network sharing: partners weighted by openness^this; 0 is blind equalisation"],
  [/^SHARE_KEEP$/,             "a cell with an open side keeps this much surplus for its own growth before equalising outward"],
  [/^DORM_SLEEP$/,             "dormant carriers fall asleep below this fraction of their divide-at energy"],
  [/^WAKE_MARGIN$/,            "sleepers wake when local edible income reaches this × their own upkeep"],
  [/^DORM_UPK$/,               "upkeep multiplier while asleep — the rent on the pillow"],
  [/^DORM_DIV$/,               "dormancy carriers divide-chance multiplier — the sleep machinery slows them down even awake"],
  [/^EMIT_RATE$/,              "concentration a brewer adds to its compound channel per tick"],
  [/^COMP_DECAY$/,             "compound concentration multiplier per tick — how fast brews fade"],
  [/^REMAINS_DECAY$/,          "remains rot: fraction of a tile's necrose converting to protein per tick"],
  [/^REMAINS_EFF$/,            "energy efficiency of the necrose→protein conversion; the rest is lost to the air"],
  [/^DOSE_DMG$/,               "energy damage per unit compound concentration per tick to matching victims"],
  [/^DIFF_EVERY$/,             "diffusion cadence — the whole-plate pass runs every this many ticks"],
  [/^DIFF_RATE$/,              "eight-way share of a tile's substrate moved per diffusion pass, × (1 − polymer)"],
  [/^DIAG_W$/,                 "diagonal placement weight — raise toward .7 for squarer colonies, lower for rounder"],
  [/^FILA_RUN$/,               "chance a Network filament child continues dead straight; otherwise it wobbles ±45°"],
  [/^FILA_BRANCH$/,            "chance a filament segment sprouts a perpendicular runner, as a fraction of division tempo"],
  [/^FILA_MAXNB$/,             "filament growth refuses a target tile with more occupied neighbours than this — keeps daylight between strands"],
  [/^REACH_EVERY$/,            "every N ticks an entity also grazes its unoccupied cardinal neighbours — a frontier bonus"],
  [/^SHIELD_BLOCK$/,           "chance a bite glances off a shield entirely"],
  [/^SHIELD_SOAK$/,            "fraction of chemical damage a shield lets through"],
  [/^SCRUB_FRAC$/,             "shield + lodging together destroy this share of the brew in their tile each tick, before damage — neither gene does it alone"],
  [/^VAULT_DIV$/,              "reserve + dormancy + shield together multiply divide-chance by this, ON TOP of DORM_DIV — the net for a vault is a quarter of its mode tempo"],
  [/^VAULT_COST$/,             "reserve + dormancy + shield together multiply the flat friction of a division event by this — a vault is built to be opened"],
  [/^VAULT_AGE$/,              "reserve + dormancy + shield together multiply the senescence timescale by this — the triple buys duration with tempo"],
  [/^SPILL_FRAC$/,             "share of the bite a hunter failed to absorb that a recycler carrier drops as remains at the prey tile — hunting grounds fertilise themselves"],
  [/^ADAPT_BOOST$/,            "adaptor trait multiplies every adaptation probability by this"],
  [/^BATCH_FRAC$/,             "fraction of the parent's post-cost energy transferred to the brood, split equally across broodSize"],
  [/^AGE_P$/,                  "senescence hazard exponent: per-tick death chance is (age/senT)^p / senT"],
  [/^REMAINS_K$/,              "remains energy = the dead entity's upkeep × this — big eaters leave rich remains"],
  [/^RECYCLE_FRAC$/,           "fraction of grazed energy recycler carriers leak as their diet's waste substrate"],
  [/^BASE_RECYCLE_FRAC$/,      "fraction of cellulose energy non-recycler carriers leak as glucose — the baseline wasteful conversion, independent of RECYCLE_FRAC"],
  [/^RECYCLE_DIV$/,            "recycler carriers divide-chance multiplier — running digestion hot makes daughters faster"],
  [/^MASK_POT$/,               "bite potency bonus per target-mask bit beyond the first — surgical masks hit fewer victims, harder"],
  [/^BREW_POT$/,               "compound potency bonus per brew-mask bit beyond the first — a gentler curve than teeth"],
  [/^BITE_DMG$/,               "energy drained from prey per landed bite — bites wound, they do not kill"],
  [/^BITE_XFER$/,              "fraction of the drain the hunter absorbs; the rest is violence, spilled not eaten — and SPILL_FRAC of that lands as remains if the hunter carries a recycler"],
  [/^BITE_XFER_SHIELD$/,       "absorbed fraction against shielded prey — the shield both blocks and blunts"],
  [/^BITE_CD$/,                "digestion ticks after a landed bite: no biting, hunting gear bills zero, and a Swarm hunter holds its ground instead of walking — it camps the prey it wounded"],
  [/^LATENT_CH$/,              "price of a channel mask that cannot fire, as a fraction of the full off-bit bill — target masks without a hunting kit, brew masks without a brewer, and either family with an empty mask. 0 makes latent masks free storage again"],
  [/^TINT_BASE$/,              "genome tint strength for every mode except the two below — how far diet and identity pull a strain off its ramp colour"],
  [/^TINT_NET$/,               "genome tint strength for Network scavengers — the pale mat carries the strongest accent"],
  [/^TINT_BLOOM$/,             "genome tint strength for hunting Blooms — the tan-to-chocolate ramp"],
  [/^TINT_SAT$/,               "saturation ADDED to a Network scavenger (not multiplied — the grey ramp has nothing to multiply). 0 restores the old grey mat, .6 is frank pastel"],
  [/^TINT_TURN$/,              "hue sweep in degrees at full accent for a Network scavenger — 360 spreads the tint across the whole wheel, 46 is the narrow turn every other mode uses"],
  [/^TINT_LMAX$/,              "lightness ceiling for a tinted Network scavenger — without it the palest strains reach pure white, where any saturation is invisible"],
];
const tipOf = path => { for (const [re, t] of TIPS) if (re.test(path)) return t; return ""; };
function feederIncome() {
  const parts = [];
  for (const F of C.FEEDERS) {
    const y = C.SUB[F.q].yield;
    let e;
    if (F.kind === "seep") e = F.rate * y;
    else {
      const meanGap = F.gapMed * Math.exp(F.sigma * F.sigma / 2);
      const M = Math.max(1, (F.dropsMax | 0) - (F.dropsMin | 0) + 1);
      let nDrops = F.dropsMin;
      for (let k = 1; k < M; k++) nDrops += 1 - Math.pow(k / M, 2 / 3);
      let bell = 0; const S = 512;
      for (let i = 0; i < S; i++) {
        const u = (i + .5) / S;
        const f = F.dropFloor + F.dropSpread * Math.pow(u, F.dropPow);
        const rad = F.dropR * (.7 + .6 * f);
        bell += F.amp * f * Math.PI * rad * rad * (1 - Math.exp(-3.24));
      }
      bell /= S;
      const tiles = 84 * 84 * Math.PI / 4 * .92;
      e = nDrops * bell / meanGap / tiles * y;
    }
    parts.push({ q: F.q, kind: F.kind, e });
  }
  return parts;
}
function updateFeedCalc() {
  const el = $("tunefeed"); if (!el) return;
  const parts = feederIncome();
  const total = parts.reduce((a, p) => a + p.e, 0);
  const µ = v => (v * 1e6).toFixed(1);
  el.innerHTML = `<b>feeder income ≈ ${µ(total)} µe/tile/t</b> — `
    + parts.map(p => `${C.SUB[p.q].name.toLowerCase()} ${p.kind} ${µ(p.e)}`).join(" + ")
    + ` <i>(vs mode upkeeps ${C.MODES.map(m => Math.round(m.upkeep * 1e6)).join("/")} µe/t)</i>`;
}
const GRIDS = [
  { top:"MODES",   title:"Mode table — upkeep in µe/t · bank/divCost in e · senT in ticks",
    cols: () => C.MODE_NAME, rows: () => ["upkeep","bank","divThresh","divChance","divCost","senT","mutScale"],
    path: (r, ci) => `MODES.${ci}.${r}` },
  { top:"BITCOST", title:"Cost table — µe/t per tile",
    cols: () => C.MODE_NAME, rows: () => Object.keys(C.BITCOST),
    path: (r, ci) => `BITCOST.${r}.${ci}` },
  { top:"SUB",     title:"Resources — rate in m·conc/t · K in conc · yield in e/conc",
    cols: () => C.SUB.map(x => x.name), rows: () => ["rate","K","yield","polymer"],
    path: (r, ci) => `SUB.${ci}.${r}` },
  { top:"ADAPT",   title:"Adaptation — p in ‰ per birth · mean in bits",
    cols: () => Object.keys(C.ADAPT), rows: () => ["p","mean"],
    path: (r, ci) => `ADAPT.${Object.keys(C.ADAPT)[ci]}.${r}` },
  { top:"LADR",    title:"Count multipliers — r per extra item",
    cols: () => Object.keys(C.LADR), rows: () => ["r"],
    path: (r, ci) => `LADR.${Object.keys(C.LADR)[ci]}` },
];
const leverVal = path => { let o = C; for (const k of path.split(".")) { o = o?.[k]; } return o; };
const inputFor = (path, val) => {
  const { label, scale } = unitOf(path, val);
  const tip = tipOf(path);
  const shown = +(val * scale).toPrecision(6);
  const step = Math.abs(shown) >= 100 ? 1 : Math.abs(shown) >= 10 ? .1 : Math.abs(shown) >= 1 ? .01 : .001;
  return `<span class="uwrap"><input type="number" data-path="${path}" data-scale="${scale}"`
       + ` title="${path}${tip ? " — " + tip : ""}"`
       + ` value="${shown}" step="${step}"${TUNED.has(path) ? ' class="changed"' : ""}>`
       + (label ? `<u>${label}</u>` : "") + `</span>`;
};
function buildTune(filter) {
  const f = (filter || "").trim().toLowerCase();
  const all = C.levers();
  let html = "", shown = 0;
  const gridded = new Set();
  for (const G of GRIDS) {
    const cols = G.cols(), rows = G.rows().filter(r => {
      if (!f) return true;
      return (G.top + " " + r + " " + G.title).toLowerCase().includes(f)
          || cols.some(c => (c + " " + r).toLowerCase().includes(f));
    });
    for (const r of G.rows()) cols.forEach((_, ci) => gridded.add(G.path(r, ci)));
    if (!rows.length) continue;
    html += `<h5>${G.title}</h5><table class="tgrid"><tr><th></th>`
          + cols.map(c => `<th>${c}</th>`).join("") + `</tr>`;
    for (const r of rows) {
      const rtip = tipOf(G.path(r, 0));
      html += `<tr><th${rtip ? ` title="${rtip}"` : ""}>${r}</th>`;
      cols.forEach((_, ci) => {
        const p = G.path(r, ci), v = leverVal(p);
        if (typeof v !== "number") { html += `<td></td>`; return; }
        shown++; html += `<td>${inputFor(p, v)}</td>`;
      });
      html += `</tr>`;
    }
    html += `</table>`;
  }
  const rest = all.filter(([p]) => !gridded.has(p));
  const groups = new Map();
  for (const [path, val] of rest) {
    const top = groupOf(path);
    const label = LEVER_LABELS[top] ? LEVER_LABELS[top](path) : path;
    if (f && !(path.toLowerCase().includes(f) || label.toLowerCase().includes(f))) continue;
    if (!groups.has(top)) groups.set(top, []);
    groups.get(top).push([path, val, label]); shown++;
  }
  for (const top of [...groups.keys()].sort((a, b) => (b === "TINT") - (a === "TINT"))) {
    const rows = groups.get(top);
    html += `<h5>${GROUP_TITLES[top] || top}</h5><div class="levgrid">`;
    for (const [path, val, label] of rows) {
      const tip = tipOf(path);
      html += `<div class="lev"><span title="${path}${tip ? " — " + tip : ""}">${label}</span>${inputFor(path, val)}</div>`;
    }
    html += `</div>`;
  }
  $("tunecount").textContent = shown + " of " + all.length + " levers";
  $("tunebody").innerHTML = html || `<p class="note">nothing matches</p>`;
  updateFeedCalc();
}
function exportLevers(onlyChanged) {
  const lines = [`# Entity levers · ${new Date().toISOString().slice(0, 16)}`
               + (onlyChanged ? ` · ${TUNED.size} changed` : " · full set")];
  for (const [path, val] of C.levers()) {
    if (onlyChanged && !TUNED.has(path)) continue;
    const { label, scale } = unitOf(path, val);
    lines.push(`${path} = ${val}` + (label ? `    # ${+(val * scale).toPrecision(6)} ${label}` : ""));
  }
  return lines.join("\n");
}
function importLevers(text) {
  let applied = 0, failed = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.split("#")[0].trim();
    if (!line) continue;
    const m = line.match(/^([A-Za-z0-9_.]+)\s*=\s*([-+0-9.eE]+)$/);
    if (!m) { failed.push(raw.trim()); continue; }
    if (tuneApply(m[1], +m[2])) applied++; else failed.push(m[1]);
  }
  return { applied, failed };
}
$("tuneexport").onclick = () => {
  const io = $("tuneio"); io.classList.add("open");
  io.value = TUNED.size ? exportLevers(true) : "# no levers changed yet — edit something, or use Export all";
  io.select(); try { navigator.clipboard?.writeText(io.value); } catch (e) {}
};
$("tuneexportall").onclick = () => {
  const io = $("tuneio"); io.classList.add("open");
  io.value = exportLevers(false); io.select();
  try { navigator.clipboard?.writeText(io.value); } catch (e) {}
};
$("tuneimport").onclick = () => {
  const io = $("tuneio");
  if (!io.classList.contains("open") || !io.value.trim()) { io.classList.add("open"); io.focus(); return; }
  const { applied, failed } = importLevers(io.value);
  io.value = `# applied ${applied} lever${applied === 1 ? "" : "s"}`
           + (failed.length ? `\n# could not apply: ${failed.join(", ")}` : "")
           + "\n" + io.value;
  buildTune($("tunefind").value);
};
$("tunebtn").onclick = () => { buildTune($("tunefind").value); tuneModal.open(); $("tunefind").focus(); };
$("tuneclose").onclick = () => tuneModal.close();
$("tunefind").oninput = () => buildTune($("tunefind").value);
$("tunebody").onchange = e => {
  const inp = e.target; if (!inp.dataset.path) return;
  const scale = +inp.dataset.scale || 1;
  if (tuneApply(inp.dataset.path, inp.value / scale)) inp.classList.add("changed");
  else { const v = leverVal(inp.dataset.path); inp.value = +(v * scale).toPrecision(6); }
  if (/^(FEEDERS\.|SUB\.\d+\.yield|MODES\.\d+\.upkeep)/.test(inp.dataset.path)) updateFeedCalc();
};
window.TUNE = { apply: tuneApply, build: buildTune };   // for the console / smoke test
})();
