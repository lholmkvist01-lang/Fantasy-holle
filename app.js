const SUPABASE_URL = "https://gwrjhlutvrnnbqemtwqm.supabase.co";
const SUPABASE_KEY = "sb_publishable_tLF0vjaiHVD9wGsy5QGMxA_cqUaJE5G";
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const DEFAULT_PLAYERS = [{"id": "gk_sjodahl", "name": "Sjödahl", "pos": "GK", "price": 6.0}, {"id": "gk_z", "name": "Z", "pos": "GK", "price": 5.0}, {"id": "gk_fredde", "name": "Fredde", "pos": "GK", "price": 4.0}, {"id": "d_acke", "name": "Acke", "pos": "D", "price": 10.0}, {"id": "d_andy", "name": "Andy", "pos": "D", "price": 7.5}, {"id": "d_tim", "name": "Tim", "pos": "D", "price": 7.0}, {"id": "d_wiggo", "name": "Wiggo", "pos": "D", "price": 5.5}, {"id": "d_lukas", "name": "Lukas", "pos": "D", "price": 4.5}, {"id": "d_roxe", "name": "Roxe", "pos": "D", "price": 4.5}, {"id": "d_lenny", "name": "Lenny", "pos": "D", "price": 4.0}, {"id": "d_lauk", "name": "Lauk", "pos": "D", "price": 5.0}, {"id": "f_jens", "name": "Jens", "pos": "F", "price": 15.0}, {"id": "f_izzy", "name": "Izzy", "pos": "F", "price": 10.5}, {"id": "f_erille", "name": "Erille", "pos": "F", "price": 9.0}, {"id": "f_nysten", "name": "Nysten", "pos": "F", "price": 12.5}, {"id": "f_fabbe", "name": "Fabbe", "pos": "F", "price": 7.0}, {"id": "f_perez", "name": "Perez", "pos": "F", "price": 8.0}, {"id": "f_leo", "name": "Leo", "pos": "F", "price": 7.5}, {"id": "f_anton", "name": "Anton", "pos": "F", "price": 4.0}, {"id": "f_gustav", "name": "Gustav", "pos": "F", "price": 4.0}, {"id": "f_pippi", "name": "Pippi", "pos": "F", "price": 5.5}, {"id": "f_oskar", "name": "Oskar", "pos": "F", "price": 5.0}, {"id": "f_axel_holmberg", "name": "Axel Holmberg", "pos": "F", "price": 4.5}];
const BUDGET = 45;
const POS_LIMITS = {GK:1,D:2,F:3};
const POS_LABELS = {GK:"Målvakt",D:"Back",F:"Forward"};
const ROUND_MATCHES = [5,5,5,5,2];

const SCORING = {
  GK: {goal:20, assist:8, played:1, savedPenalty:3, pen2:-2, pen10:-4, matchPenalty:-10},
  D:  {goal:5, assist:2, played:1, missedPenalty:-3, plusPositive:2, plusNegative:-2, pen2:-2, pen10:-4, matchPenalty:-10},
  F:  {goal:3, assist:2, played:1, missedPenalty:-3, plusPositive:2, plusNegative:-2, pen2:-2, pen10:-4, matchPenalty:-10}
};

const KEY = "fantasyHolleFull_v2";

function deepClone(o){ return JSON.parse(JSON.stringify(o)); }
function blankState(){
  return {
    version: 2,
    leagueName: "Fantasy Hölle 26/27",
    players: deepClone(DEFAULT_PLAYERS),
    managers: [
      {id:"demo_lukas", name:"Lukas", pin:"7373", teams:{}, createdAt:Date.now()},
      {id:"demo_jens", name:"Jens", pin:"1111", teams:{}, createdAt:Date.now()},
      {id:"demo_pippi", name:"Pippi", pin:"2222", teams:{}, createdAt:Date.now()}
    ],
    currentManagerId: "demo_lukas",
    currentRound: 1,
    rounds: ROUND_MATCHES.map((count,i)=>({id:i+1,name:`Omgång ${i+1}`,matches:count,locked:false})),
    stats: {}, // stats[round][match][playerId]
    adminPin: "2627",
    settings: {
      bottom3Fine: 100,
      overallLastFine: 200,
      prizes: [300,150,75],
      freeTransfers: 2
    }
  };
}
let state = load();

