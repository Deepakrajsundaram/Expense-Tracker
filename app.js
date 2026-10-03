/* D's Expense Tracker v1.0.7
   Local-first. No bank connection. No server-side transaction storage.
*/
const APP_VERSION = "1.0.7";
const DB_NAME = "ds-expense-tracker";
const DB_VERSION = 1;
const STORE_TX = "transactions";
const STORE_RULES = "rules";
const STORE_META = "meta";

const BASE_CATEGORIES = [
  "Food & Dining","Groceries","Shopping","Transport","Health",
  "Bills & Utilities","Entertainment","Subscriptions","Travel",
  "Investments","Loan / EMI","Cash Withdrawal","Transfer",
  "Income","Refund","Other"
];

const CATEGORY_ICONS = {
  "Food & Dining":"🍽️","Groceries":"🛒","Shopping":"🛍️","Transport":"🚕",
  "Health":"💊","Bills & Utilities":"🧾","Entertainment":"🎬","Subscriptions":"🔁",
  "Travel":"✈️","Investments":"📈","Loan / EMI":"🏦","Cash Withdrawal":"💵",
  "Transfer":"↔️","Income":"↗️","Refund":"↩️","Other":"•"
};

const DEFAULT_RULES = [
  ["GRAND FRES","Groceries"],["DAILY FRES","Groceries"],["BIGBASKET","Groceries"],
  ["ZEPTO","Groceries"],["DMART","Groceries"],["SWIGGY","Food & Dining"],
  ["ZOMATO","Food & Dining"],["UBER","Transport"],["OLA","Transport"],
  ["POTHYS","Shopping"],["AMAZON","Shopping"],["FLIPKART","Shopping"],
  ["APOLLO","Health"],["PHARMACY","Health"],["AIRTEL","Bills & Utilities"],
  ["JIO","Bills & Utilities"],["NETFLIX","Subscriptions"],["SPOTIFY","Subscriptions"],
  ["ANGEL ONE","Investments"],["ZERODHA","Investments"],["GROWW","Investments"],
  ["MUTUAL FUND","Investments"],["STOCKS","Investments"],["LOAN","Loan / EMI"],
  ["EMI","Loan / EMI"]
];

let CATEGORIES = [...BASE_CATEGORIES];
let state = { view:"home", transactions:[], rules:[], month:null, importBatch:null, search:"", filter:"all", sort:"newest" };
let dbPromise;

