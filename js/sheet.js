/* ═══════════════════════════════════════════════════════════════
   Entity — profile sheet
   The Inspect tool's dialog: everything known about one entity, and
   the Collect button that turns it into a variant.  Owns #sheet and
   its Close button.  host.js opens it with
   SHEET.open(entity, medium, plate, tile); nothing else reaches in.
   ═══════════════════════════════════════════════════════════════ */
(() => {
"use strict";
const { $, toast, modal, rgb, dietNames } = window.UI;
const sheetModal = modal("sheet");
const P0F = [
  ["mode",      "mode",        "the lifestyle toggle — Swarm↔Bloom for Type B, Network↔Shower for Type A"],
  ["type",      "type",        "immutable locus — no adaptation roll reaches it; the tree is fixed at streak"],
  ["diet",      "specialties", "one bit per resource, priced by the specialty ladder"],
  ["huntB",     "hunts Type B", "flat kit cost; target must present a channel you focus"],
  ["huntA",     "hunts Type A", "flat kit cost; target must present a channel you focus"],
  ["shield",    "shield",       "flat — halves incoming damage; with lodging, also scrubs the tile"],
  ["dormancy",  "dormancy",     "flat — idle through famine at DORM_UPK upkeep, at DORM_DIV division rate"],
  ["adaptor",   "adaptor",      "flat — every adaptation roll ×ADAPT_BOOST"],
  ["reserve",   "reserve",      "flat — deeper bank"],
  ["brewer",    "brewer",       "flat — emits its brew-mask output; immune to exact matches of its own brew"],
  ["recycler",  "recycler",     "digestion leaks a byproduct at the tile — the table decides which; also divides RECYCLE_DIV as often"],
  ["lodging",   "lodging",      "opens this tile to a cross-type tenant: both at half scavenge, half upkeep; with a shield, also scrubs the tile"],
];
const P1F = [
  ["id",     "identities", "what it presents — unset bits are cloaked, on the cloak ladder"],
  ["tgt",    "targets",    "what its hunt locks onto — breadth on the target ladder"],
  ["brew",   "brew",       "the output it emits — harms all who present every bit of this mask; cloaking one bit escapes it"],
];
const GENE_HUE = { mode:"#9ab", type:"#9ab", huntB:"#e0505a", huntA:"#c03060",
  shield:"#7fb0d8", dormancy:"#8f86c8", adaptor:"#d6a13f", reserve:"#5fb08a",
  brewer:"#c95cbf", lodging:"#5cc1bd", recycler:"#b8b552" };
function bits(v, w, f) {
  return Array.from({ length: w }, (_, b) => {
    const bit = w - 1 - b, on = (v >>> bit) & 1;
    let col = "";
    if (on) {
      if (f === "diet")                         col = C.SUB[bit].col;
      else if (f === "id" || f === "tgt" || f === "brew") col = "rgb(" + C.CH_RGB[bit].join(",") + ")";
      else if (GENE_HUE[f])                     col = GENE_HUE[f];
    }
    const title = f === "diet" ? C.SUB[bit].name
                : (f === "id" || f === "tgt" || f === "brew") ? "channel " + C.CH_NAME[bit] : f;
    return `<i class="${on ? "on" : ""}" title="${title}"${col ? ` style="background:${col}"` : ""}></i>`;
  }).join("");
}
function buildSheet(o, medium, plate, tile) {
  const s = C.statsOf(o.g0, o.g1);
  const potentialUptake = (() => {
    if (!medium) return null;
    const income = (q, c) => C.SUB[q].rate * c / (c + C.SUB[q].K) * C.SUB[q].yield;
    let total = 0;
    for (let q = 0; q < C.NS; q++)
      if (s.diet & (1 << q)) total += income(q, medium[q]);
    if (o.asleep) total *= C.DORM_UPK;
    return total;
  })();
  const hex = v => "0x" + (v >>> 0).toString(16).padStart(8, "0");
  const fieldRow = ([f, l, why]) => {
    const [, , w] = C.F[f], v = C.get(o.g0, o.g1, f);
    let shown;
    if (f === "mode") shown = C.MODE_NAME[s.mode];
    else if (f === "type") shown = v ? "Type A" : "Type B";
    else if (w === 1) shown = v ? "yes" : "no";
    else shown = C.popcount(v) + "/" + w;
    return `<div class="prow"><span>${l}</span><code>${bits(v, w, f)}</code>`
         + `<b>${shown}</b><em>${why}</em></div>`;
  };
  const strip = (n, lbl) => `<div class="strip"><span>${lbl}</span>`
    + Array.from({ length: 8 }, (_, b) =>
        `<i class="${(n >> b) & 1 ? "on" : ""}">${C.CH_NAME[b]}</i>`).join("") + `</div>`;
  const browFmt = v => v < 0.01 ? `${(v*1e6).toFixed(1)} µe/t` : v.toFixed(6);
  const brow = ([l, v, src]) =>
    `<div class="brow"><span>${l}</span><b>${browFmt(v)}</b><em>${src}</em></div>`;
  const diet = dietNames(s.diet);
  const hunts = [s.huntB && "Type B", s.huntA && "Type A"].filter(Boolean).join(" + ");
  $("sheetbody").innerHTML =
      `<div class="sh-head"><i style="background:${rgb(C.profileColor(o.g0, o.g1))}"></i>`
    + `<div><h3>${C.MODE_NAME[s.mode]}</h3><p>Type ${s.type ? "A" : "B"}`
    + ` · ${diet || "no specialties"}${hunts ? " · hunts " + hunts : ""}</p></div></div>`
    + `<section><h4>Profile</h4>`
    + `<div class="pword">p0 · identity, specialties, traits<u>${hex(o.g0)}</u></div>`
    + P0F.map(fieldRow).join("")
    + `<div class="pword">p1 · three surface profiles<u>${hex(o.g1)}</u></div>`
    + P1F.map(fieldRow).join("")
    + `<p class="note">Bits read high to low within each field. Adaptation flips these directly
       and everything below is derived from them &mdash; nothing is stored twice.
       Spare bits are inert padding: never adapted, never rendered.</p></section>`
    + `<section><h4>Surface</h4>${strip(s.id, "presents")}`
    + strip(s.tgt,  s.huntLive ? "focus" : "targets · latent")
    + strip(s.brew, s.brewLive ? "emits" : "brew · latent")
    + `<p class="note">SUBSET RULE, bites and brews alike: a strike or output lands only
       if <em>every</em> mask bit is presented. One hidden bit escapes it; wider masks
       hit fewer targets, harder &mdash; and an empty mask satisfies nothing, so it never
       fires at all.</p>`
    + (!s.huntLive || !s.brewLive
        ? `<p class="note"><b>Latent.</b> ${
             [!s.huntLive ? "Targets " + (s.hunt ? "(empty mask)" : "(no kit)") : "",
              !s.brewLive ? (s.huntLive ? "Brew " : "brew ")
                          + (s.brewer ? "(empty mask)" : "(no brewer)") : ""]
               .filter(Boolean).join(" and ")
           } cannot fire, so the off-channel ladder bills at LATENT_CH
           (${(C.LATENT_CH * 100).toFixed(0)}% of full).</p>`
        : "")
    + (s.scrubs
        ? `<p class="note"><b>Scrubber.</b> Shield and lodging together destroy
           ${(C.SCRUB_FRAC * 100).toFixed(0)}% of every brew standing in this tile each
           tick, before damage is read &mdash; and the brew is gone from the medium, not
           merely discounted.</p>`
        : (s.shield || s.lodging
            ? `<p class="note">Carries ${s.shield ? "a shield" : "lodging"} but not
               ${s.shield ? "lodging" : "a shield"}: no scrubbing.</p>`
            : ""))
    + (s.vault
        ? `<p class="note"><b>Vault.</b> Reserve, dormancy and shield together. Divides at
           ${(C.VAULT_DIV * 100).toFixed(0)}% of its already-dormant tempo (${(s.divP * 100).toFixed(2)}%/tick),
           pays only ${(C.VAULT_COST * 100).toFixed(0)}% of the usual division friction, and carries an aging
           timescale of ${Math.round(s.senT)} ticks instead of ${C.MODES[s.mode].senT}.</p>`
        : "")
    + (s.spills
        ? `<p class="note"><b>Spiller.</b> Recycler plus bites: ${(C.SPILL_FRAC * 100).toFixed(0)}%
           of whatever a bite fails to absorb drops at the target&rsquo;s tile as remains
           instead of vanishing.</p>`
        : "")
    + `</section>`
    + `<section><h4>Upkeep &mdash; ${(s.upkeep * 1e6).toFixed(1)} µe/t</h4>`
    + s.bill.map(brow).join("")
    + `</section>`
    + `<section><h4>Economy</h4>`
    + brow(["bank", s.bank, `MODES[${C.MODE_NAME[s.mode]}].bank${s.reserve ? " × RESERVE_BANK" : ""}`])
    + brow(["divide at", s.divE, "bank × divThresh"])
    + `<div class="brow"><span>divide chance</span><b>${(s.divP * 100).toFixed(1)}%</b>`
    + `<em>MODES[${C.MODE_NAME[s.mode]}].divChance`
    + `${s.dormancy ? " × DORM_DIV" : ""}${s.recycler && s.dietN ? " × RECYCLE_DIV" : ""}`
    + `${s.vault ? " × VAULT_DIV" : ""}</em></div>`
    + brow(["divide cost", s.divCost,
            `MODES[${C.MODE_NAME[s.mode]}].divCost${s.vault ? " × VAULT_COST" : ""}`])
    + brow(["remains", s.remains, "upkeep × REMAINS_K"])
    + brow(["energy now", o.e, ""])
    + (potentialUptake !== null
        ? (() => {
            const net = potentialUptake - s.upkeep;
            const netSign = net >= 0 ? "+" : "";
            return `<div class="brow"><span>uptake (potential)</span>`
                 + `<b>${(potentialUptake*1e6).toFixed(1)} µe/t</b>`
                 + `<em>Σ Michaelis-Menten at tile medium${o.asleep ? " × DORM_UPK (asleep)" : ""}</em></div>`
                 + `<div class="brow"><span>net (uptake − upkeep)</span>`
                 + `<b class="${net >= 0 ? "good" : "bad"}">${netSign}${(net*1e6).toFixed(1)} µe/t</b>`
                 + `<em>positive = growing; negative = drawing down bank</em></div>`;
          })()
        : "")
    + `<div class="brow"><span>age</span><b>${o.age}</b>`
    + `<em>aging hazard (age/${Math.round(s.senT)})^${C.AGE_P} / ${Math.round(s.senT)}</em></div>`
    + `</section>`
    + (o.tenant ? (() => {
        const gs = C.statsOf(o.tenant.g0, o.tenant.g1);
        const gd = C.SUB.filter((_, q) => gs.diet & (1 << q)).map(x => x.name).join(", ");
        return `<section><h4>Tenant</h4>`
          + `<div class="sh-head"><i style="background:${rgb(C.profileColor(o.tenant.g0, o.tenant.g1))}"></i>`
          + `<div><h3>${C.MODE_NAME[gs.mode]}</h3><p>Type ${gs.type ? "A" : "B"}`
          + ` · ${gd || "no specialties"} · e ${o.tenant.e.toFixed(3)} · age ${o.tenant.age}</p></div></div>`
          + `<p class="note">Both parties scavenge at half rate and pay half upkeep while
             lodging. If the landlord dies, the tenant inherits the tile.</p></section>`;
      })() : "");
  renderSheetFoot(o, plate, tile);
}
function renderSheetFoot(o, plate, tile) {
  const el = $("sheetfoot");
  const S = window.ENTITY;
  if (!S) { el.classList.remove("show"); return; }
  const full   = S.player.variants.length >= S.player.maxVariants;
  const cost   = S.collectCost();
  const scr    = S.collectScrutiny();
  const afford = S.player.money >= cost;
  const pair   = !!o.tenant;
  el.classList.add("show");
  el.innerHTML =
      `<button id="collectBtn" class="good"${(full || !afford) ? " disabled" : ""}>`
    + (pair ? "🧩 Collect pair" : "🧩 Collect as variant") + `</button>`
    + `<span class="cost">`
    + (full ? `<b class="bad">storage full</b>`
            : `💰 <b>${cost}</b> · +<b>${scr}</b> suspicion`
              + (afford ? "" : ` · <b class="bad">not enough money</b>`))
    + (pair ? `<br>landlord and tenant archived together` : "")
    + `</span>`;
  const btn = $("collectBtn");
  if (btn) btn.onclick = async () => {
    const v = await S.collectFromEntity(o, plate ? plate.id : "?");
    if (!v) return;
    // Sampling is destructive: the source entity is consumed.
    if (plate && tile != null)
      plate.ops.push({ op: "cull", at: tile, g0: o.g0, g1: o.g1 });
    sheetModal.close();
    toast(`🧩 Collected <b>${v.name}</b>` + (pair ? " — pair consumed" : " — entity consumed"));
  };
}
$("close").onclick = () => sheetModal.close();
window.SHEET = {
  open(o, medium, plate, tile) { buildSheet(o, medium, plate, tile); sheetModal.open(); },
  close() { sheetModal.close(); },
};
})();