function load(){
  try{
    const raw = localStorage.getItem(KEY);
    if(raw) return JSON.parse(raw);
  }catch(e){}
  return blankState();
}
async function save(){
  localStorage.setItem(KEY, JSON.stringify(state));

  const { error } = await db
    .from("fantasy_state")
    .upsert({
      id: "main",
      data: state,
      updated_at: new Date().toISOString()
    });

  if(error){
    console.error("Supabase save error:", error);
  }

  refreshAll();
}
function money(v){ return Number(v).toFixed(1).replace(".",",")+" m"; }
function el(id){ return document.getElementById(id); }
function showToast(msg){
  const t=el("toast"); t.textContent=msg; t.classList.add("show");
  setTimeout(()=>t.classList.remove("show"),1800);
}
function currentManager(){ return state.managers.find(m=>m.id===state.currentManagerId) || state.managers[0]; }
function teamFor(manager, round=state.currentRound){ return manager.teams[String(round)] || []; }
function playerById(id){ return state.players.find(p=>p.id===id); }
function teamCost(ids){ return ids.reduce((s,id)=>s+(playerById(id)?.price||0),0); }
function countPos(ids,pos){ return ids.filter(id=>playerById(id)?.pos===pos).length; }
function validTeam(ids){
  return ids.length===6 && countPos(ids,"GK")===1 && countPos(ids,"D")===2 && countPos(ids,"F")===3 && teamCost(ids)<=BUDGET;
}
function positionSlots(ids){
  return {GK:ids.filter(id=>playerById(id)?.pos==="GK"),D:ids.filter(id=>playerById(id)?.pos==="D"),F:ids.filter(id=>playerById(id)?.pos==="F")};
}
function statBlank(){
  return {played:0, goals:0, assists:0, savedPenalty:0, missedPenalty:0, pen2:0, pen10:0, matchPenalty:0, plusMinus:0, conceded:""};
}
function getStat(round,match,pid){
  return (((state.stats[String(round)]||{})[String(match)]||{})[pid]) || statBlank();
}
function setStat(round,match,pid,obj){
  state.stats[String(round)] ||= {};
  state.stats[String(round)][String(match)] ||= {};
  state.stats[String(round)][String(match)][pid] = obj;
}
function calcScore(player, s){
  let pts = 0;
  const cfg = SCORING[player.pos];
  pts += Number(s.goals||0)*cfg.goal;
  pts += Number(s.assists||0)*cfg.assist;
  if(Number(s.played||0)>0) pts += cfg.played;
  pts += Number(s.pen2||0)*cfg.pen2;
  pts += Number(s.pen10||0)*cfg.pen10;
  pts += Number(s.matchPenalty||0)*cfg.matchPenalty;
  if(player.pos==="GK"){
    pts += Number(s.savedPenalty||0)*cfg.savedPenalty;
    if(s.conceded!=="" && Number(s.played||0)>0){
      const c=Number(s.conceded);
      if(c<=3) pts += 5;
      else if(c<=5) pts += 3;
      else if(c>=9) pts -= 5;
      else if(c>=7) pts -= 2;
    }
  } else {
    pts += Number(s.missedPenalty||0)*cfg.missedPenalty;
    const pm=Number(s.plusMinus||0);
    if(pm>0) pts += cfg.plusPositive;
    else if(pm<0) pts += cfg.plusNegative;
  }
  return pts;
}
function playerRoundScore(pid,round){
  const p=playerById(pid); if(!p) return 0;
  const r = state.rounds.find(x=>x.id===Number(round)); if(!r) return 0;
  let total=0;
  for(let m=1;m<=r.matches;m++) total += calcScore(p,getStat(round,m,pid));
  return total;
}
function managerRoundScore(manager,round){
  return teamFor(manager,round).reduce((s,pid)=>s+playerRoundScore(pid,round),0);
}
function managerTotal(manager){
  return state.rounds.reduce((s,r)=>s+managerRoundScore(manager,r.id),0);
}
function standings(){
  return [...state.managers].map(m=>({m,total:managerTotal(m)})).sort((a,b)=>b.total-a.total);
}
function finesTable(){
  const map={};
  state.managers.forEach(m=>map[m.id]=0);
  for(const r of state.rounds){
    const arr=[...state.managers].map(m=>({id:m.id,score:managerRoundScore(m,r.id)})).sort((a,b)=>a.score-b.score);
    arr.slice(0,Math.min(3,arr.length)).forEach(x=>map[x.id]+=Number(state.settings.bottom3Fine||0));
  }
  const overall=standings().slice().reverse();
  if(overall.length) map[overall[0].m.id]+=Number(state.settings.overallLastFine||0);
  const top=standings();
  top.slice(0,3).forEach((x,i)=>map[x.m.id]-=Number(state.settings.prizes[i]||0));
  return map;
}
function nav(view){
  document.querySelectorAll(".view").forEach(v=>v.classList.remove("active"));
  document.querySelectorAll(".navbtn").forEach(v=>v.classList.remove("active"));
  el("view-"+view).classList.add("active");
  document.querySelector(`.navbtn[data-view="${view}"]`)?.classList.add("active");
  window.scrollTo({top:0,behavior:"smooth"});
  refreshAll();
}
window.nav=nav;