const $ = id => document.getElementById(id);
const allCategories = () => CATEGORIES;
const categoryOptions = (includeNew=true) => allCategories().map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join("") + (includeNew?`<option value="__new__">＋ Add new category</option>`:"");
const money = n => new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",maximumFractionDigits:0}).format(Number(n)||0);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const fmtDate = iso => { if(!iso) return ""; const d=new Date(iso+"T00:00:00"); return d.toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"}); };
const monthKey = iso => (iso||"").slice(0,7);
const currentMonth = () => new Date().toISOString().slice(0,7);
const monthLabel = key => { const d=new Date(key+"-01T00:00:00"); return d.toLocaleDateString("en-IN",{month:"long",year:"numeric"}); };
const SALARY_PREFIX = "NEFT";
const SALARY_MATCH = "ACCENTURE SOLUTIONS PVT LTD";
function isSalaryTransaction(t){
  if(!t || t.kind!=="income") return false;
  const d=String(t.description||"").trim().toUpperCase();
  return d.startsWith(SALARY_PREFIX) && d.includes(SALARY_MATCH);
}
function salaryDates(){
  return [...new Set(state.transactions.filter(isSalaryTransaction).map(t=>t.date).filter(Boolean))].sort();
}
function nextMonthKeyFromDate(iso){
  const d=new Date(iso+"T00:00:00"); d.setDate(1); d.setMonth(d.getMonth()+1);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
}
function addDaysIso(iso,days){
  const d=new Date(iso+"T00:00:00"); d.setDate(d.getDate()+days);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function recomputeCycleMonths(){
  const salaries=salaryDates();
  for(const t of state.transactions){
    let assigned=monthKey(t.date);
    for(const sd of salaries){
      if(sd<=t.date) assigned=nextMonthKeyFromDate(sd); else break;
    }
    t.month=assigned;
  }
  return salaries;
}
function cycleRange(month){
  const salaries=salaryDates();
  const start=salaries.find(sd=>nextMonthKeyFromDate(sd)===month);
  if(!start) return null;
  const idx=salaries.indexOf(start);
  const next=salaries[idx+1];
  return {start,end:next?addDaysIso(next,-1):null};
}
function cycleRangeLabel(month){
  const r=cycleRange(month);
  if(!r) return "Calendar month";
  return `${fmtDate(r.start)} – ${r.end?fmtDate(r.end):"current"}`;
}
function cycleSettingsModal(){
  const count=salaryDates().length;
  openModal(`<h2>Monthly cycle</h2><p>Your monthly cycle is based on the actual salary credit date. The app detects salary transactions that start with <b>${esc(SALARY_PREFIX)}</b> and contain <b>${esc(SALARY_MATCH)}</b>.</p>
    <div class="card"><div class="card-title">Current method</div><div class="stat"><div class="stat-label">Salary-based cycle</div><div class="stat-value">${count?"Active":"Waiting for salary"}</div></div><p class="muted">When a salary is detected, that date starts the following month's cycle. Transaction dates themselves are never changed.</p></div>
    <div class="card"><div class="card-title">Example</div><p class="muted">If salary is credited on Sep 30, the October cycle starts Sep 30. If the next salary arrives on Oct 30, the October cycle ends Oct 29.</p></div>
    <button class="primary full" onclick="closeModal()">Done</button>`);
}

function openDB(){
  if(dbPromise) return dbPromise;
  dbPromise = new Promise((resolve,reject)=>{
    const req=indexedDB.open(DB_NAME,DB_VERSION);
    req.onupgradeneeded=e=>{
      const db=e.target.result;
      if(!db.objectStoreNames.contains(STORE_TX)) {
        const s=db.createObjectStore(STORE_TX,{keyPath:"id"});
        s.createIndex("date","date"); s.createIndex("month","month"); s.createIndex("category","category");
      }
      if(!db.objectStoreNames.contains(STORE_RULES)) db.createObjectStore(STORE_RULES,{keyPath:"pattern"});
      if(!db.objectStoreNames.contains(STORE_META)) db.createObjectStore(STORE_META,{keyPath:"key"});
    };
    req.onsuccess=e=>resolve(e.target.result);
    req.onerror=()=>reject(req.error);
  });
  return dbPromise;
}
async function txStore(store, mode="readonly"){
  const db=await openDB(); return db.transaction(store,mode).objectStore(store);
}
async function dbGetAll(store){
  const s=await txStore(store); return new Promise((res,rej)=>{const r=s.getAll();r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});
}
async function dbPut(store,obj){
  const s=await txStore(store,"readwrite"); return new Promise((res,rej)=>{const r=s.put(obj);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});
}
async function dbDelete(store,key){
  const s=await txStore(store,"readwrite"); return new Promise((res,rej)=>{const r=s.delete(key);r.onsuccess=()=>res();r.onerror=()=>rej(r.error)});
}
async function dbClear(store){
  const s=await txStore(store,"readwrite"); return new Promise((res,rej)=>{const r=s.clear();r.onsuccess=()=>res();r.onerror=()=>rej(r.error)});
}

async function init(){
  state.transactions=await dbGetAll(STORE_TX);
  state.rules=await dbGetAll(STORE_RULES);
  const custom=await dbGetAll(STORE_META);
  const customCategories=custom.find(x=>x.key==="customCategories")?.value;
  if(Array.isArray(customCategories)){
    CATEGORIES=[...new Set([...BASE_CATEGORIES,...customCategories.map(x=>String(x).trim()).filter(Boolean)])];
  }
  if(!state.rules.length){
    for(const [pattern,category] of DEFAULT_RULES) await dbPut(STORE_RULES,{pattern,category});
    state.rules=await dbGetAll(STORE_RULES);
  }
  const salaries = recomputeCycleMonths();
  for(const t of state.transactions) await dbPut(STORE_TX,t);
  const months = [...new Set(state.transactions.map(t=>t.month).filter(Boolean))].sort().reverse();
  state.month = months[0] || currentMonth();
  bindNav();
  render();
}

function bindNav(){
  document.querySelectorAll(".nav-btn[data-view]").forEach(b=>b.onclick=()=>{state.view=b.dataset.view;render()});
  $("importBtn").onclick=()=>openFilePicker();
  $("fileInput").onchange=e=>{if(e.target.files[0]) handleFile(e.target.files[0]); e.target.value=""};
  $("settingsBtn").onclick=showSettings;
  $("closeModal").onclick=closeModal;
  document.querySelector(".modal-backdrop").onclick=closeModal;
}

function render(){
  document.querySelectorAll(".nav-btn").forEach(b=>b.classList.toggle("active",b.dataset.view===state.view));
  const views={home:renderHome,transactions:renderTransactions,analytics:renderAnalytics,rules:renderRules};
  $("view").innerHTML=views[state.view]();
  wireView();
  if(state.view==="transactions") renderTransactionsContent();
}
function wireView(){
  const monthSel=$("monthSelect"); if(monthSel) monthSel.onchange=e=>{state.month=e.target.value;render()};
  const cycleBtn=$("cycleSettingsBtn"); if(cycleBtn) cycleBtn.onclick=cycleSettingsModal;
  const search=$("search"); if(search) search.oninput=e=>{state.search=e.target.value;renderTransactionsContent()};
  const filter=$("filter"); if(filter) filter.onchange=e=>{state.filter=e.target.value;renderTransactionsContent()};
  const sortSelect=$("sortSelect"); if(sortSelect) sortSelect.onchange=e=>{state.sort=e.target.value;renderTransactionsContent()};
  const upload=$("uploadAction"); if(upload) upload.onclick=openFilePicker;
  const review=$("reviewAction"); if(review) review.onclick=showReviewFromState;
  const exportBtn=$("exportBtn"); if(exportBtn) exportBtn.onclick=exportBackup;
  const importBackupBtn=$("importBackupBtn"); if(importBackupBtn) importBackupBtn.onclick=importBackup;
  document.querySelectorAll("[data-category]").forEach(b=>b.onclick=()=>showCategoryTransactions(decodeURIComponent(b.dataset.category)));
  // Settings import-delete buttons are wired when the modal is opened.
  const ruleInput=$("rulePattern"); if(ruleInput) $("addRuleBtn").onclick=addRule;
  const addCategoryBtn=$("addCategoryBtn"); if(addCategoryBtn) addCategoryBtn.onclick=addCustomCategory;
  const ruleCategory=$("ruleCategory"); if(ruleCategory) ruleCategory.onchange=async e=>{if(e.target.value==="__new__"){e.target.value=CATEGORIES[0];await addCustomCategory();}};
}

function monthOptions(){
  const months=[...new Set(state.transactions.map(t=>t.month))].filter(Boolean).sort().reverse();
  if(!months.includes(state.month)) months.unshift(state.month);
  return months.map(m=>`<option value="${m}" ${m===state.month?"selected":""}>${monthLabel(m)}</option>`).join("");
}

function spendingFor(month){
  return state.transactions.filter(t=>t.month===month && t.kind==="expense");
}
function summary(month){
  const ts=state.transactions.filter(t=>t.month===month);
  const spending=ts.filter(t=>t.kind==="expense").reduce((a,t)=>a+t.amount,0);
  const income=ts.filter(t=>t.kind==="income").reduce((a,t)=>a+t.amount,0);
  const investment=ts.filter(t=>t.category==="Investments").reduce((a,t)=>a+t.amount,0);
  const transfers=ts.filter(t=>t.category==="Transfer").reduce((a,t)=>a+t.amount,0);
  return {spending,income,investment,transfers,transactions:ts.length};
}
function categoryTotals(month){
  const out={}; for(const t of spendingFor(month)) out[t.category]=(out[t.category]||0)+t.amount;
  return Object.entries(out).sort((a,b)=>b[1]-a[1]);
}
function renderHome(){
  const s=summary(state.month), cats=categoryTotals(state.month), total=s.spending||1;
  const recent=state.transactions.filter(t=>t.month===state.month).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,5);
  const reviewCount=state.transactions.filter(t=>t.needsReview).length;
  const range=cycleRangeLabel(state.month);
  return `<section class="hero">
    <div class="row"><div><div class="eyebrow">Monthly spending</div><div class="hero-amount">${money(s.spending)}</div><div class="muted" style="font-size:11px">${s.transactions} transactions</div></div>
    <select id="monthSelect" class="select" style="width:auto;min-width:140px">${monthOptions()}</select></div>
    <div class="cycle-control"><span><b>${esc(monthLabel(state.month))}</b> · ${esc(range)}</span><button id="cycleSettingsBtn" class="cycle-change">Change</button></div>
  </section>
  <div class="card"><div class="card-title">Money movement</div>
    <div class="stat-grid">
      <div class="stat"><div class="stat-label">Income</div><div class="stat-value">${money(s.income)}</div></div>
      <div class="stat"><div class="stat-label">Investments</div><div class="stat-value">${money(s.investment)}</div></div>
      <div class="stat"><div class="stat-label">Transfers</div><div class="stat-value">${money(s.transfers)}</div></div>
      <div class="stat"><div class="stat-label">Actual spending</div><div class="stat-value">${money(s.spending)}</div></div>
    </div>
  </div>
  <div class="card"><div class="card-title">Where your money went</div>
    ${cats.length?cats.slice(0,8).map(([c,v])=>`<button class="category-row category-button" data-category="${encodeURIComponent(c)}"><div><span class="cat-dot"></span><span class="cat-name">${esc(c)}</span><div class="progress"><i style="width:${Math.min(100,v/total*100)}%"></i></div></div><div class="cat-amount">${money(v)} <span class="row-chevron">›</span></div></button>`).join(""):`<div class="empty"><strong>No expenses yet</strong>Upload your first statement.</div>`}
  </div>
  <div class="card review-card"><button class="action review-action" id="reviewAction"><strong>⚠ ${reviewCount} transaction${reviewCount===1?"":"s"} to review</strong><span>Review whenever you want</span><b>›</b></button></div>
  <div class="card"><div class="card-title">Recent transactions</div>${recent.length?recent.map(transactionHtml).join(""):`<div class="empty">No transactions for this month.</div>`}</div>`;
}
function transactionHtml(t){
  const icon=CATEGORY_ICONS[t.category]||"•";
  const cls=t.kind==="income"?"credit":"debit";
  return `<button class="txn" data-tx-id="${esc(t.id)}"><div class="txn-main"><div class="merchant-icon">${icon}</div><div class="txn-copy"><div class="txn-name">${esc(t.merchant||t.description)}</div><div class="txn-meta">${fmtDate(t.date)} • ${esc(t.category)}${t.needsReview?" • Needs review":""}</div></div><div class="txn-right"><div class="txn-amount ${cls}">${t.kind==="income"?"+":"−"}${money(t.amount)}</div><div class="txn-chevron">›</div></div></div></button>`;
}

