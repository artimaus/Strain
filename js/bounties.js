/* ═══════════════════════════════════════════════════════════════
   Entity — research projects (bounties)
   The predicate catalogue with its difficulty weights, and the
   generator that composes a project from them for a given title
   rank.  Pure data and pure functions: nothing here touches the
   page or the player.  progression.js consumes these through
   window.ENTITY, which shell.js assembles from this object.
   ═══════════════════════════════════════════════════════════════ */
(() => {
"use strict";
const UNIVERSITIES = [
  "Aldrin Institute","Brannagh Research Group","Castelo BioSciences",
  "Dreyer Foundation","Exton Laboratories","Farrow-Klein Centre",
  "Goldmark Academy","Harcastle Institute",
];
const DIFF = {
  shield:3.09,dormancy:0.70,adaptor:2.86,reserve:3.76,brewer:3.05,recycler:5.09,lodging:5.99,
  "mode.Swarm":1.30,"mode.Network":0.75,"mode.Bloom":1.30,"mode.Shower":0.75,"type.A":0.94,
  "diet.1":1.34,"diet.2":1.11,"diet.3+":2.82,"diet.4+":4.95,"diet.5":10.35,
  "id.hasAx":0.26,"id.hasBo":0.18,"id.hasCq":0.30,"id.hasDn":0.29,
  "id.hasEr":0.23,"id.hasFu":0.25,"id.hasGs":0.29,"id.hasHt":0.20,
  "id.noAx":2.62,"id.noBo":3.11,"id.noCq":2.41,"id.noDn":2.44,
  "id.noEr":2.75,"id.noFu":2.64,"id.noGs":2.47,"id.noHt":2.93,
  "cloakN.3+":3.19,"cloakN.5+":7.25,"cloakN.7+":12.01,
  "tgt.Ax":0.19,"tgt.Bo":0.16,"tgt.Cq":0.17,"tgt.Dn":0.15,
  "tgt.Er":0.16,"tgt.Fu":0.19,"tgt.Gs":0.16,"tgt.Ht":0.18,"tgt.nAx":3.83,
  "brew.Ax":0.13,"brew.Bo":0.09,"brew.Cq":0.13,"brew.Dn":0.12,
  "brew.Er":0.13,"brew.Fu":0.08,"brew.Gs":0.09,"brew.Ht":0.12,
  "brew.nAx":3.76,"brew.nFu":4.73,
};
const CH_LABELS = ["Ax","Bo","Cq","Dn","Er","Fu","Gs","Ht"];
const PRED_DEFS = (()=>{
  const defs=[];
  const add=(key,test,label)=>{ if(DIFF[key]!=null) defs.push({key,test,label,D:DIFF[key]}); };
  add("shield",    st=>!!st.traits.shield,    "has shield");
  add("dormancy",  st=>!!st.traits.dormancy,  "has dormancy");
  add("adaptor",   st=>!!st.traits.adaptor,   "has adaptor");
  add("reserve",   st=>!!st.traits.reserve,   "has reserve");
  add("brewer",    st=>!!st.traits.brewer,    "has brewer");
  add("recycler",  st=>!!st.traits.recycler,  "has recycler");
  add("lodging",   st=>!!st.traits.lodging,   "has lodging");
  add("mode.Swarm",  st=>st.mode===0,         "Swarm mode");
  add("mode.Network",st=>st.mode===1,         "Network mode");
  add("mode.Bloom",  st=>st.mode===2,         "Bloom mode");
  add("mode.Shower", st=>st.mode===3,         "Shower mode");
  add("type.A",      st=>!!st.type,           "Type A");
  add("diet.1", st=>st.dietN===1,"single-diet");
  add("diet.2", st=>st.dietN===2,"dual-diet");
  add("diet.3+",st=>st.dietN>=3, "3+ substrates");
  add("diet.4+",st=>st.dietN>=4, "4+ substrates");
  add("diet.5", st=>st.dietN===5,"full-spectrum");
  CH_LABELS.forEach((c,i)=>{
    add("id.has"+c, st=>!!(st.id&(1<<i)),  "epitope "+c+" visible");
    add("id.no"+c,  st=>!(st.id&(1<<i)),   "cloaked on "+c);
    add("tgt."+c,   st=>!!(st.tgt&(1<<i)), "targets "+c);
    add("brew."+c,  st=>!!(st.brew&(1<<i)),"brews "+c);
  });
  add("cloakN.3+",st=>st.cloakN>=3,"3+ cloak channels");
  add("cloakN.5+",st=>st.cloakN>=5,"5+ cloak channels");
  add("cloakN.7+",st=>st.cloakN>=7,"fully cloaked");
  add("tgt.nAx", st=>!(st.tgt&1)&&st.huntLive, "does not target Ax");
  add("brew.nAx",st=>!(st.brew&1)&&st.brewLive, "does not brew Ax");
  add("brew.nFu",st=>!(st.brew&32)&&st.brewLive,"does not brew Fu");
  return defs;
})();
const PRED_BY_KEY = new Map(PRED_DEFS.map(p=>[p.key,p]));
function diffTier(D){
  if(D<0.5) return"trivial"; if(D<1.5) return"easy"; if(D<3.0) return"mod";
  if(D<5.5) return"hard";    if(D<9.0) return"brut"; return"leg";
}
const DIFF_LABEL={trivial:"Trivial",easy:"Easy",mod:"Moderate",hard:"Hard",brut:"Brutal",leg:"Legendary"};
function diffLabel(D){ return DIFF_LABEL[diffTier(D)]; }
function dToNotoriety(D){ return Math.min(100,Math.round(D*9)); }
function dToMoneyBase(D){ return Math.round(80*Math.pow(2,D*0.55)); }
function dToExpiryTicks(D){ return Math.round((240+1560*Math.min(D,12)/12)/2); } // TICK_MS=2000
function notorietyMult(n){ if(n<25)return 1; if(n<50)return 2; if(n<75)return 3; if(n<90)return 4; return 5; }
const TITLE_D_RANGE=[[0.5,1.5],[0.8,3.0],[2.0,5.0],[3.5,7.5],[6.0,12.0]];
const BPHRASE={
  trait:["profile","specimen","sample","variant","isolate"],
  mode:["colony","culture","formation"],diet:["metabolic panel","substrate profile"],
  id:["epitope screen","antigen panel"],cloak:["evasion panel","concealment study"],
  tgt:["targeting study","hunt-channel screen"],brew:["secretion panel","compound study"],
};
const BVERBS=["study","analysis","characterisation","profiling","survey","assessment"];
const rng=()=>Math.random();
function pickFrom(arr){ return arr[(rng()*arr.length)|0]; }
function rollNormal(mean,sd){ const u=1-rng(),v=rng(); return mean+sd*Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v); }
function rollSplit3(){ let a=rng()+.1,b=rng()+.1,c=rng()+.1; const s=a+b+c; return[a/s,b/s,c/s]; }
function capitalize(s){ return s.charAt(0).toUpperCase()+s.slice(1); }
function generateBounty(titleIdx){
  const[dLo,dHi]=TITLE_D_RANGE[Math.min(titleIdx,TITLE_D_RANGE.length-1)];
  const targetD=dLo+rng()*(dHi-dLo);
  const eligible=PRED_DEFS.filter(p=>p.D>=0.5&&p.D<=dHi*1.3);
  if(!eligible.length) return null;
  const maxCl=Math.min(3,Math.max(1,Math.round(targetD/2)));
  const clauses=[]; let budget=Math.max(targetD,0.5);
  for(let att=0;att<40&&clauses.length<maxCl&&budget>0.3;att++){
    const cands=eligible.filter(p=>!clauses.some(c=>c.key===p.key)&&p.D<=budget*1.5);
    if(!cands.length) break;
    const wts=cands.map(p=>Math.exp(-Math.abs(p.D-budget*0.8)));
    const tot=wts.reduce((a,b)=>a+b,0); let r=rng()*tot;
    let pick=cands[cands.length-1];
    for(let i=0;i<cands.length;i++){r-=wts[i];if(r<=0){pick=cands[i];break;}}
    clauses.push(pick); budget-=pick.D*(clauses.length>1?1.1:1);
  }
  if(!clauses.length) return null;
  const D_total=clauses.reduce((a,c)=>a+c.D,0)*(clauses.length>1?1.1:1);
  if(D_total>13) return null;
  const[mf,nf,sf]=rollSplit3();
  const money=Math.round(dToMoneyBase(D_total)*(0.6+mf*0.8));
  const notoriety=Math.round(dToNotoriety(D_total)*(0.5+nf*1.0));
  const scrutinyBump=Math.round(D_total*(0.5+sf*3.0));
  const cats=[...new Set(clauses.map(c=>{
    const k=c.key;
    if(["shield","dormancy","adaptor","reserve","brewer","recycler","lodging"].includes(k)) return"trait";
    if(k.startsWith("mode.")||k.startsWith("type.")) return"mode";
    if(k.startsWith("diet.")) return"diet";
    if(k.startsWith("cloakN")||k.startsWith("id.no")) return"cloak";
    if(k.startsWith("id.has")) return"id";
    if(k.startsWith("tgt.")) return"tgt";
    if(k.startsWith("brew.")) return"brew";
    return"trait";
  }))];
  const noun=pickFrom(BPHRASE[cats[0]]||BPHRASE.trait);
  const lastWord=noun.split(" ").pop();
  const verbPool=BVERBS.filter(v=>v!==lastWord);
  const name=capitalize(noun)+" "+pickFrom(verbPool.length?verbPool:BVERBS);
  const university=pickFrom(UNIVERSITIES);
  const desc=university+" requests: "+clauses.map(c=>c.label).join(", ")+".";
  const id="bg_"+Date.now().toString(36)+"_"+((rng()*0xffff)|0).toString(16);
  return{id,name,desc,university,D:D_total,tier:diffTier(D_total),
    money,notoriety,scrutinyBump,
    expiryTicks:dToExpiryTicks(D_total),ticksLeft:dToExpiryTicks(D_total),
    clauses,test:st=>{try{return clauses.every(c=>c.test(st));}catch(e){return false;}}};
}

window.BOUNTIES = { UNIVERSITIES, DIFF, PRED_DEFS, PRED_BY_KEY, generateBounty,
                    diffLabel, notorietyMult, rollNormal, pickFrom };
})();