function refreshHeader(){
  el("leagueTitle").textContent=state.leagueName;
  el("roundSelect").innerHTML=state.rounds.map(r=>`<option value="${r.id}" ${r.id===state.currentRound?"selected":""}>${r.name}</option>`).join("");
  const m=currentManager();
  el("managerSelect").innerHTML=state.managers.map(x=>`<option value="${x.id}" ${x.id===m.id?"selected":""}>${x.name}</option>`).join("");
}
function refreshTeam(){
  const m=currentManager(), ids=teamFor(m);
  const cost=teamCost(ids), left=BUDGET-cost;
  el("teamManagerName").textContent=m.name;
  el("budgetLeft").textContent=money(left);
  el("budgetSpent").textContent=money(cost);
  el("teamCount").textContent=`${ids.length}/6`;
  el("budgetBar").style.width=Math.min(100,(cost/BUDGET)*100)+"%";
  el("roundLockBadge").textContent=state.rounds[state.currentRound-1].locked?"LÅST":"ÖPPEN";
  el("roundLockBadge").className="badge "+(state.rounds[state.currentRound-1].locked?"danger":"ok");
  renderTeamSlots(ids);
  renderMarket();
}
let activeMarketPos="GK";
function renderTeamSlots(ids){
  const pos=positionSlots(ids);
  const area=el("teamSlots"); area.innerHTML="";
  for(const p of ["GK","D","F"]){
    const title=document.createElement("div"); title.className="section-label"; title.textContent=POS_LABELS[p]; area.appendChild(title);
    for(let i=0;i<POS_LIMITS[p];i++){
      const pid=pos[p][i], pl=playerById(pid);
      const d=document.createElement("div"); d.className="slot "+(pl?"filled":"");
      d.innerHTML = pl ? `<div><b>${pl.name}</b><small>${money(pl.price)} • ${playerRoundScore(pl.id,state.currentRound)} p denna omgång</small></div><button class="ghost mini" data-remove="${pl.id}">Ta bort</button>` : `<span class="muted">Tom plats</span>`;
      area.appendChild(d);
    }
  }
  area.querySelectorAll("[data-remove]").forEach(b=>b.onclick=()=>togglePlayer(b.dataset.remove));
}
function renderMarket(){
  document.querySelectorAll(".market-tab").forEach(b=>b.classList.toggle("active",b.dataset.pos===activeMarketPos));
  const ids=teamFor(currentManager());
  const area=el("marketList"); area.innerHTML="";
  state.players.filter(p=>p.pos===activeMarketPos).sort((a,b)=>b.price-a.price).forEach(p=>{
    const chosen=ids.includes(p.id);
    const d=document.createElement("div"); d.className="player-card";
    d.innerHTML=`<div class="avatar">${p.name.slice(0,2).toUpperCase()}</div><div class="grow"><b>${p.name}</b><small>${POS_LABELS[p.pos]} • ${playerRoundScore(p.id,state.currentRound)} p</small></div><div class="price">${money(p.price)}</div><button class="${chosen?"selected":"primary"} mini">${chosen?"Vald":"+"}</button>`;
    d.querySelector("button").onclick=()=>togglePlayer(p.id);
    area.appendChild(d);
  });
}
function togglePlayer(pid){
  const round=state.rounds[state.currentRound-1];
  if(round.locked) return showToast("Omgången är låst");
  const m=currentManager();
  let ids=[...teamFor(m)];
  if(ids.includes(pid)) ids=ids.filter(x=>x!==pid);
  else{
    const p=playerById(pid);
    if(ids.length>=6) return showToast("Laget är fullt");
    if(countPos(ids,p.pos)>=POS_LIMITS[p.pos]) return showToast(`Du har redan max antal ${POS_LABELS[p.pos].toLowerCase()}`);
    if(teamCost(ids)+p.price>BUDGET) return showToast("Budgeten räcker inte");
    ids.push(pid);
  }
  m.teams[String(state.currentRound)]=ids;
  save();
}
function saveTeam(){
  const ids=teamFor(currentManager());
  if(!validTeam(ids)) return showToast("Välj 1 MV, 2 backar och 3 forwards inom 45 m");
  showToast("Laget är sparat");
}
window.saveTeam=saveTeam;