function renderTransactions(){
  const count=state.transactions.filter(t=>t.month===state.month).length;
  return `<div class="page-head"><div><div class="section-kicker">Activity</div><div class="section-title">Transactions</div><div class="page-subtitle">${count} transaction${count===1?"":"s"} in ${esc(monthLabel(state.month))}</div></div>
    <select id="monthSelect" class="select month-select">${monthOptions()}</select></div>
    <div class="toolbar"><input id="search" class="input" placeholder="Search merchant or description" value="${esc(state.search)}"><select id="filter" class="select"><option value="all" ${state.filter==="all"?"selected":""}>All</option><option value="expense" ${state.filter==="expense"?"selected":""}>Expenses</option><option value="income" ${state.filter==="income"?"selected":""}>Income</option></select><select id="sortSelect" class="select"><option value="newest" ${state.sort==="newest"?"selected":""}>Newest</option><option value="oldest" ${state.sort==="oldest"?"selected":""}>Oldest</option><option value="high" ${state.sort==="high"?"selected":""}>Highest amount</option><option value="low" ${state.sort==="low"?"selected":""}>Lowest amount</option><option value="az" ${state.sort==="az"?"selected":""}>A → Z</option><option value="za" ${state.sort==="za"?"selected":""}>Z → A</option></select></div>
    <div id="transactionsContent"></div>`;
}
function renderTransactionsContent(){
  const el=$("transactionsContent"); if(!el)return;
  let ts=state.transactions.filter(t=>t.month===state.month);
  if(state.search) {const q=state.search.toLowerCase();ts=ts.filter(t=>(t.merchant+" "+t.description+" "+t.category).toLowerCase().includes(q))}
  if(state.filter!=="all") ts=ts.filter(t=>t.kind===state.filter);
  const merchantName=t=>String(t.merchant||t.description||"").toLowerCase();
  if(state.sort==="oldest") ts.sort((a,b)=>a.date.localeCompare(b.date)||a.amount-b.amount);
  else if(state.sort==="high") ts.sort((a,b)=>b.amount-a.amount||b.date.localeCompare(a.date));
  else if(state.sort==="low") ts.sort((a,b)=>a.amount-b.amount||b.date.localeCompare(a.date));
  else if(state.sort==="az") ts.sort((a,b)=>merchantName(a).localeCompare(merchantName(b))||b.date.localeCompare(a.date));
  else if(state.sort==="za") ts.sort((a,b)=>merchantName(b).localeCompare(merchantName(a))||b.date.localeCompare(a.date));
  else ts.sort((a,b)=>b.date.localeCompare(a.date)||b.amount-a.amount);
  el.innerHTML=ts.length?`<div class="card transaction-card">${ts.map(transactionHtml).join("")}</div>`:`<div class="card empty-state"><div class="empty-icon">⌕</div><strong>No matching transactions</strong><span>Try another search, filter, or month.</span></div>`;
  document.querySelectorAll("[data-tx-id]").forEach(b=>b.onclick=()=>showTransactionDetails(b.dataset.txId));
}
function showTransactionDetails(id){
  const t=state.transactions.find(x=>x.id===id);
  if(!t)return;
  const cls=t.kind==="income"?"credit":"debit";
  openModal(`<div class="detail-header"><div class="detail-icon">${CATEGORY_ICONS[t.category]||"•"}</div><div><div class="detail-kicker">${t.kind==="income"?"Income":"Expense"}</div><h2>${esc(t.merchant||t.description)}</h2></div></div>
    <div class="detail-amount ${cls}">${t.kind==="income"?"+":"−"}${money(t.amount)}</div>
    <div class="detail-list">
      <div><span>Date</span><b>${fmtDate(t.date)}</b></div>
      <div><span>Category</span><b>${esc(t.category)}</b></div>
      <div><span>Description</span><b>${esc(t.description)}</b></div>
      ${t.needsReview?`<div><span>Status</span><b class="review-badge">Needs review</b></div>`:""}
    </div>
    <button class="secondary full" onclick="closeModal()">Done</button>`);
}