function refreshStandings(){
  const arr=standings(), fines=finesTable();
  const tb=el("standingsBody"); tb.innerHTML="";
  arr.forEach((x,i)=>{
    const tr=document.createElement("tr");
    tr.innerHTML=`<td>${i+1}</td><td><b>${x.m.name}</b></td>${state.rounds.map(r=>`<td>${managerRoundScore(x.m,r.id)}</td>`).join("")}<td><b>${x.total}</b></td><td>${fines[x.m.id]} kr</td>`;
    tb.appendChild(tr);
  });
  el("standingsHead").innerHTML=`<tr><th>#</th><th>Manager</th>${state.rounds.map(r=>`<th>O${r.id}</th>`).join("")}<th>Total</th><th>Netto böter</th></tr>`;
}
function refreshRound(){
  const r=state.rounds[state.currentRound-1];
  el("roundTitle").textContent=`${r.name} • ${r.matches} matcher`;
  const area=el("roundPlayerScores"); area.innerHTML="";
  [...state.players].sort((a,b)=>playerRoundScore(b.id,r.id)-playerRoundScore(a.id,r.id)).forEach(p=>{
    const d=document.createElement("div"); d.className="rank-row";
    d.innerHTML=`<span>${p.name}<small>${POS_LABELS[p.pos]}</small></span><b>${playerRoundScore(p.id,r.id)} p</b>`;
    area.appendChild(d);
  });
}

let adminUnlocked=false;
function refreshAdmin(){
  el("adminGate").style.display=adminUnlocked?"none":"block";
  el("adminPanel").style.display=adminUnlocked?"block":"none";
  if(!adminUnlocked) return;
  const r=state.rounds[state.currentRound-1];
  el("adminRoundTitle").textContent=`${r.name} – statistik`;
  el("matchTabs").innerHTML="";
  for(let i=1;i<=r.matches;i++){
    const b=document.createElement("button"); b.className="chip "+(i===window.adminMatch?"active":""); b.textContent="Match "+i;
    b.onclick=()=>{window.adminMatch=i;refreshAdmin();}; el("matchTabs").appendChild(b);
  }
  if(!window.adminMatch || window.adminMatch>r.matches) window.adminMatch=1;
  renderAdminStats();
  el("lockRoundBtn").textContent=r.locked?"Lås upp omgång":"Lås omgång";
  el("managersAdmin").innerHTML=state.managers.map(m=>`<div class="manager-row"><span><b>${m.name}</b><small>PIN ${m.pin}</small></span><button class="ghost mini" data-del="${m.id}">Ta bort</button></div>`).join("");
  el("managersAdmin").querySelectorAll("[data-del]").forEach(b=>b.onclick=()=>deleteManager(b.dataset.del));
}
function renderAdminStats(){
  const round=state.currentRound, match=window.adminMatch||1;
  const area=el("adminStats"); area.innerHTML="";
  state.players.forEach(p=>{
    const s=getStat(round,match,p.id);
    const row=document.createElement("div"); row.className="stat-card";
    row.innerHTML=`<div class="stat-head"><div><b>${p.name}</b><small>${POS_LABELS[p.pos]} • <span class="score">${calcScore(p,s)} p</span></small></div><label class="check"><input type="checkbox" data-k="played" ${s.played?"checked":""}> Spelade</label></div>
      <div class="stat-grid">
        <label>Mål<input type="number" min="0" data-k="goals" value="${s.goals||0}"></label>
        <label>Assist<input type="number" min="0" data-k="assists" value="${s.assists||0}"></label>
        ${p.pos==="GK"?`<label>Insläppta<input type="number" min="0" data-k="conceded" value="${s.conceded}"></label><label>Räddad straff<input type="number" min="0" data-k="savedPenalty" value="${s.savedPenalty||0}"></label>`:`<label>+/-<input type="number" data-k="plusMinus" value="${s.plusMinus||0}"></label><label>Missad straff<input type="number" min="0" data-k="missedPenalty" value="${s.missedPenalty||0}"></label>`}
        <label>2 min<input type="number" min="0" data-k="pen2" value="${s.pen2||0}"></label>
        <label>2+10<input type="number" min="0" data-k="pen10" value="${s.pen10||0}"></label>
        <label>Matchstraff<input type="number" min="0" data-k="matchPenalty" value="${s.matchPenalty||0}"></label>
      </div>`;
    row.querySelectorAll("input").forEach(inp=>{
      inp.onchange=()=>{
        const copy={...getStat(round,match,p.id)};
        copy[inp.dataset.k]=inp.type==="checkbox"?(inp.checked?1:0):(inp.value===""?"":Number(inp.value));
        setStat(round,match,p.id,copy);
        save();
      };
    });
    area.appendChild(row);
  });
}
function unlockAdmin(){
  if(el("adminPin").value===state.adminPin){ adminUnlocked=true; refreshAdmin(); showToast("Admin upplåst"); }
  else showToast("Fel admin-PIN");
}
window.unlockAdmin=unlockAdmin;
function toggleRoundLock(){
  state.rounds[state.currentRound-1].locked=!state.rounds[state.currentRound-1].locked;
  save();
}
window.toggleRoundLock=toggleRoundLock;