function renderAnalytics(){
  const cats=categoryTotals(state.month), max=cats[0]?.[1]||1, s=summary(state.month);
  return `<div class="page-head"><div><div class="section-kicker">Insights</div><div class="section-title">Analytics</div><div class="page-subtitle">Tap any category to see its transactions</div></div>
    <select id="monthSelect" class="select month-select">${monthOptions()}</select></div>
    <div class="stat-grid">
      <div class="stat"><div class="stat-label">Spending</div><div class="stat-value">${money(s.spending)}</div></div>
      <div class="stat"><div class="stat-label">Transactions</div><div class="stat-value">${s.transactions}</div></div>
      <div class="stat"><div class="stat-label">Income</div><div class="stat-value">${money(s.income)}</div></div>
      <div class="stat"><div class="stat-label">Investments</div><div class="stat-value">${money(s.investment)}</div></div>
    </div>
    <div class="card"><div class="card-title">${monthLabel(state.month)} by category</div>
      ${cats.length?cats.map(([c,v])=>`<button class="category-row category-button" data-category="${encodeURIComponent(c)}"><div><span class="cat-dot"></span>${esc(c)}<div class="progress"><i style="width:${v/max*100}%"></i></div></div><div class="cat-amount">${money(v)} ›</div></button>`).join(""):`<div class="empty">No spending data.</div>`}
    </div>`;
}

function showCategoryTransactions(category){
  const items=state.transactions.filter(t=>t.month===state.month && t.kind==="expense" && t.category===category).sort((a,b)=>b.date.localeCompare(a.date)||b.amount-a.amount);
  const hasReview=items.some(t=>t.needsReview);
  const categoryChoices=CATEGORIES.filter(c=>!['Income','Refund'].includes(c));
  const itemHtml=t=>{
    if(!t.needsReview) return transactionHtml(t);
    return `<div class="review-inline" data-inline-review="${esc(t.id)}">
      <div class="row"><div class="txn-copy"><div class="txn-name">${esc(t.merchant||t.description)}</div><div class="txn-meta">${fmtDate(t.date)} • Needs review</div></div><div class="review-inline-amount">${money(t.amount)}</div></div>
      <div class="chips inline-chips">${categoryChoices.map(c=>`<button class="chip" data-inline-category="${esc(t.id)}" data-category-value="${encodeURIComponent(c)}">${CATEGORY_ICONS[c]||""} ${esc(c)}</button>`).join("")}</div>
    </div>`;
  };
  openModal(`<div class="review-top"><div><span class="review-badge">${esc(category)}</span>${hasReview?`<span class="review-badge inline-review-badge">Needs review</span>`:""}</div><span class="review-count">${items.length} transaction${items.length===1?"":"s"}</span></div><h2>${esc(category)}</h2><p>${hasReview?"Select a category directly below any transaction marked Needs review.":`Transactions in ${esc(monthLabel(state.month))}.`}</p><div class="category-transactions">${items.length?items.map(itemHtml).join(""):`<div class="empty">No transactions in this category.</div>`}</div>`);
  document.querySelectorAll("#modalContent [data-tx-id]").forEach(b=>b.onclick=()=>showTransactionDetails(b.dataset.txId));
  document.querySelectorAll("#modalContent [data-inline-category]").forEach(b=>b.onclick=()=>categorizeInlineTransaction(b.dataset.inlineCategory,decodeURIComponent(b.dataset.categoryValue)));
}