function addManager(){
  const name=el("newManagerName").value.trim(), pin=el("newManagerPin").value.trim() || String(Math.floor(1000+Math.random()*9000));
  if(!name) return showToast("Skriv ett namn");
  const id="m_"+Date.now();
  state.managers.push({id,name,pin,teams:{},createdAt:Date.now()});
  el("newManagerName").value=""; el("newManagerPin").value="";
  save(); showToast("Manager tillagd");
}
window.addManager=addManager;
function deleteManager(id){
  if(state.managers.length<=1) return showToast("Minst en manager behövs");
  if(!confirm("Ta bort manager?")) return;
  state.managers=state.managers.filter(m=>m.id!==id);
  if(state.currentManagerId===id) state.currentManagerId=state.managers[0].id;
  save();
}

function copyPreviousTeam(){
  if(state.currentRound<=1) return showToast("Ingen tidigare omgång");
  const m=currentManager();
  m.teams[String(state.currentRound)]=[...teamFor(m,state.currentRound-1)];
  save(); showToast("Föregående lag kopierat");
}
window.copyPreviousTeam=copyPreviousTeam;

function exportData(){
  const blob=new Blob([JSON.stringify(state,null,2)],{type:"application/json"});
  const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download="fantasy-holle-data.json"; a.click(); URL.revokeObjectURL(a.href);
}
window.exportData=exportData;
function importData(ev){
  const file=ev.target.files[0]; if(!file) return;
  const reader=new FileReader();
  reader.onload=()=>{ try{ state=JSON.parse(reader.result); save(); showToast("Data importerad"); }catch(e){showToast("Ogiltig fil");} };
  reader.readAsText(file);
}
window.importData=importData;
function resetAll(){
  if(!confirm("Nollställ hela ligan? Detta går inte att ångra.")) return;
  state=blankState(); adminUnlocked=false; save(); nav("team");
}
window.resetAll=resetAll;

function refreshEconomy(){
  const fines=finesTable(), arr=standings();
  let gross=0;
  state.rounds.forEach(r=>gross += Math.min(3,state.managers.length)*Number(state.settings.bottom3Fine||0));
  if(state.managers.length) gross += Number(state.settings.overallLastFine||0);
  const prizeTotal=state.settings.prizes.reduce((a,b)=>a+Number(b||0),0);
  el("economySummary").innerHTML=`
    <div class="kpi"><span>Omgångsböter</span><b>${Math.min(3,state.managers.length)*state.rounds.length*state.settings.bottom3Fine} kr</b></div>
    <div class="kpi"><span>Jumboböter</span><b>${state.settings.overallLastFine} kr</b></div>
    <div class="kpi"><span>Prisavdrag</span><b>${prizeTotal} kr</b></div>`;
  el("economyRows").innerHTML=arr.map((x,i)=>`<div class="money-row"><span><b>${x.m.name}</b><small>${i+1}. totalt • ${x.total} p</small></span><b>${fines[x.m.id]} kr</b></div>`).join("");
}

function refreshAll(){
  refreshHeader(); refreshTeam(); refreshStandings(); refreshRound(); refreshAdmin(); refreshEconomy();
}

document.addEventListener("DOMContentLoaded",()=>{
  document.querySelectorAll(".navbtn").forEach(b=>b.onclick=()=>nav(b.dataset.view));
  document.querySelectorAll(".market-tab").forEach(b=>b.onclick=()=>{activeMarketPos=b.dataset.pos;renderMarket();});
  el("roundSelect").onchange=e=>{state.currentRound=Number(e.target.value);save();};
  el("managerSelect").onchange=e=>{state.currentManagerId=e.target.value;save();};
  refreshAll();
  nav("team");
  if("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(()=>{});
});
async function loadCloudState(){
  const { data, error } = await db
    .from("fantasy_state")
    .select("data")
    .eq("id", "main")
    .single();

  if(error){
    console.error(error);
    return;
  }

  if(data && data.data && Object.keys(data.data).length > 0){
    state = data.data;
    localStorage.setItem(KEY, JSON.stringify(state));
    refreshAll();
  } else {
    await save();
  }
}

window.addEventListener("load", loadCloudState);