window.categorizeInlineTransaction=async function(id,category){
  const t=state.transactions.find(x=>x.id===id);
  if(!t)return;
  const updated={...t,category,needsReview:false};
  await dbPut(STORE_TX,updated);
  state.transactions=state.transactions.map(x=>x.id===id?updated:x);
  const pattern=String(updated.merchant||"").trim().toUpperCase();
  if(pattern.length>=3 && !state.rules.some(r=>r.pattern.toUpperCase()===pattern)){
    await dbPut(STORE_RULES,{pattern,category});
    state.rules=await dbGetAll(STORE_RULES);
  }
  render();
  showCategoryTransactions(category);
  toast(`${updated.merchant||"Transaction"} categorized as ${category}.`);
};

function renderRules(){
  const rules=[...state.rules].sort((a,b)=>a.pattern.localeCompare(b.pattern));
  const merchants=[...new Set(state.transactions.map(t=>String(t.merchant||"").trim()).filter(x=>x.length>=2))].sort((a,b)=>a.localeCompare(b));
  const merchantOptions=merchants.map(m=>`<option value="${esc(m)}">`).join("");
  return `<div class="page-head"><div><div class="section-kicker">Automation</div><div class="section-title">Auto-Categorization</div><div class="page-subtitle">Rules automatically categorize matching transactions when you import statements.</div></div></div>
    <div class="card">
      <div class="card-title">Merchant rule</div>
      <div class="muted rule-help">Start typing a merchant and choose a match from your existing transactions.</div>
      <div class="rule-form">
        <div class="field"><label for="rulePattern">Merchant / keyword</label><input id="rulePattern" class="input" list="merchantSuggestions" autocomplete="off" placeholder="e.g. SWIGGY"><datalist id="merchantSuggestions">${merchantOptions}</datalist></div>
        <div class="field"><label for="ruleCategory">Category</label><select id="ruleCategory" class="select">${categoryOptions()}</select></div>
        <button id="addRuleBtn" class="primary full">＋ Add rule</button>
      </div>
    </div>
    <div class="card">
      <div class="card-title">Your rules <span class="count-badge">${rules.length}</span></div>
      ${rules.length?rules.map(r=>`<div class="rule"><div><div class="rule-name">${esc(r.pattern)}</div><div class="rule-cat">${CATEGORY_ICONS[r.category]||"•"} ${esc(r.category)}</div></div><button class="danger small" onclick="removeRule('${encodeURIComponent(r.pattern)}')">Delete</button></div>`).join(""):`<div class="empty">No custom rules yet.</div>`}
    </div>
    <div class="card"><div class="card-title">Categories</div><div class="muted rule-help">Built-in categories are always available. You can add your own category for rules, review, and future transactions.</div><button class="secondary full" id="addCategoryBtn">＋ Add new category</button></div>
    <div class="card"><div class="card-title">Privacy & backup</div><p class="muted" style="font-size:11px;line-height:1.5">Your transactions are stored in this browser's IndexedDB. Use Export Backup regularly so an accidental browser reset does not remove your local copy.</p>
      <div class="button-row"><button class="secondary" id="exportBtn">Export backup</button><button class="secondary" id="importBackupBtn">Restore backup</button></div>
    </div>`;
}

async function addCustomCategory(){
  openModal(`<h2>Add category</h2><p>Create a category once and it will be available in rules and review.</p><div class="field"><label for="newCategoryName">Category name</label><input id="newCategoryName" class="input" maxlength="40" placeholder="e.g. Fitness"></div><div class="button-row"><button class="secondary" onclick="closeModal()">Cancel</button><button class="primary" onclick="saveCustomCategory()">Add category</button></div>`);
  setTimeout(()=>$("newCategoryName")?.focus(),50);
}
async function saveCustomCategory(){
  const name=$("newCategoryName")?.value.trim();
  if(!name){toast("Enter a category name.");return}
  const existing=CATEGORIES.find(c=>c.toLowerCase()===name.toLowerCase());
  if(existing){toast("That category already exists.");return}
  CATEGORIES=[...CATEGORIES,name];
  await dbPut(STORE_META,{key:"customCategories",value:CATEGORIES.filter(c=>!BASE_CATEGORIES.includes(c))});
  closeModal(); render(); toast(`Category “${name}” added.`);
}

async function removeRule(encoded){ await dbDelete(STORE_RULES,decodeURIComponent(encoded)); state.rules=await dbGetAll(STORE_RULES); render(); }

function openFilePicker(){ $("fileInput").click(); }

async function handleFile(file){
  if(!window.XLSX){toast("Spreadsheet parser is still loading.");return}
  try{
    const data=await file.arrayBuffer();
    const wb=XLSX.read(data,{type:"array",cellDates:true});
    let rows=[];
    for(const name of wb.SheetNames){
      const sheet=wb.Sheets[name];
      const matrix=XLSX.utils.sheet_to_json(sheet,{header:1,defval:"",raw:false});
      // Banks often have metadata rows such as "Transaction Date from" before the real table header.
      // Require the actual transaction-table columns together, not just the words "transaction date".
      const headerIndex=matrix.findIndex(r=>{
        const cells=r.map(c=>String(c).trim().toLowerCase());
        const hasDate=cells.some(c=>c === "transaction date" || c === "value date");
        const hasRemarks=cells.some(c=>c.includes("transaction remarks") || c.includes("narration") || c.includes("description"));
        const hasDebit=cells.some(c=>c.includes("withdrawal amount") || c === "debit" || c === "withdrawal");
        const hasCredit=cells.some(c=>c.includes("deposit amount") || c === "credit" || c === "deposit");
        return hasDate && hasRemarks && hasDebit && hasCredit;
      });
      if(headerIndex>=0){ rows=matrix.slice(headerIndex); break; }
      const generic=XLSX.utils.sheet_to_json(sheet,{defval:""});
      if(generic.length){ rows=generic; break; }
    }
    const parsed=normalizeRows(rows);
    if(!parsed.length) throw new Error("No transactions could be detected. Please use a CSV/XLS/XLSX bank statement containing transaction date, description/remarks, and debit/credit columns.");
    const result=await prepareImport(parsed,file.name);
    showImportPreview(result);
  }catch(err){console.error(err);toast(err.message||"Could not read this statement.");}
}

function normalizeRows(rows){
  if(!rows.length)return [];
  let headers=rows[0].map(x=>String(x).trim());
  const find=(...terms)=>headers.findIndex(h=>terms.some(t=>h.toLowerCase().includes(t)));
  const dateI=find("transaction date","value date","date");
  const descI=find("transaction remarks","description","narration","remarks","particular");
  const debitI=find("withdrawal amount","debit","withdrawal","amount debit");
  const creditI=find("deposit amount","credit","deposit","amount credit");
  if(dateI<0||descI<0)return [];
  const out=[];
  for(let i=1;i<rows.length;i++){
    const r=rows[i]; if(!r || !r.length)continue;
    const date=parseDateValue(r[dateI]); const desc=String(r[descI]??"").trim();
    if(!date||!desc||/transactions list|transaction remarks/i.test(desc))continue;
    const debit=parseAmount(r[debitI]); const credit=parseAmount(r[creditI]);
    if(!debit&&!credit)continue;
    const isCredit=credit>0 && debit===0;
    const amount=isCredit?credit:debit;
    out.push({date,description:desc,amount,kind:isCredit?"income":"expense"});
  }
  return out;
}
function parseAmount(v){
  if(v===null||v===undefined||v==="")return 0;
  if(typeof v==="number")return Math.abs(v);
  const n=Number(String(v).replace(/[,₹\s]/g,"").replace(/[^\d.-]/g,""));
  return Number.isFinite(n)?Math.abs(n):0;
}
function parseDateValue(v){
  if(v instanceof Date && !isNaN(v)) return v.toISOString().slice(0,10);
  const s=String(v??"").trim();
  if(!s)return "";
  let m=s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);
  if(m)return `${m[3]}-${m[2].padStart(2,"0")}-${m[1].padStart(2,"0")}`;
  const d=new Date(s); return isNaN(d)?"":d.toISOString().slice(0,10);
}
function normalizeMerchant(desc){
  const parts=desc.split("/");
  if(parts.length>=2) return (parts[1]||parts[0]).replace(/\s+/g," ").trim();
  return desc.replace(/\s+/g," ").trim();
}
function fingerprint(t){
  const raw=[t.date,t.amount.toFixed(2),t.kind,t.description.toUpperCase().replace(/\s+/g," ").trim()].join("|");
  return sha256ish(raw);
}
function sha256ish(str){
  let h1=0x811c9dc5,h2=0x01000193;
  for(let i=0;i<str.length;i++){const c=str.charCodeAt(i);h1=Math.imul(h1^c,16777619);h2=Math.imul(h2^c,2246822519);}
  return (h1>>>0).toString(16).padStart(8,"0")+(h2>>>0).toString(16).padStart(8,"0")+str.length.toString(16);
}
function categorize(desc,kind){
  if(kind==="income") return {category:"Income",needsReview:false};
  const u=desc.toUpperCase();
  for(const r of state.rules){ if(u.includes(r.pattern.toUpperCase())) return {category:r.category,needsReview:false}; }
  if(/\b(ACH|BIL\/NEFT|NEFT|RTGS)\b/.test(u) && /STOCKS|BROKING|MUTUAL|ZERODHA|ANGEL/i.test(u)) return {category:"Investments",needsReview:false};
  if(/ZERODHA|ANGEL ONE|GROWW|MUTUAL FUND|STOCKS/i.test(u)) return {category:"Investments",needsReview:false};
  if(/EMI|LOAN/i.test(u)) return {category:"Loan / EMI",needsReview:false};
  if(/ATM|CASH WITHDRAW/i.test(u)) return {category:"Cash Withdrawal",needsReview:false};
  if(/^INF\/INFT|SELF/i.test(u)) return {category:"Transfer",needsReview:false};
  if(/^UPI\/[A-Z ]+\/.*(PAYMENT FR|@)/i.test(u)) return {category:"Transfer",needsReview:true};
  return {category:"Other",needsReview:true};
}

async function prepareImport(rows,filename){
  const existing=new Map(state.transactions.map(t=>[t.id,t]));
  const possible=[], fresh=[];
  for(const r of rows){
    const c=categorize(r.description,r.kind);
    const t={...r,month:monthKey(r.date),id:fingerprint(r),merchant:normalizeMerchant(r.description),category:c.category,needsReview:c.needsReview,sourceFile:filename,importedAt:new Date().toISOString()};
    if(existing.has(t.id)) continue;
    // Soft duplicate check: same date + amount + kind + normalized merchant.
    const soft=state.transactions.find(x=>x.date===t.date&&x.amount===t.amount&&x.kind===t.kind&&x.merchant.toUpperCase()===t.merchant.toUpperCase());
    if(soft) possible.push({...t,possibleDuplicateOf:soft.id}); else fresh.push(t);
  }
  const newItems=[...fresh,...possible];
  const reviewCount=newItems.filter(t=>t.needsReview||t.possibleDuplicateOf).length;
  return {filename,total:rows.length,already:rows.length-newItems.length,newCount:fresh.length,possibleCount:possible.length,reviewCount,newItems};
}

function showImportPreview(r){
  state.importBatch=r;
  openModal(`<h2>Import statement</h2><p><b>${esc(r.filename)}</b></p>
    <div class="stat-grid">
      <div class="stat"><div class="stat-label">Rows detected</div><div class="stat-value">${r.total}</div></div>
      <div class="stat"><div class="stat-label">Already imported</div><div class="stat-value">${r.already}</div></div>
      <div class="stat"><div class="stat-label">New</div><div class="stat-value">${r.newCount + r.possibleCount}</div></div>
      <div class="stat"><div class="stat-label">Needs review</div><div class="stat-value">${r.reviewCount}</div></div>
    </div>
    <div class="card"><p>Transactions will be imported now. Items that need attention will be marked <b>Needs review</b> so you can review them later.</p>
    <div class="button-row"><button class="secondary" onclick="closeModal()">Cancel</button><button class="primary" onclick="startImportReview()">Import ${r.newCount + r.possibleCount} transactions</button></div></div>`);
}
async function startImportReview(){
  const items=state.importBatch?.newItems||[];
  if(!items.length){closeModal();toast("Nothing new to import.");return}

  let added=0;
  for(const t of items){
    // Import everything that is not an exact fingerprint match.
    // Uncertain and soft-duplicate candidates remain visible and are reviewed later.
    await dbPut(STORE_TX,{...t,needsReview:!!(t.needsReview || t.possibleDuplicateOf)});
    added++;
  }

  state.transactions=await dbGetAll(STORE_TX);
  state.rules=await dbGetAll(STORE_RULES);
  recomputeCycleMonths();
  for(const t of state.transactions) await dbPut(STORE_TX,t);
  const importedIds=new Set(items.map(t=>t.id));
  const importedMonths=state.transactions.filter(t=>importedIds.has(t.id)).map(t=>t.month).filter(Boolean).sort().reverse();
  state.month=importedMonths[0] || state.month;
  state.importBatch=null;
  closeModal();
  state.view="home";
  render();
  toast(`${added} transaction${added===1?"":"s"} imported.`);
}
function showReviewFromState(){
  const items=state.transactions.filter(t=>t.needsReview);
  if(!items.length){toast("No transactions need review.");return}
  showReview(items,0,[]);
}
function showReview(items,index,decisions){
  if(index>=items.length){return}
  const t=items[index];
  const opts=CATEGORIES.filter(c=>!["Income","Refund"].includes(c));
  openModal(`<div class="review-top"><span class="review-badge">Needs review</span><span class="review-count">${index+1} of ${items.length}</span></div><h2>Review transaction</h2><p>Choose a category. Your choice is saved immediately.</p>
    <div class="review-item"><div class="review-merchant-row"><div><div class="review-merchant">${esc(t.merchant||t.description)}</div><div class="txn-meta">${fmtDate(t.date)} • ${esc(t.description)}</div></div><div class="review-amount">${t.kind==="income"?"+":"−"}${money(t.amount)}</div></div>
      <div class="review-label">Amount</div><div class="review-amount-large">${t.kind==="income"?"+":"−"}${money(t.amount)}</div>
      <div class="chips">${opts.map(c=>`<button class="chip" onclick="chooseReview('${encodeURIComponent(c)}')">${CATEGORY_ICONS[c]||""} ${esc(c)}</button>`).join("")}</div>
      <div class="button-row"><button class="secondary" onclick="chooseReview('Transfer')">Mark as transfer</button><button class="secondary" onclick="chooseReview('Investments')">Investment</button></div>
    </div>`);
  window.__review={items,index,decisions};
}
window.chooseReview=async function(encoded){
  const c=decodeURIComponent(encoded), x=window.__review, t=x.items[x.index];
  const updated={...t,category:c,needsReview:false};
  await dbPut(STORE_TX,updated);
  x.decisions.push(updated);
  state.transactions=state.transactions.map(row=>row.id===updated.id?updated:row);
  if(t.merchant){
    const pattern=t.merchant.trim().toUpperCase();
    if(pattern.length>=3 && !state.rules.some(r=>r.pattern.toUpperCase()===pattern)){
      await dbPut(STORE_RULES,{pattern,category:c});
      state.rules=await dbGetAll(STORE_RULES);
    }
  }
  if(x.index+1>=x.items.length){
    closeModal();
    state.view="home";
    render();
    toast("Review complete. Your transactions are updated.");
    return;
  }
  showReview(x.items,x.index+1,x.decisions);
};


function showSettings(){
  const imports=[...new Set(state.transactions.map(t=>t.sourceFile).filter(Boolean))]
    .map(filename=>({filename,count:state.transactions.filter(t=>t.sourceFile===filename).length}))
    .sort((a,b)=>a.filename.localeCompare(b.filename));
  const importHtml=imports.length ? imports.map(x=>`<div class="import-history-row">
      <div class="import-history-info"><b>${esc(x.filename)}</b><span>${x.count} transaction${x.count===1?"":"s"}</span></div>
      <button class="danger small" data-delete-import="${esc(x.filename)}">Delete</button>
    </div>`).join("") : `<p class="muted">No imported statements are stored yet.</p>`;
  openModal(`<h2>Settings</h2><p><b>D's Expense Tracker v${APP_VERSION}</b></p>
    <div class="card"><div class="card-title">Privacy</div><p>Statements are parsed in this browser. There is no bank connection and this version does not send transaction data to a backend.</p></div>
    <div class="card"><div class="card-title">Imported statements</div>
      <p class="muted">Delete a statement here if you want to import that same file again. This deletes only transactions originally imported from that file.</p>
      <div class="import-history">${importHtml}</div>
    </div>
    <div class="card"><div class="card-title">Data safety</div><p>Use Export Backup before clearing browser data or changing devices. Deleting an imported statement cannot be undone unless you have a backup.</p></div>
    <button class="secondary full" onclick="closeModal()">Done</button>`);
  document.querySelectorAll("[data-delete-import]").forEach(b=>b.onclick=()=>deleteImportedStatement(b.dataset.deleteImport));
}

async function deleteImportedStatement(filename){
  const matching=state.transactions.filter(t=>t.sourceFile===filename);
  if(!matching.length){toast("No transactions found for this statement.");return}
  const ok=confirm(`Delete ${matching.length} transaction${matching.length===1?"":"s"} imported from\n\n${filename}?\n\nThis cannot be undone unless you have a backup.`);
  if(!ok)return;
  for(const t of matching) await dbDelete(STORE_TX,t.id);
  state.transactions=await dbGetAll(STORE_TX);
  recomputeCycleMonths();
  for(const t of state.transactions) await dbPut(STORE_TX,t);
  const months=[...new Set(state.transactions.map(t=>t.month).filter(Boolean))].sort().reverse();
  state.month=months[0]||currentMonth();
  showSettings();
  render();
  toast(`${matching.length} transaction${matching.length===1?"":"s"} deleted.`);
}


function openModal(html){$("modalContent").innerHTML=html;$("modal").classList.remove("hidden");$("modal").setAttribute("aria-hidden","false")}
function closeModal(){ $("modal").classList.add("hidden");$("modal").setAttribute("aria-hidden","true");window.__review=null; }
function toast(msg){const x=document.createElement("div");x.className="toast";x.textContent=msg;document.body.appendChild(x);setTimeout(()=>x.remove(),2600)}

async function addRule(){
  const pattern=$("rulePattern").value.trim(), category=$("ruleCategory").value;
  if(!pattern){toast("Choose or enter a merchant keyword.");return}
  if(!category || category==="__new__"){toast("Choose a category.");return}
  await dbPut(STORE_RULES,{pattern,category}); state.rules=await dbGetAll(STORE_RULES); $("rulePattern").value=""; render(); toast("Rule saved.");
}

async function exportBackup(){
  const payload={app:"D's Expense Tracker",version:APP_VERSION,exportedAt:new Date().toISOString(),transactions:state.transactions,rules:state.rules,customCategories:CATEGORIES.filter(c=>!BASE_CATEGORIES.includes(c))};
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json"});
  const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`ds-expense-tracker-backup-${currentMonth()}.json`;a.click();URL.revokeObjectURL(a.href);
}
function importBackup(){
  const input=document.createElement("input");input.type="file";input.accept=".json";
  input.onchange=async()=>{const f=input.files[0];if(!f)return;try{
    const data=JSON.parse(await f.text());
    if(!Array.isArray(data.transactions)||!Array.isArray(data.rules))throw new Error("Invalid backup.");
    if(Array.isArray(data.customCategories)){
      CATEGORIES=[...new Set([...BASE_CATEGORIES,...data.customCategories.map(x=>String(x).trim()).filter(Boolean)])];
      await dbPut(STORE_META,{key:"customCategories",value:CATEGORIES.filter(c=>!BASE_CATEGORIES.includes(c))});
    }
    let added=0;for(const t of data.transactions){if(!state.transactions.some(x=>x.id===t.id)){await dbPut(STORE_TX,t);added++;}}
    for(const r of data.rules) await dbPut(STORE_RULES,r);
    state.transactions=await dbGetAll(STORE_TX);state.rules=await dbGetAll(STORE_RULES);recomputeCycleMonths();for(const t of state.transactions) await dbPut(STORE_TX,t);render();toast(`${added} transaction${added===1?"":"s"} restored.`);
  }catch(e){toast(e.message||"Could not restore backup.")}};
  input.click();
}

init();
