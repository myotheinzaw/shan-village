/* =====================================================================
   Shan Village - Inventory Control & Stock Take
   ---------------------------------------------------------------------
   Same shape as the duty roster and the wastage report: one page, no
   server, state saved by publishing a new version of the page.

   The one design decision everything else follows from: stock is never
   stored as a number that somebody typed. It is the sum of movements -
   opening, receipt, transfer, usage, wastage, adjustment, count. So any
   figure on screen can be traced back to the document that caused it,
   and an approved stock take corrects the book by writing a movement
   rather than by overwriting history.
   ===================================================================== */
var S = JSON.parse(document.getElementById('state').textContent);

var TZ='Asia/Dubai', TZ_LABEL='Abu Dhabi time';
var PHOTO_EDGE=680, PHOTO_MAX=150000, STATE_BUDGET=8500000;
var PENDING='sv-i-pending';

var api=null, role=null, readOnly=false, busy=false, tab='dash';
var loc='ALL', idleTimer=null, session=null, photoFor=null;

/* ------------------------------ time -------------------------------- */
function partsNow(){
  var f=new Intl.DateTimeFormat('en-GB',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit',
    hour:'2-digit',minute:'2-digit',hour12:false});
  var o={}; f.formatToParts(new Date()).forEach(function(p){o[p.type]=p.value});
  return o;
}
function todayISO(){var p=partsNow();return p.year+'-'+p.month+'-'+p.day}
function nowHM(){var p=partsNow();return p.hour+':'+p.minute}
function fmtDay(d){
  if(!d)return '';
  var x=new Date(d+'T12:00:00Z'); if(isNaN(x))return d;
  return x.toLocaleDateString('en-GB',{timeZone:'UTC',weekday:'short',day:'numeric',month:'short',year:'numeric'});
}
function stampText(iso){
  if(!iso)return 'Nothing saved yet';
  var d=new Date(iso); if(isNaN(d))return 'Nothing saved yet';
  var o={timeZone:TZ,day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false};
  try{return d.toLocaleString('en-GB',o)}catch(e){delete o.timeZone;return d.toLocaleString('en-GB',o)}
}

/* ----------------------------- helpers ------------------------------ */
function $(id){return document.getElementById(id)}
function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(m){
  return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]})}
function uid(p){return (p||'x')+Date.now().toString(36)+Math.random().toString(36).slice(2,6)}
function cur(){return S.cur||'AED'}
function money(n){var v=Number(n);return isFinite(v)?cur()+' '+v.toLocaleString('en-GB',{minimumFractionDigits:2,maximumFractionDigits:2}):'-'}
function n2(v){return Math.round(Number(v)*100)/100}
function n3(v){return Math.round(Number(v)*1000)/1000}
function toast(m,ms){var t=document.createElement('div');t.className='toast';t.textContent=m;
  document.body.appendChild(t);setTimeout(function(){t.remove()},ms||2600)}

function locName(id){
  if(id==='ALL')return 'All locations';
  var l=S.locations.filter(function(x){return x.id===id})[0];
  return l?l.name:id;
}
function locList(){return S.locations.filter(function(l){return l.active!==false})}
function item(id){return S.items.filter(function(i){return i.id===id})[0]}
function activeItems(){return S.items.filter(function(i){return i.active!==false})}

/* --------------------------- stock ledger --------------------------- */
/* Rebuilt from movements on every render. With a few thousand movements
   this is far cheaper than keeping a second copy correct. */
var _stock=null, _stockRev=-1;
function stock(){
  if(_stock&&_stockRev===S.moves.length)return _stock;
  var m={};
  S.moves.forEach(function(mv){
    var byLoc=m[mv.i]||(m[mv.i]={});
    byLoc[mv.l]=(byLoc[mv.l]||0)+Number(mv.q||0);
  });
  _stock=m; _stockRev=S.moves.length;
  return m;
}
function qtyOf(itemId,locId){
  var m=stock()[itemId]; if(!m)return 0;
  if(locId&&locId!=='ALL')return n3(m[locId]||0);
  var t=0; for(var k in m)t+=m[k]; return n3(t);
}
function valueOf(itemId,locId){
  var it=item(itemId); if(!it)return 0;
  return n2(qtyOf(itemId,locId)*Number(it.cost||0));
}
function levelFor(it,locId){
  /* A location may set its own levels; otherwise the item's own apply. */
  var per=(S.levels||{})[it.id];
  if(per&&locId&&locId!=='ALL'&&per[locId])return per[locId];
  return {min:it.min,reorder:it.reorder,max:it.max};
}
function statusOf(it,locId){
  var q=qtyOf(it.id,locId), lv=levelFor(it,locId);
  var min=Number(lv.min), reo=Number(lv.reorder), max=Number(lv.max);
  if(q<=0)return 'out';
  if(isFinite(min)&&min>0&&q<=min)return 'crit';
  if(isFinite(reo)&&reo>0&&q<=reo)return 'low';
  if(isFinite(max)&&max>0&&q>max)return 'over';
  return 'ok';
}
var STATUS_TEXT={out:'Out of stock',crit:'Critical',low:'Low stock',ok:'Healthy',over:'Overstock'};
var STATUS_CLASS={out:'out',crit:'crit',low:'low',ok:'ok',over:'over'};

/* ---------------------------- tolerances ---------------------------- */
function setg(k,d){var v=(S.settings||{})[k];return (v===undefined||v===''||v===null)?d:v}
function varianceStatus(vq,sys,vv){
  var pct = sys>0 ? Math.abs(vq)/sys*100 : (vq===0?0:100);
  var tolPct=Number(setg('tolPct',2)), tolQty=Number(setg('tolQty',1)), revPct=Number(setg('reviewPct',10));
  var revVal=Number(setg('reviewValue',0));
  if(vq===0)return 'matched';
  if(revVal>0&&Math.abs(vv)>=revVal)return 'review';
  if(pct>=revPct)return 'review';
  if(pct<=tolPct||Math.abs(vq)<=tolQty)return 'minor';
  return vq<0?'shortage':'excess';
}
var VAR_TEXT={matched:'Matched',minor:'Minor variance',shortage:'Shortage',excess:'Excess',review:'Review required'};
var VAR_CLASS={matched:'ok',minor:'grey',shortage:'out',excess:'over',review:'crit'};

/* ---------------------------- audit trail --------------------------- */
function logIt(action,detail,extra){
  if(!S.audit)S.audit=[];
  S.audit.unshift(Object.assign({
    id:uid('a'), at:new Date().toISOString(), who:role||'-', action:action, detail:detail
  },extra||{}));
  if(S.audit.length>600)S.audit.length=600;
}

/* ---------------------------- access ---------------------------------
   Three codes, the same ones as the roster and the wastage page.
     owner / admin  -> everything, including approving a count, editing
                       items and costs, and reopening a locked count
     chef / staff   -> counts stock and enters quantities; no costs shown,
                       no approval, no item master. The same shared staff
                       code as the wastage page, so a cook carries one code
                       for both.
     no code        -> reads the dashboard and current stock

   This is the honest limit of a page with no server: a code is not a
   person, so "counted by" is the code that was used. When this module
   moves onto the web application it becomes a real named login.
   -------------------------------------------------------------------- */
function cryptoOk(){return !!(window.crypto&&window.crypto.subtle&&window.crypto.getRandomValues)}
function hex(b){return Array.prototype.map.call(b,function(x){return ('0'+x.toString(16)).slice(-2)}).join('')}
async function codeHash(code,salt){
  var d=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(salt+'|shan-village|'+String(code)));
  return hex(new Uint8Array(d));
}
function getLocks(){return S.locks||null}
function roleName(r){
  return r==='chef'?'Stock taker':(r==='staff'?'Stock taker':
        (r==='admin'?'Inventory admin':(r==='owner'?'Owner':'')));
}
function canCount(){return role!==null}
function canManage(){return role==='admin'||role==='owner'}
function canSeeCost(){return canManage()}

function refreshMode(){
  document.body.classList.toggle('is-manager',canManage());
  ['tab-items','tab-settings','tab-audit'].forEach(function(id){var b=$(id);if(b)b.hidden=!canManage()});
  var c=$('tab-count'); if(c)c.hidden=!canCount();
  if((tab==='items'||tab==='settings'||tab==='audit')&&!canManage())selectTab('tab-stock');
  if(tab==='count'&&!canCount())selectTab('tab-stock');
  var b=$('lockBtn');
  var shut='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><rect x="4" y="10.5" width="16" height="10.5" rx="2"/><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5"/></svg>';
  var open='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><rect x="4" y="10.5" width="16" height="10.5" rx="2"/><path d="M8 10.5V7a4 4 0 0 1 7.8-1.3"/></svg>';
  if(!canCount()){b.className='btn-lock';b.innerHTML=shut+'Sign in'}
  else{b.className='btn-lock open';b.innerHTML=open+roleName(role)}
  render();
}
function lockNow(quiet){
  role=null; clearTimeout(idleTimer);
  /* Signing out in the middle of a count must not leave the count on
     screen for whoever picks the phone up next - and must not lose the
     lines already typed. */
  if(session){ clearTimeout(saveTimer); saveState(null,true) }
  hideRun();
  try{sessionStorage.removeItem('sv-i-role')}catch(e){}
  refreshMode(); if(!quiet)toast('Signed out.');
}
function unlockAs(r){
  role=r;
  try{sessionStorage.setItem('sv-i-role',r)}catch(e){}
  armIdle(); refreshMode();
  /* Signing in is nearly always the start of a count, so land there. */
  if(canCount()&&(tab==='stock'||tab==='dash'))selectTab('tab-count');
  toast('Signed in as '+roleName(r)+'.');
}
function armIdle(){
  clearTimeout(idleTimer);
  if(!canCount())return;
  /* A count can take an hour on the shelves; the office locks sooner. */
  var ms = canManage() ? 1200000 : 28800000;
  idleTimer=setTimeout(function(){
    if(canCount()){lockNow(true);toast('Signed out after a while without use.',4000)}
  },ms);
}
['pointerdown','keydown'].forEach(function(ev){
  document.addEventListener(ev,function(){ if(canCount())armIdle() },{passive:true});
});

function sheet(html){var d=$('sheet');d.innerHTML=html;d.showModal();return d}
function closeSheet(){var d=$('sheet');if(d.open)d.close()}
function askUnlock(){
  if(!cryptoOk()){toast('This browser cannot check the code.',4000);return}
  var d=sheet('<div class="sheet"><div class="sheet-head"><h3>Sign in</h3>'+
    '<div class="who">Staff code to count stock. Owner or inventory admin code for everything else.</div></div>'+
    '<div class="sheet-body"><div id="lkErr"></div>'+
    '<div><label class="lbl" for="lkCode">Code</label>'+
    '<input class="f pin" id="lkCode" type="password" autocomplete="off"></div>'+
    '<div class="note-box">Without a code you can read the dashboard and current stock, but not count or change anything.</div>'+
    '</div><div class="sheet-foot"><button class="btn" id="lkCancel">Cancel</button>'+
    '<button class="btn primary" id="lkGo">Sign in</button></div></div>');
  var go=async function(){
    var v=$('lkCode').value; if(!v)return;
    var l=getLocks()||{}, m=null;
    if(l.owner&&await codeHash(v,l.owner.salt)===l.owner.hash)m='owner';
    else if(l.admin&&await codeHash(v,l.admin.salt)===l.admin.hash)m='admin';
    else if(l.chef&&await codeHash(v,l.chef.salt)===l.chef.hash)m='chef';
    else if(l.staff&&await codeHash(v,l.staff.salt)===l.staff.hash)m='staff';
    if(m){d.close();unlockAs(m)}
    else{$('lkErr').innerHTML='<div class="note-box bad">That code is not right.</div>';
         $('lkCode').value='';$('lkCode').focus()}
  };
  $('lkGo').onclick=go; $('lkCancel').onclick=function(){d.close()};
  $('lkCode').onkeydown=function(e){if(e.key==='Enter'){e.preventDefault();go()}};
  setTimeout(function(){$('lkCode').focus()},60);
}
function lockClicked(){ canCount()?lockNow():askUnlock() }

/* ------------------------------ photos ------------------------------ */
function shrink(file,cb){
  if(!file||!/^image\//.test(file.type||'')){cb(null,'That file is not a picture.');return}
  var url=URL.createObjectURL(file), img=new Image();
  img.onload=function(){
    try{
      var w=img.naturalWidth||img.width, h=img.naturalHeight||img.height;
      var s=Math.min(1,PHOTO_EDGE/Math.max(w,h));
      var c=document.createElement('canvas');
      c.width=Math.max(1,Math.round(w*s)); c.height=Math.max(1,Math.round(h*s));
      var x=c.getContext('2d'); x.fillStyle='#fff'; x.fillRect(0,0,c.width,c.height);
      x.drawImage(img,0,0,c.width,c.height);
      var q=0.52, out=c.toDataURL('image/jpeg',q);
      while(out.length>PHOTO_MAX&&q>0.24){q=Math.round((q-0.08)*100)/100;out=c.toDataURL('image/jpeg',q)}
      URL.revokeObjectURL(url);
      if(out.length>PHOTO_MAX){cb(null,'That picture is too large even after shrinking.');return}
      cb(out,null);
    }catch(e){URL.revokeObjectURL(url);cb(null,'The picture could not be read.')}
  };
  img.onerror=function(){URL.revokeObjectURL(url);cb(null,'The picture could not be read.')};
  img.src=url;
}
/* Photos are the only unbounded thing here. Approved counts keep theirs
   for the retention period; beyond that the evidence is released and the
   line says so, rather than the page growing until it cannot be saved. */
function keepDays(){var n=Number(setg('keepPhotos',30));return (isFinite(n)&&n>0)?n:30}
function shedPhotos(){
  var cut=new Date(todayISO()+'T12:00:00Z');
  cut.setUTCDate(cut.getUTCDate()-keepDays());
  var cutISO=cut.toISOString().slice(0,10), dropped=0, all=[];
  (S.takes||[]).forEach(function(t){
    Object.keys(t.lines||{}).forEach(function(k){
      var L=t.lines[k];
      if(L.photo){ if(t.date<cutISO){delete L.photo;L.hadPhoto=1;dropped++} else all.push({t:t,L:L}) }
    });
  });
  all.sort(function(a,b){return a.t.date<b.t.date?-1:1});
  while(JSON.stringify(S).length>STATE_BUDGET&&all.length){
    var e=all.shift(); delete e.L.photo; e.L.hadPhoto=1; dropped++;
  }
  return dropped;
}

/* ------------------------------- shell ------------------------------ */
var LOGO=[
'<svg class="mark" viewBox="0 0 200 200" role="img" aria-label="Shan Village"><defs>',
'  <linearGradient id="gold" x1="0" y1="0" x2="0" y2="1">',
'    <stop offset="0" stop-color="#F7E39A"/><stop offset=".28" stop-color="#E3BE63"/>',
'    <stop offset=".55" stop-color="#B8860F"/><stop offset=".78" stop-color="#E9C86E"/>',
'    <stop offset="1" stop-color="#8A5F12"/>',
'  </linearGradient>',
'  <linearGradient id="goldFlat" x1="0" y1="0" x2="0" y2="1">',
'    <stop offset="0" stop-color="#E8C777"/><stop offset=".5" stop-color="#C79A38"/>',
'    <stop offset="1" stop-color="#A97C1E"/>',
'  </linearGradient>',
'  <path id="arc" d="M30 104 A70 70 0 0 1 170 104"/>',
'  <clipPath id="hutClip"><path d="M100 33 L173 99 L154 99 L154 134 L46 134 L46 99 L27 99 Z"/></clipPath>',
'  <clipPath id="discClip"><circle cx="100" cy="100" r="92"/></clipPath>',
'</defs>',
'<circle cx="100" cy="100" r="99" fill="#F0873A"/>',
'<circle cx="100" cy="100" r="92" fill="#000"/>',
'<!-- hut: black ground with alternating orange / red bands -->',
'<g clip-path="url(#hutClip)">',
'  <rect x="20" y="28" width="160" height="112" fill="#000"/>',
'  <g>',
'    <rect x="20" y="38"  width="160" height="8" fill="#F0873A"/>',
'    <rect x="20" y="49"  width="160" height="8" fill="#E63329"/>',
'    <rect x="20" y="60"  width="160" height="8" fill="#F0873A"/>',
'    <rect x="20" y="71"  width="160" height="8" fill="#E63329"/>',
'    <rect x="20" y="82"  width="160" height="8" fill="#F0873A"/>',
'    <rect x="20" y="93"  width="160" height="8" fill="#E63329"/>',
'    <rect x="20" y="104" width="160" height="8" fill="#F0873A"/>',
'    <rect x="20" y="115" width="160" height="8" fill="#E63329"/>',
'    <rect x="20" y="126" width="160" height="8" fill="#F0873A"/>',
'  </g>',
'</g>',
'<path d="M100 33 L173 99 L154 99 L154 134 L46 134 L46 99 L27 99 Z"',
'      fill="none" stroke="#E63329" stroke-width="3.4" stroke-linejoin="round"/>',
'<!-- stepped gold base -->',
'<g clip-path="url(#discClip)">',
'  <rect x="8" y="148" width="184" height="9" fill="url(#goldFlat)"/>',
'  <rect x="8" y="161" width="184" height="9" fill="url(#goldFlat)"/>',
'  <rect x="8" y="174" width="184" height="9" fill="url(#goldFlat)"/>',
'  <rect x="8" y="187" width="184" height="9" fill="url(#goldFlat)"/>',
'</g>',
'<!-- arched wordmark -->',
'<text font-family="Georgia,\'Times New Roman\',serif" font-size="27" font-weight="700"',
'      fill="url(#gold)" stroke="#4A3208" stroke-width=".5" letter-spacing="2.4">',
'  <textPath href="#arc" startOffset="50%" text-anchor="middle">SHAN VILLAGE</textPath>',
'</text>',
'<!-- SV monogram -->',
'<text x="100" y="120" font-family="Georgia,\'Times New Roman\',serif" font-size="78"',
'      font-style="italic" font-weight="700" text-anchor="middle"',
'      fill="url(#gold)" stroke="#FFF7E4" stroke-width="2.6" paint-order="stroke">SV</text></svg>'
].join('');

var SHELL=[
'<header class="app-header">',
LOGO,
'  <div><h1>Inventory</h1><div class="sub">Shan Village</div></div>',
'  <div class="right">',
'    <select class="locpick" id="locPick" aria-label="Location"></select>',
'    <button class="btn-lock" id="lockBtn"></button>',
'    <div class="stamp" id="stamp"></div>',
'  </div>',
'</header>',
'<nav class="tabs" role="tablist" aria-label="Sections">',
'  <button role="tab" id="tab-count" aria-selected="true" hidden>Stock take</button>',
'  <button role="tab" id="tab-stock" aria-selected="false">Current stock</button>',
'  <button role="tab" id="tab-items" aria-selected="false" hidden>Item master</button>',
'  <button role="tab" id="tab-settings" aria-selected="false" hidden>Settings</button>',
'  <button role="tab" id="tab-audit" aria-selected="false" hidden>Audit log</button>',
'  <button role="tab" id="tab-dash" aria-selected="false">Dashboard</button>',
'</nav>',
'<main>',
'  <div id="banner"></div>',

/* ---- current stock ---- */
'  <section class="panel" id="panel-stock" hidden>',
'    <div class="card card-pad">',
'      <div class="grid3">',
'        <div class="field"><label class="lbl" for="stSearch">Search</label>',
'          <input class="f" id="stSearch" placeholder="Name or SKU" autocomplete="off"></div>',
'        <div class="field"><label class="lbl" for="stCat">Category</label><select class="f" id="stCat"></select></div>',
'        <div class="field"><label class="lbl" for="stStatus">Stock status</label><select class="f" id="stStatus">',
'          <option value="">All</option><option value="out">Out of stock</option><option value="crit">Critical</option>',
'          <option value="low">Low stock</option><option value="ok">Healthy</option><option value="over">Overstock</option>',
'        </select></div>',
'      </div>',
'      <div class="row no-print" style="margin-top:11px"><span class="faint" id="stCount"></span>',
'        <div class="spacer"></div><button class="btn" id="stPrint">Print</button></div>',
'    </div>',
'    <div class="wrap"><table id="stockTable"></table></div>',
'  </section>',

/* ---- stock take ---- */
'  <section class="panel" id="panel-count" hidden>',
'    <div id="countHome">',
'      <div class="card card-pad">',
'        <h2 class="sec">Start a stock take</h2>',
'        <p class="sec">One count per location per day. Counting is judged against stock as it stands when you start.</p>',
'        <div class="grid2" style="margin-top:11px">',
'          <div class="field"><label class="lbl" for="ctLoc">Location</label><select class="f" id="ctLoc"></select></div>',
'          <div class="field"><label class="lbl" for="ctDate">Date</label><input class="f" id="ctDate" type="date"></div>',
'        </div>',
'        <div class="field" style="margin-top:11px"><label class="lbl">How do you want to count?</label>',
'          <div class="chips" id="ctMode">',
'            <button type="button" class="chip" data-mode="manual" aria-pressed="true">One by one, with a photo</button>',
'            <button type="button" class="chip" data-mode="list" aria-pressed="false">Work down the item list</button>',
'          </div>',
'          <div class="hint" id="ctModeHint"></div></div>',
'        <div class="field" id="ctCatWrap" hidden><label class="lbl" for="ctCat">Only this category</label>',
'          <select class="f" id="ctCat"></select></div>',
'        <div id="ctWarn" style="margin-top:11px"></div>',
'        <button class="btn-big" id="ctStart" style="margin-top:13px">Start counting</button>',
'      </div>',
'      <div class="card card-pad"><h2 class="sec">Stock takes</h2>',
'        <div class="wrap" style="margin-top:9px;border:0"><table id="takesTable"></table></div></div>',
'    </div>',
'    <div id="countRun" hidden>',
'      <div class="progwrap">',
'        <div class="row" style="margin-bottom:7px"><strong id="runTitle"></strong>',
'          <div class="spacer"></div><button class="btn no-print" id="runClose">Close</button></div>',
'        <div class="progbar"><i id="runBar" style="width:0%"></i></div>',
'        <div class="progtext" id="runText"></div>',
'      </div>',
'      <button class="btn-big no-print" id="runAdd" style="margin:10px 0">Add an item to this count</button>',
'      <div class="card card-pad no-print"><div class="grid2">',
'        <div class="field"><label class="lbl" for="runSearch">Find an item</label>',
'          <input class="f" id="runSearch" placeholder="Name or SKU" autocomplete="off"></div>',
'        <div class="field"><label class="lbl" for="runShow">Show</label><select class="f" id="runShow">',
'          <option value="all">All items</option><option value="todo">Not counted yet</option>',
'          <option value="done">Counted</option><option value="var">With a variance</option></select></div>',
'      </div></div>',
'      <div id="runList" style="display:flex;flex-direction:column;gap:9px"></div>',
'      <div class="card card-pad no-print" id="runFoot"></div>',
'    </div>',
'  </section>',

/* ---- items ---- */
'  <section class="panel" id="panel-items" hidden>',
'    <div class="card card-pad">',
'      <div class="row"><h2 class="sec">Item master</h2><div class="spacer"></div>',
'        <button class="btn" id="imImport">Import CSV</button>',
'        <button class="btn" id="imExport">Export</button>',
'        <button class="btn primary" id="imAdd">Add item</button></div>',
'      <div class="grid3" style="margin-top:11px">',
'        <div class="field"><label class="lbl" for="imSearch">Search</label>',
'          <input class="f" id="imSearch" placeholder="Name or SKU" autocomplete="off"></div>',
'        <div class="field"><label class="lbl" for="imCat">Category</label><select class="f" id="imCat"></select></div>',
'        <div class="field"><label class="lbl" for="imActive">Show</label><select class="f" id="imActive">',
'          <option value="1">Active only</option><option value="0">Including inactive</option></select></div>',
'      </div>',
'    </div>',
'    <div class="wrap"><table id="itemsTable"></table></div>',
'  </section>',

/* ---- settings ---- */
'  <section class="panel" id="panel-settings" hidden>',
'    <div class="card card-pad"><h2 class="sec">Locations</h2>',
'      <p class="sec">Stock is held separately at each. Counting never mixes them.</p>',
'      <div class="wrap" style="margin-top:9px;border:0"><table id="locsTable"></table></div>',
'      <div class="row no-print" style="margin-top:9px"><input class="f" id="newLoc" placeholder="New location name" style="max-width:260px">',
'        <button class="btn" id="addLoc">Add</button></div></div>',
'    <div class="card card-pad"><h2 class="sec">Categories</h2>',
'      <div class="wrap" style="margin-top:9px;border:0"><table id="catsTable"></table></div>',
'      <div class="row no-print" style="margin-top:9px"><input class="f" id="newCat" placeholder="New category" style="max-width:260px">',
'        <button class="btn" id="addCat">Add</button></div></div>',
'    <div class="card card-pad"><h2 class="sec">Variance tolerance</h2>',
'      <p class="sec">Shan Village policy, not a fixed rule. Set these before you rely on the variance report.</p>',
'      <div class="grid3" style="margin-top:11px">',
'        <div class="field"><label class="lbl" for="sTolPct">Minor variance up to (%)</label><input class="f num" id="sTolPct" type="number" min="0" step="0.5"></div>',
'        <div class="field"><label class="lbl" for="sTolQty">or up to (units)</label><input class="f num" id="sTolQty" type="number" min="0" step="0.1"></div>',
'        <div class="field"><label class="lbl" for="sRevPct">Review required above (%)</label><input class="f num" id="sRevPct" type="number" min="0" step="1"></div>',
'        <div class="field"><label class="lbl" for="sRevVal">Review required above value</label><input class="f num" id="sRevVal" type="number" min="0" step="1"></div>',
'        <div class="field"><label class="lbl" for="sCur">Currency</label><input class="f" id="sCur" maxlength="6"></div>',
'        <div class="field"><label class="lbl" for="sKeep">Keep photos for (days)</label><input class="f num" id="sKeep" type="number" min="1" step="1"></div>',
'      </div></div>',
'    <div class="card card-pad"><h2 class="sec">Photo rules</h2>',
'      <div class="grid2" style="margin-top:9px">',
'        <div class="field"><label class="lbl" for="sPhoto">Photo on a counted item</label><select class="f" id="sPhoto">',
'          <option value="off">Optional</option><option value="var">Required when there is a variance</option>',
'          <option value="all">Required on every item</option></select></div>',
'        <div class="field"><label class="lbl" for="sComment">Comment on a large variance</label><select class="f" id="sComment">',
'          <option value="off">Optional</option><option value="on">Required above the review threshold</option></select></div>',
'      </div></div>',
'    <div class="row no-print"><button class="btn primary" id="setSave">Save settings</button></div>',
'  </section>',

/* ---- audit ---- */
'  <section class="panel" id="panel-audit" hidden>',
'    <div class="card card-pad"><h2 class="sec">Audit log</h2>',
'      <p class="sec">Every change that matters, newest first, in '+'Abu Dhabi time.</p></div>',
'    <div class="wrap"><table id="auditTable"></table></div>',
'  </section>',

/* ---- dashboard ---- */
'  <section class="panel" id="panel-dash" hidden>',
'    <div class="tiles" id="dashTiles"></div>',
'    <div class="card card-pad">',
'      <div class="row"><h2 class="sec">Attention required</h2><div class="spacer"></div>',
'        <span class="faint" id="attnCount"></span></div>',
'      <p class="sec">Out of stock, critical and low items for the location above.</p>',
'    </div>',
'    <div class="wrap"><table id="attnTable"></table></div>',
'    <div class="card card-pad" id="cardLocValue">',
'      <div class="row"><h2 class="sec">Value by location</h2></div>',
'      <div class="wrap" style="margin-top:9px;border:0"><table id="locTable"></table></div>',
'    </div>',
'    <div class="card card-pad" id="cardRecentTakes">',
'      <h2 class="sec">Recent stock takes</h2>',
'      <div class="wrap" style="margin-top:9px;border:0"><table id="recentTakes"></table></div>',
'    </div>',
'  </section>',
'</main>',
'<dialog id="sheet"></dialog>',
'<dialog id="light" class="lightbox"></dialog>',
'<input type="file" id="photoFile" accept="image/*" capture="environment" hidden>',
'<input type="file" id="csvFile" accept=".csv,text/csv" hidden>'
].join('');

/* ------------------------------ render ------------------------------ */
function tile(k,v,n,cls){
  return '<div class="tile'+(cls?' '+cls:'')+'"><div class="k">'+esc(k)+'</div>'+
    '<div class="v">'+esc(v)+'</div><div class="n">'+esc(n||'')+'</div></div>';
}
function statusPill(st){return '<span class="pill '+STATUS_CLASS[st]+'">'+STATUS_TEXT[st]+'</span>'}
function takePill(s){
  var m={draft:['draft','Draft'],in_progress:['prog','In progress'],submitted:['subm','Submitted'],
         reviewed:['subm','Reviewed'],approved:['appr','Approved'],locked:['lock','Locked']};
  var x=m[s]||['grey',s];
  return '<span class="pill '+x[0]+'">'+x[1]+'</span>';
}
function fillSelect(el,opts,keep){
  var v=keep?el.value:null;
  el.innerHTML=opts.map(function(o){return '<option value="'+esc(o[0])+'">'+esc(o[1])+'</option>'}).join('');
  if(v!==null)el.value=v;
}
function catOptions(all){
  var o=all?[['','All categories']]:[['','No category']];
  (S.categories||[]).forEach(function(c){o.push([c,c])});
  return o;
}

function renderChrome(){
  fillSelect($('locPick'),[['ALL','All locations']].concat(locList().map(function(l){return [l.id,l.name]})));
  $('locPick').value=loc;
  $('stamp').innerHTML='<strong>'+esc(stampText(S.pub))+'</strong>'+(readOnly?'View only':'Live - '+TZ_LABEL);
}

/* ------------------------------ dashboard --------------------------- */
function renderDash(){
  var items=activeItems();
  var byStatus={out:0,crit:0,low:0,ok:0,over:0};
  var totalVal=0, attn=[];
  items.forEach(function(it){
    var st=statusOf(it,loc); byStatus[st]++;
    totalVal+=valueOf(it.id,loc);
    if(st==='out'||st==='crit'||st==='low')attn.push({it:it,st:st});
  });
  var order={out:0,crit:1,low:2};
  attn.sort(function(a,b){return order[a.st]-order[b.st]||a.it.name.localeCompare(b.it.name)});

  var takes=S.takes||[];
  var pending=takes.filter(function(t){return t.status!=='approved'&&t.status!=='locked'}).length;
  var lastApproved=takes.filter(function(t){return t.status==='locked'||t.status==='approved'})
    .sort(function(a,b){return a.date<b.date?1:-1})[0];
  var varVal=lastApproved?n2(lastApproved.varValue||0):null;

  /* A stock taker sees what is on the shelves; money, pending approvals and
     the count history are the office's business. */
  $('dashTiles').innerHTML=
    (canSeeCost()?tile('Inventory value',money(totalVal),locName(loc)):'')+
    tile('Active items',items.length,canSeeCost()?'in the master':'at '+locName(loc))+
    tile('Out of stock',byStatus.out,'need ordering now',byStatus.out?'bad':'')+
    tile('Low or critical',byStatus.crit+byStatus.low,'below reorder level',(byStatus.crit+byStatus.low)?'warn':'')+
    (canManage()?tile('Pending stock takes',pending,pending?'awaiting approval':'none open',pending?'warn':''):'')+
    (canSeeCost()?tile('Last count variance',varVal===null?'-':money(varVal),
        lastApproved?fmtDay(lastApproved.date):'no approved count',
        (varVal!==null&&varVal<0)?'bad':''):'');
  $('cardLocValue').hidden=!canManage();
  $('cardRecentTakes').hidden=!canManage();

  $('attnCount').textContent=attn.length+' item'+(attn.length===1?'':'s');
  var h='<thead><tr><th>Item</th><th>Status</th><th class="n">On hand</th><th class="n">Reorder at</th>'+
        (loc==='ALL'?'<th>Where</th>':'')+'</tr></thead><tbody>';
  if(!attn.length)h+='<tr><td colspan="5" class="empty">Nothing needs attention. Every item is above its reorder level.</td></tr>';
  attn.slice(0,60).forEach(function(a){
    var lv=levelFor(a.it,loc);
    h+='<tr><td class="name">'+esc(a.it.name)+'<span class="sku">'+esc(a.it.sku||'')+'</span></td>'+
       '<td>'+statusPill(a.st)+'</td>'+
       '<td class="n">'+n3(qtyOf(a.it.id,loc))+' '+esc(a.it.unit||'')+'</td>'+
       '<td class="n">'+(lv.reorder||'-')+'</td>'+
       (loc==='ALL'?'<td class="faint" style="font-size:12px">'+esc(whereLow(a.it))+'</td>':'')+'</tr>';
  });
  $('attnTable').innerHTML=h+'</tbody>';

  var lh='<thead><tr><th>Location</th><th class="n">Items held</th>'+(canSeeCost()?'<th class="n">Value</th>':'')+'</tr></thead><tbody>';
  var grand=0;
  locList().forEach(function(l){
    var held=0,val=0;
    items.forEach(function(it){var q=qtyOf(it.id,l.id); if(q>0){held++;val+=valueOf(it.id,l.id)}});
    grand+=val;
    lh+='<tr><td class="name">'+esc(l.name)+'</td><td class="n">'+held+'</td>'+
        (canSeeCost()?'<td class="n">'+money(val)+'</td>':'')+'</tr>';
  });
  if(canSeeCost())lh+='<tr><td class="name">Total</td><td class="n"></td><td class="n"><strong>'+money(grand)+'</strong></td></tr>';
  $('locTable').innerHTML=lh+'</tbody>';

  var rh='<thead><tr><th>Reference</th><th>Location</th><th>Date</th><th>Status</th><th class="n">Counted</th>'+
         (canSeeCost()?'<th class="n">Variance</th>':'')+'</tr></thead><tbody>';
  var recent=takes.slice().sort(function(a,b){return a.date<b.date?1:-1}).slice(0,8);
  if(!recent.length)rh+='<tr><td colspan="6" class="empty">No stock take yet.</td></tr>';
  recent.forEach(function(t){
    rh+='<tr><td class="name">'+esc(t.ref)+'</td><td>'+esc(locName(t.loc))+'</td><td>'+esc(fmtDay(t.date))+'</td>'+
        '<td>'+takePill(t.status)+'</td><td class="n">'+countedOf(t)+' / '+Object.keys(t.lines||{}).length+'</td>'+
        (canSeeCost()?'<td class="n">'+(t.varValue==null?'-':money(t.varValue))+'</td>':'')+'</tr>';
  });
  $('recentTakes').innerHTML=rh+'</tbody>';
}
function whereLow(it){
  var out=[];
  locList().forEach(function(l){
    var st=statusOf(it,l.id);
    if(st==='out'||st==='crit'||st==='low')out.push(l.name.replace('Al ',''));
  });
  return out.join(', ');
}
function countedOf(t){
  var n=0; Object.keys(t.lines||{}).forEach(function(k){if(t.lines[k].q!=null&&t.lines[k].q!=='')n++});
  return n;
}

/* --------------------------- current stock -------------------------- */
function renderStock(){
  fillSelect($('stCat'),catOptions(true),true);
  var q=($('stSearch').value||'').toLowerCase().trim();
  var cat=$('stCat').value, st=$('stStatus').value;
  var rows=activeItems().filter(function(it){
    if(cat&&it.cat!==cat)return false;
    if(st&&statusOf(it,loc)!==st)return false;
    if(q&&(it.name+' '+(it.sku||'')).toLowerCase().indexOf(q)<0)return false;
    return true;
  }).sort(function(a,b){return a.name.localeCompare(b.name)});
  $('stCount').textContent=rows.length+' item'+(rows.length===1?'':'s')+' - '+locName(loc);

  var showAll=(loc==='ALL');
  var h='<thead><tr><th>Item</th><th>Category</th>';
  if(showAll)locList().forEach(function(l){h+='<th class="n">'+esc(l.name.replace('Al Ghurair ','AG ').replace('Al Quoz ','AQ '))+'</th>'});
  h+='<th class="n">'+(showAll?'Total':'On hand')+'</th><th>Status</th>';
  if(canSeeCost())h+='<th class="n">Value</th>';
  h+='</tr></thead><tbody>';
  if(!rows.length)h+='<tr><td colspan="9" class="empty">No item matches.</td></tr>';
  rows.forEach(function(it){
    h+='<tr><td class="name">'+esc(it.name)+'<span class="sku">'+esc(it.sku||'')+'</span></td>'+
       '<td class="faint" style="font-size:12.5px">'+esc(it.cat||'-')+'</td>';
    if(showAll)locList().forEach(function(l){h+='<td class="n">'+n3(qtyOf(it.id,l.id))+'</td>'});
    h+='<td class="n"><strong>'+n3(qtyOf(it.id,loc))+'</strong> '+esc(it.unit||'')+'</td>'+
       '<td>'+statusPill(statusOf(it,loc))+'</td>';
    if(canSeeCost())h+='<td class="n">'+money(valueOf(it.id,loc))+'</td>';
    h+='</tr>';
  });
  $('stockTable').innerHTML=h+'</tbody>';
}

/* ---------------------------- item master --------------------------- */
function renderItems(){
  if(!canManage())return;
  fillSelect($('imCat'),catOptions(true),true);
  var q=($('imSearch').value||'').toLowerCase().trim();
  var cat=$('imCat').value, onlyActive=$('imActive').value==='1';
  var rows=S.items.filter(function(it){
    if(onlyActive&&it.active===false)return false;
    if(cat&&it.cat!==cat)return false;
    if(q&&(it.name+' '+(it.sku||'')).toLowerCase().indexOf(q)<0)return false;
    return true;
  }).sort(function(a,b){return a.name.localeCompare(b.name)});
  var h='<thead><tr><th>Item</th><th>Category</th><th>Count unit</th><th class="n">Cost</th>'+
        '<th class="n">Min</th><th class="n">Reorder</th><th class="n">Max</th><th></th></tr></thead><tbody>';
  if(!rows.length)h+='<tr><td colspan="8" class="empty">No items yet. Add one, or import a CSV.</td></tr>';
  rows.forEach(function(it){
    h+='<tr'+(it.active===false?' style="opacity:.55"':'')+'>'+
       '<td class="name">'+esc(it.name)+(it.active===false?' <span class="pill grey">inactive</span>':'')+
         '<span class="sku">'+esc(it.sku||'')+'</span></td>'+
       '<td class="faint" style="font-size:12.5px">'+esc(it.cat||'-')+'</td>'+
       '<td>'+esc(it.unit||'-')+'</td><td class="n">'+(it.cost==null||it.cost===''?'-':n2(it.cost))+'</td>'+
       '<td class="n">'+(it.min||'-')+'</td><td class="n">'+(it.reorder||'-')+'</td><td class="n">'+(it.max||'-')+'</td>'+
       '<td class="no-print"><button class="btn" data-edit="'+it.id+'" style="padding:5px 10px;font-size:12px">Edit</button></td></tr>';
  });
  $('itemsTable').innerHTML=h+'</tbody>';
}

/* ------------------------------ settings ---------------------------- */
function renderSettings(){
  if(!canManage())return;
  var lh='<thead><tr><th>Location</th><th>Code</th><th class="n">Items held</th><th></th></tr></thead><tbody>';
  S.locations.forEach(function(l){
    var held=activeItems().filter(function(it){return qtyOf(it.id,l.id)>0}).length;
    lh+='<tr'+(l.active===false?' style="opacity:.55"':'')+'><td class="name">'+esc(l.name)+'</td>'+
        '<td class="faint" style="font-family:var(--font-mono);font-size:12px">'+esc(l.code||l.id)+'</td>'+
        '<td class="n">'+held+'</td>'+
        '<td class="no-print"><button class="btn" data-loctoggle="'+l.id+'" style="padding:5px 10px;font-size:12px">'+
        (l.active===false?'Reactivate':'Deactivate')+'</button></td></tr>';
  });
  $('locsTable').innerHTML=lh+'</tbody>';

  var ch='<thead><tr><th>Category</th><th class="n">Items</th><th></th></tr></thead><tbody>';
  (S.categories||[]).forEach(function(c){
    var n=S.items.filter(function(i){return i.cat===c}).length;
    ch+='<tr><td class="name">'+esc(c)+'</td><td class="n">'+n+'</td>'+
        '<td class="no-print"><button class="btn danger" data-delcat="'+esc(c)+'" style="padding:5px 10px;font-size:12px">Remove</button></td></tr>';
  });
  if(!(S.categories||[]).length)ch+='<tr><td colspan="3" class="empty">No categories yet.</td></tr>';
  $('catsTable').innerHTML=ch+'</tbody>';

  $('sTolPct').value=setg('tolPct',2); $('sTolQty').value=setg('tolQty',1);
  $('sRevPct').value=setg('reviewPct',10); $('sRevVal').value=setg('reviewValue',0);
  $('sCur').value=cur(); $('sKeep').value=keepDays();
  $('sPhoto').value=setg('photoRule','var'); $('sComment').value=setg('commentRule','on');
}

/* ------------------------------- audit ------------------------------ */
function renderAudit(){
  if(!canManage())return;
  var h='<thead><tr><th style="width:150px">When</th><th style="width:110px">Who</th><th>What</th></tr></thead><tbody>';
  var rows=(S.audit||[]);
  if(!rows.length)h+='<tr><td colspan="3" class="empty">Nothing recorded yet.</td></tr>';
  rows.slice(0,300).forEach(function(a){
    h+='<tr><td class="num" style="font-size:11.5px">'+esc(stampText(a.at))+'</td>'+
       '<td><span class="pill '+(a.who==='chef'?'grey':'subm')+'">'+esc(roleName(a.who)||a.who)+'</span></td>'+
       '<td><strong>'+esc(a.action)+'</strong>'+(a.detail?' &mdash; '+esc(a.detail):'')+'</td></tr>';
  });
  $('auditTable').innerHTML=h+'</tbody>';
}

function render(){
  renderChrome(); renderDash(); renderStock();
  if(canCount())renderTakeHome();
  if(canManage()){renderItems();renderSettings();renderAudit()}
  if(session)renderRun();
}

/* ---------------------------- stock take ----------------------------
   A count is a document. It freezes the system quantity when it starts,
   so a delivery arriving mid-count cannot invent a variance; it records
   blank and zero as different things; and it changes stock only when it
   is approved, by writing count movements - never by overwriting.
   -------------------------------------------------------------------- */
function nextRef(dateISO){
  var base='ST-'+dateISO.replace(/-/g,'')+'-';
  var n=1;
  (S.takes||[]).forEach(function(t){
    if(t.ref&&t.ref.indexOf(base)===0){var k=parseInt(t.ref.slice(base.length),10);if(k>=n)n=k+1}
  });
  return base+('00'+n).slice(-3);
}
function takeById(id){return (S.takes||[]).filter(function(t){return t.id===id})[0]}
function openTakeFor(locId,date){
  return (S.takes||[]).filter(function(t){
    return t.loc===locId&&t.date===date&&t.status!=='cancelled';})[0];
}

function renderTakeHome(){
  fillSelect($('ctLoc'),locList().map(function(l){return [l.id,l.name]}),true);
  fillSelect($('ctCat'),catOptions(true),true);
  if(!$('ctDate').value)$('ctDate').value=todayISO();
  checkDuplicate();
  var h='<thead><tr><th>Reference</th><th>Location</th><th>Date</th><th>Status</th><th>Counted by</th><th class="n">Counted</th>'+
        (canSeeCost()?'<th class="n">Variance</th>':'')+'<th></th></tr></thead><tbody>';
  var rows=(S.takes||[]).slice().sort(function(a,b){return a.date<b.date?1:(a.ref<b.ref?1:-1)});
  if(!rows.length)h+='<tr><td colspan="7" class="empty">No stock take yet.</td></tr>';
  rows.slice(0,canManage()?40:10).forEach(function(t){
    var lines=Object.keys(t.lines||{}).length;
    h+='<tr><td class="name">'+esc(t.ref)+'</td><td>'+esc(locName(t.loc))+'</td><td>'+esc(fmtDay(t.date))+'</td>'+
       '<td>'+takePill(t.status)+'</td>'+
       '<td>'+esc((t.byNames||[]).join(', ')||roleName(t.by)||'-')+'</td>'+
       '<td class="n">'+countedOf(t)+' / '+lines+'</td>'+
       (canSeeCost()?'<td class="n">'+(t.varValue==null?'-':money(t.varValue))+'</td>':'')+
       '<td class="no-print"><button class="btn" data-open="'+t.id+'" style="padding:5px 10px;font-size:12px">'+
       (t.status==='locked'?'View':'Open')+'</button></td></tr>';
  });
  $('takesTable').innerHTML=h+'</tbody>';
}
function checkDuplicate(){
  var l=$('ctLoc').value, d=$('ctDate').value;
  var ex=l&&d?openTakeFor(l,d):null;
  var box=$('ctWarn');
  if(!ex){box.innerHTML='';$('ctStart').textContent='Start counting';return}
  box.innerHTML='<div class="note-box warn">'+esc(ex.ref)+' already exists for '+esc(locName(l))+
    ' on '+esc(fmtDay(d))+' ('+esc(ex.status.replace('_',' '))+'). Starting again would count the same stock twice.</div>';
  $('ctStart').textContent='Continue '+ex.ref;
}

function countMode(){
  var b=document.querySelector('#ctMode .chip[aria-pressed="true"]');
  return b?b.getAttribute('data-mode'):'manual';
}
function startTake(){
  var locId=$('ctLoc').value, date=$('ctDate').value||todayISO(), cat=$('ctCat').value;
  if(!locId){toast('Pick a location.');return}
  var ex=openTakeFor(locId,date);
  if(ex){session=ex.id;showRun();return}
  var mode=countMode(), lines={};
  if(mode==='list'){
    activeItems().filter(function(it){return !cat||it.cat===cat}).forEach(function(it){
      lines[it.id]={q:null,sys:qtyOf(it.id,locId),cost:Number(it.cost||0),unit:it.unit||''};
    });
    if(!Object.keys(lines).length){toast('No active items to count. Use "one by one" instead.',4500);return}
  }
  var t={id:uid('t'),ref:nextRef(date),loc:locId,date:date,status:'in_progress',mode:mode,
         startedAt:new Date().toISOString(),by:role,lines:lines};
  if(!S.takes)S.takes=[];
  S.takes.unshift(t);
  logIt('Stock take started',t.ref+' - '+locName(locId)+' - '+Object.keys(lines).length+' items');
  session=t.id;
  saveState('Stock take '+t.ref+' started.');
  showRun();
}
function showRun(){ $('countHome').hidden=true; $('countRun').hidden=false; renderRun() }
function hideRun(){ session=null; $('countRun').hidden=true; $('countHome').hidden=false; renderTakeHome() }

/* An item counted for the very first time has no book figure to differ
   from - the count IS the opening stock. Calling that a variance would
   demand a photo and a written reason for every line of a kitchen's first
   count, and would report the whole opening stock as a discrepancy. */
function isOpening(id,L){
  var it=item(id);
  return !!(it&&it.createdIn&&L&&!Number(L.sys||0));
}
function lineVariance(L,id){
  if(L.q==null||L.q==='')return null;
  if(id&&isOpening(id,L))return {vq:0, vv:0, opening:true};
  var vq=n3(Number(L.q)-Number(L.sys||0));
  return {vq:vq, vv:n2(vq*Number(L.cost||0))};
}
function renderRun(){
  var t=takeById(session); if(!t){hideRun();return}
  var ids=Object.keys(t.lines), done=countedOf(t), locked=(t.status==='locked'||t.status==='approved');
  $('runTitle').textContent=t.ref+' - '+locName(t.loc)+' - '+fmtDay(t.date);
  $('runBar').style.width=(ids.length?Math.round(done/ids.length*100):0)+'%';
  var varN=0, varV=0;
  ids.forEach(function(k){var v=lineVariance(t.lines[k],k); if(v&&v.vq!==0){varN++;varV+=v.vv}});
  $('runText').innerHTML='<span><strong>'+done+' / '+ids.length+'</strong> counted</span>'+
    '<span>'+varN+' with a variance</span>'+
    (canSeeCost()?'<span>'+money(varV)+' value difference</span>':'')+
    '<span>'+takePill(t.status)+'</span>';

  var q=($('runSearch').value||'').toLowerCase().trim(), show=$('runShow').value;
  var rows=ids.map(function(k){return {id:k,it:item(k),L:t.lines[k]}})
    .filter(function(r){
      if(!r.it)return false;
      if(q&&(r.it.name+' '+(r.it.sku||'')).toLowerCase().indexOf(q)<0)return false;
      var counted=(r.L.q!=null&&r.L.q!=='');
      if(show==='todo'&&counted)return false;
      if(show==='done'&&!counted)return false;
      if(show==='var'){var v=lineVariance(r.L,r.id); if(!v||v.vq===0)return false}
      return true;
    }).sort(function(a,b){return a.it.name.localeCompare(b.it.name)});

  var h='';
  if(!rows.length)h='<div class="card empty">Nothing to show here.</div>';
  rows.slice(0,400).forEach(function(r){
    var L=r.L, counted=(L.q!=null&&L.q!==''), v=lineVariance(L,r.id);
    var cls='countrow'+(counted?(Number(L.q)===0?' zero':' done'):'');
    h+='<div class="'+cls+'" data-line="'+r.id+'">'+
       '<div class="crhead"><span class="nm">'+esc(r.it.name)+'</span>'+
         '<span class="faint" style="font-size:11.5px;font-family:var(--font-mono)">'+esc(r.it.sku||'')+'</span>'+
         (L.by||L.hm?'<span class="faint" style="font-size:11.5px">'+
            [L.hm,L.byName||roleName(L.by)].filter(Boolean).map(esc).join(' &middot; ')+'</span>':'')+
         (canSeeCost()?'<span class="sys">book '+n3(L.sys)+' '+esc(L.unit||'')+'</span>':'')+'</div>'+
       '<div class="qtyrow">'+
         (locked?'':'<button class="qbtn" data-minus="'+r.id+'" aria-label="Less">&minus;</button>')+
         '<input class="qty'+(counted?'':' blank')+'" data-qty="'+r.id+'" type="number" inputmode="decimal" '+
            'step="any" min="0" value="'+(counted?esc(L.q):'')+'" placeholder="not counted"'+(locked?' disabled':'')+'>'+
         '<span class="qunit">'+esc(L.unit||'')+'</span>'+
         (locked?'':'<button class="qbtn" data-plus="'+r.id+'" aria-label="More">+</button>')+
       '</div>'+
       '<div class="crfoot">'+
         (!v ? '<span class="faint" style="font-size:12px">blank means not counted yet</span>'
             : v.opening ? '<span class="pill grey">First count - opening stock</span>'
             : v.vq===0 ? '<span class="pill ok">Matches the book</span>'
             : '<span class="vardot '+(v.vq<0?'neg':'pos')+'">'+(v.vq>0?'+':'')+v.vq+' '+esc(L.unit||'')+'</span>')+
         (v&&v.vq!==0?' <span class="pill '+VAR_CLASS[varianceStatus(v.vq,L.sys,v.vv)]+'">'+
            VAR_TEXT[varianceStatus(v.vq,L.sys,v.vv)]+'</span>':'')+
         '<div class="spacer"></div>'+
         (L.photo?'<img class="thumb" src="'+L.photo+'" alt="" data-zoom="'+r.id+'">':
           (L.hadPhoto?'<span class="pill grey">photo released</span>':''))+
         (locked?'':'<button class="btn" data-photo="'+r.id+'">'+(L.photo?'Retake':'Photo')+'</button>')+
         (locked?'':'<button class="btn" data-zero="'+r.id+'">Zero</button>')+
         (locked?'':'<button class="btn" data-note="'+r.id+'">'+(L.note||L.vcom?'Note &check;':'Note')+'</button>')+
       '</div>'+
       (L.vcom?'<div class="note-box" style="margin:0">'+esc(L.vcom)+'</div>':'')+
       (L.note?'<div class="note-box" style="margin:0">'+esc(L.note)+'</div>':'')+
       '</div>';
  });
  $('runList').innerHTML=h;

  var f='';
  if(t.status==='in_progress'||t.status==='draft'){
    f='<div class="row"><span class="faint">Everything is saved as you go.</span><div class="spacer"></div>'+
      '<button class="btn primary" id="runSubmit">Submit for review</button></div>';
  }else if(t.status==='submitted'||t.status==='reviewed'){
    f=canManage()
      ? '<div class="row"><span class="faint">Approving writes the corrections into stock and locks this count.</span>'+
        '<div class="spacer"></div><button class="btn" id="runReopen">Send back</button>'+
        '<button class="btn primary" id="runApprove">Approve and lock</button></div>'
      : '<div class="note-box good">Submitted. An inventory admin reviews and approves it.</div>';
  }else{
    f='<div class="row"><span class="faint">Approved '+esc(stampText(t.approvedAt))+
      ' - locked.</span><div class="spacer"></div>'+
      (canManage()?'<button class="btn danger" id="runUnlock">Reopen with a reason</button>':'')+'</div>';
  }
  $('runFoot').innerHTML=f;
  wireRunFoot();
}

/* Counting one shelf at a time, the way the wastage page works: name it,
   count it, photograph it, next. Nothing has to exist in the item master
   first - an item typed here is created as it is counted, so a kitchen can
   start on day one with an empty master. */
function addCountSheet(){
  var t=takeById(session); if(!t)return;
  if(t.status==='locked'||t.status==='approved'){toast('This count is locked.');return}
  var names={}; activeItems().forEach(function(i){names[i.name]=i});
  var units={}; S.items.forEach(function(i){if(i.unit)units[i.unit]=1});
  ['kg','g','L','ml','pcs','bottle','box','tray','tin','packet','bag'].forEach(function(u){units[u]=1});
  var lastBy=''; try{lastBy=localStorage.getItem('sv-i-by')||''}catch(e){}

  sheet('<div class="sheet"><div class="sheet-head"><h3>Count an item</h3>'+
    '<div class="who">'+esc(locName(t.loc))+' &middot; '+esc(fmtDay(t.date))+'</div></div>'+
    '<div class="sheet-body">'+
    '<div><span class="lbl">Picture</span>'+
      '<div class="shot">'+
        '<button type="button" class="shot-btn" id="acShot">'+
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8.5A2.5 2.5 0 0 1 5.5 6h1.7l1.2-2h6.2l1.2 2h1.7A2.5 2.5 0 0 1 20 8.5v9A2.5 2.5 0 0 1 17.5 20h-11A2.5 2.5 0 0 1 4 17.5Z"/><circle cx="11.9" cy="13" r="3.6"/></svg>'+
          'Take a picture</button>'+
        '<div class="shot-prev" id="acPrev" hidden><img id="acImg" alt="">'+
          '<button type="button" class="shot-drop" id="acDrop" aria-label="Remove">&times;</button></div>'+
      '</div><div class="hint" id="acHint">Optional, but it settles most questions later.</div></div>'+
    '<div class="field"><label class="lbl" for="acItem">What did you count?</label>'+
      '<input class="f" id="acItem" list="acItemList" autocomplete="off" placeholder="Cooking oil, chicken thigh, rice&hellip;">'+
      '<datalist id="acItemList">'+Object.keys(names).sort().map(function(x){
        return '<option value="'+esc(x)+'">'}).join('')+'</datalist>'+
      '<div class="hint">If it is not on the list yet it will be added.</div></div>'+
    '<div class="grid2">'+
      '<div class="field"><label class="lbl" for="acQty">How many</label>'+
        '<input class="f num" id="acQty" type="number" inputmode="decimal" step="any" min="0" placeholder="0"></div>'+
      '<div class="field"><label class="lbl" for="acUnit">Unit</label>'+
        '<input class="f" id="acUnit" list="acUnitList" autocomplete="off" placeholder="bottle, kg&hellip;">'+
        '<datalist id="acUnitList">'+Object.keys(units).sort().map(function(u){
          return '<option value="'+esc(u)+'">'}).join('')+'</datalist></div>'+
    '</div>'+
    '<div class="field"><label class="lbl" for="acNote">Note</label>'+
      '<textarea class="f" id="acNote" placeholder="Anything the office should know"></textarea></div>'+
    '<div class="field"><label class="lbl" for="acBy">Your name</label>'+
      '<input class="f" id="acBy" autocomplete="off" value="'+esc(lastBy)+'" placeholder="Who counted this"></div>'+
    '<div id="acErr"></div>'+
    '</div><div class="sheet-foot"><button class="btn" id="acCancel">Cancel</button>'+
    '<button class="btn primary" id="acSave">Save and count another</button></div></div>');

  var shot=null;
  $('acShot').onclick=function(){ photoFor='__add'; $('photoFile').click() };
  window.__acPhoto=function(dataUrl){
    shot=dataUrl; $('acImg').src=dataUrl; $('acPrev').hidden=false;
    $('acHint').textContent='Picture ready ('+Math.round(dataUrl.length/1024)+' KB).';
  };
  $('acDrop').onclick=function(){shot=null;$('acPrev').hidden=true;$('acImg').removeAttribute('src');
    $('acHint').textContent='Optional, but it settles most questions later.'};
  $('acCancel').onclick=function(){window.__acPhoto=null;closeSheet()};
  $('acSave').onclick=function(){
    var name=$('acItem').value.trim();
    var qtyRaw=$('acQty').value.trim();
    if(!name){$('acErr').innerHTML='<div class="note-box bad">Say what you counted.</div>';return}
    if(qtyRaw===''){$('acErr').innerHTML='<div class="note-box bad">Put a number. If the shelf is empty write 0 - that is different from leaving it blank.</div>';return}
    var qty=Number(qtyRaw);
    if(!isFinite(qty)||qty<0){$('acErr').innerHTML='<div class="note-box bad">That quantity is not a number.</div>';return}
    var unit=$('acUnit').value.trim();
    var it=names[name];
    if(!it){
      it={id:uid('i'),name:name,unit:unit,active:true,cat:'',createdIn:t.ref};
      S.items.push(it);
      logIt('Item created while counting',name+(unit?' ('+unit+')':''));
    }else if(unit&&!it.unit){ it.unit=unit }
    var L=t.lines[it.id];
    if(!L){ L=t.lines[it.id]={sys:qtyOf(it.id,t.loc),cost:Number(it.cost||0),unit:it.unit||unit||''} }
    L.q=n3(qty);
    L.unit=it.unit||unit||L.unit||'';
    L.note=$('acNote').value.trim();
    L.by=role; L.byName=$('acBy').value.trim(); L.at=new Date().toISOString(); L.hm=nowHM();
    /* The count as a whole records who counted. A second name is added
       rather than replacing the first: two people often split the shelves. */
    if(L.byName){
      t.byNames=t.byNames||[];
      if(t.byNames.indexOf(L.byName)<0)t.byNames.push(L.byName);
    }
    if(shot)L.photo=shot;
    try{localStorage.setItem('sv-i-by',L.byName||'')}catch(e){}
    window.__acPhoto=null;
    closeSheet();
    saveState('Counted '+name+'.');
    render();
    setTimeout(addCountSheet,120);          /* straight on to the next one */
  };
  setTimeout(function(){$('acItem').focus()},60);
}

function setQty(id,val){
  var t=takeById(session); if(!t||t.status==='locked'||t.status==='approved')return;
  var L=t.lines[id]; if(!L)return;
  if(val===null||val===''){L.q=null}
  else{var n=Number(val); if(!isFinite(n)||n<0)return; L.q=n3(n)}
  L.by=role; L.at=new Date().toISOString();
  if(t.status==='draft')t.status='in_progress';
  scheduleSave();
  renderRun();
}
function bump(id,d){
  var t=takeById(session), L=t&&t.lines[id]; if(!L)return;
  var cur=(L.q==null||L.q==='')?0:Number(L.q);
  setQty(id,Math.max(0,n3(cur+d)));
}

/* Counting on a phone produces a lot of small changes. Saving each one
   would republish the page constantly, so they are batched. */
var saveTimer=null;
function scheduleSave(){
  clearTimeout(saveTimer);
  saveTimer=setTimeout(function(){ saveState(null,true) },2500);
}

function submitTake(){
  var t=takeById(session); if(!t)return;
  var ids=Object.keys(t.lines), missing=[], needPhoto=[], needComment=[];
  var photoRule=setg('photoRule','var'), commentRule=setg('commentRule','on');
  var manual=(t.mode==='manual');
  ids.forEach(function(k){
    var L=t.lines[k], it=item(k); if(!it)return;
    /* In list mode a blank line is an item nobody has been to yet. In
       one-by-one mode a line only exists because somebody counted it. */
    if(L.q==null||L.q===''){ if(!manual)missing.push(it.name); return }
    var v=lineVariance(L,k);
    if(photoRule==='all'&&!L.photo&&!L.hadPhoto)needPhoto.push(it.name);
    if(photoRule==='var'&&v&&v.vq!==0&&!L.photo&&!L.hadPhoto)needPhoto.push(it.name);
    if(commentRule==='on'&&v&&varianceStatus(v.vq,L.sys,v.vv)==='review'&&!L.vcom)needComment.push(it.name);
  });
  var problems=[];
  if(missing.length)problems.push({t:missing.length+' item'+(missing.length===1?'':'s')+' not counted',
    d:'Blank is not zero. Count them, or mark them Zero if the shelf is empty.',list:missing});
  if(needPhoto.length)problems.push({t:needPhoto.length+' need a photo',
    d:'Your settings require photographic evidence here.',list:needPhoto});
  if(needComment.length)problems.push({t:needComment.length+' need a comment',
    d:'The variance is above the review threshold.',list:needComment});

  if(manual&&!ids.length){
    toast('Nothing counted yet. Add an item first.',3500);
    return;
  }
  if(problems.length){
    sheet('<div class="sheet"><div class="sheet-head"><h3>Not ready to submit</h3>'+
      '<div class="who">'+esc(t.ref)+'</div></div><div class="sheet-body">'+
      problems.map(function(p){
        return '<div class="note-box bad" style="margin:0"><strong>'+esc(p.t)+'</strong><br>'+esc(p.d)+
          '<div style="margin-top:5px;font-size:12px">'+esc(p.list.slice(0,12).join(', '))+
          (p.list.length>12?' and '+(p.list.length-12)+' more':'')+'</div></div>';
      }).join('')+
      '</div><div class="sheet-foot"><button class="btn" id="pbClose">Back to counting</button></div></div>');
    $('pbClose').onclick=closeSheet;
    return;
  }
  var varQty=0,varVal=0,varN=0;
  ids.forEach(function(k){var v=lineVariance(t.lines[k],k); if(v){varQty+=v.vq;varVal+=v.vv;if(v.vq!==0)varN++}});
  t.status='submitted'; t.submittedAt=new Date().toISOString(); t.submittedBy=role;
  t.varQty=n3(varQty); t.varValue=n2(varVal); t.varLines=varN;
  logIt('Stock take submitted',t.ref+' - '+varN+' variances - '+money(varVal));
  saveState('Submitted for review.');
  renderRun();
}
function approveTake(){
  var t=takeById(session); if(!t||!canManage())return;
  var moves=0;
  Object.keys(t.lines).forEach(function(k){
    var L=t.lines[k], v=lineVariance(L,k);
    if(!v||(v.vq===0&&!v.opening))return;
    var opening=!!v.opening;
    S.moves.push({id:uid('m'),at:new Date().toISOString(),i:k,l:t.loc,
      q: opening ? n3(Number(L.q)) : v.vq,
      c: Number(L.cost||0), k2: opening?'opening':'count', src:t.ref, by:role,
      byName: L.byName||''});
    moves++;
  });
  _stockRev=-1;
  t.status='locked'; t.approvedAt=new Date().toISOString(); t.approvedBy=role;
  logIt('Stock take approved and locked',t.ref+' - '+moves+' corrections written - '+money(t.varValue||0));
  shedPhotos();
  saveState('Approved. Stock updated and the count is locked.');
  render();
}
function sendBack(){
  var t=takeById(session); if(!t||!canManage())return;
  t.status='in_progress';
  logIt('Stock take sent back',t.ref);
  saveState('Sent back for recounting.'); renderRun();
}
function reopenTake(){
  var t=takeById(session); if(!t||!canManage())return;
  var d=sheet('<div class="sheet"><div class="sheet-head"><h3>Reopen '+esc(t.ref)+'</h3>'+
    '<div class="who">The corrections already written into stock are reversed. Both the reason and the original figures stay in the audit log.</div></div>'+
    '<div class="sheet-body"><div class="field"><label class="lbl" for="roWhy">Reason</label>'+
    '<textarea class="f" id="roWhy" placeholder="Why is this being reopened?"></textarea></div></div>'+
    '<div class="sheet-foot"><button class="btn" id="roCancel">Cancel</button>'+
    '<button class="btn danger" id="roGo">Reopen</button></div></div>');
  $('roCancel').onclick=closeSheet;
  $('roGo').onclick=function(){
    var why=$('roWhy').value.trim();
    if(!why){toast('A reason is required.');return}
    S.moves=S.moves.filter(function(m){return m.src!==t.ref});
    _stockRev=-1;
    t.status='in_progress'; t.reopenReason=why; t.reopenedAt=new Date().toISOString();
    logIt('Stock take reopened',t.ref+' - '+why);
    closeSheet(); saveState('Reopened. The corrections it made have been reversed.'); render();
  };
}
function wireRunFoot(){
  var s=$('runSubmit'); if(s)s.onclick=submitTake;
  var a=$('runApprove'); if(a)a.onclick=approveTake;
  var b=$('runReopen'); if(b)b.onclick=sendBack;
  var u=$('runUnlock'); if(u)u.onclick=reopenTake;
}

/* ---------------------------- item master --------------------------- */
function itemSheet(existing){
  var it=existing||{id:uid('i'),active:true};
  var cats=(S.categories||[]);
  sheet('<div class="sheet"><div class="sheet-head"><h3>'+(existing?'Edit item':'Add item')+'</h3>'+
    '<div class="who">Only a name is required. Everything else can be filled in later.</div></div>'+
    '<div class="sheet-body">'+
    '<div class="grid2">'+
      '<div class="field"><label class="lbl" for="iName">Item name</label><input class="f" id="iName" value="'+esc(it.name||'')+'"></div>'+
      '<div class="field"><label class="lbl" for="iSku">SKU</label><input class="f" id="iSku" value="'+esc(it.sku||'')+'"></div>'+
    '</div>'+
    '<div class="grid2">'+
      '<div class="field"><label class="lbl" for="iCat">Category</label><select class="f" id="iCat">'+
        '<option value="">No category</option>'+cats.map(function(c){
          return '<option value="'+esc(c)+'"'+(c===it.cat?' selected':'')+'>'+esc(c)+'</option>'}).join('')+'</select></div>'+
      '<div class="field"><label class="lbl" for="iBrand">Brand</label><input class="f" id="iBrand" value="'+esc(it.brand||'')+'"></div>'+
    '</div>'+
    '<div class="grid3">'+
      '<div class="field"><label class="lbl" for="iUnit">Count unit</label><input class="f" id="iUnit" placeholder="kg, bottle, box" value="'+esc(it.unit||'')+'"></div>'+
      '<div class="field"><label class="lbl" for="iPUnit">Purchase unit</label><input class="f" id="iPUnit" placeholder="case" value="'+esc(it.punit||'')+'"></div>'+
      '<div class="field"><label class="lbl" for="iConv">Units per purchase unit</label><input class="f num" id="iConv" type="number" step="any" min="0" value="'+esc(it.conv==null?'':it.conv)+'"></div>'+
    '</div>'+
    '<div class="grid2">'+
      '<div class="field"><label class="lbl" for="iCost">Unit cost ('+esc(cur())+' per count unit)</label><input class="f num" id="iCost" type="number" step="0.01" min="0" value="'+esc(it.cost==null?'':it.cost)+'"></div>'+
      '<div class="field"><label class="lbl" for="iSupp">Supplier</label><input class="f" id="iSupp" value="'+esc(it.supplier||'')+'"></div>'+
    '</div>'+
    '<div class="grid3">'+
      '<div class="field"><label class="lbl" for="iMin">Minimum</label><input class="f num" id="iMin" type="number" step="any" min="0" value="'+esc(it.min==null?'':it.min)+'"></div>'+
      '<div class="field"><label class="lbl" for="iReo">Reorder at</label><input class="f num" id="iReo" type="number" step="any" min="0" value="'+esc(it.reorder==null?'':it.reorder)+'"></div>'+
      '<div class="field"><label class="lbl" for="iMax">Maximum</label><input class="f num" id="iMax" type="number" step="any" min="0" value="'+esc(it.max==null?'':it.max)+'"></div>'+
    '</div>'+
    '<div class="field"><label class="lbl" for="iNotes">Notes</label><textarea class="f" id="iNotes">'+esc(it.notes||'')+'</textarea></div>'+
    (existing?'<div class="row"><label class="row" style="gap:7px;font-size:13.5px"><input type="checkbox" id="iActive"'+
      (it.active!==false?' checked':'')+'> Active</label></div>':'')+
    '</div><div class="sheet-foot">'+
    (existing?'<button class="btn danger" id="iOpening">Set opening stock</button>':'')+
    '<div class="spacer"></div><button class="btn" id="iCancel">Cancel</button>'+
    '<button class="btn primary" id="iSave">Save</button></div></div>');
  $('iCancel').onclick=closeSheet;
  var op=$('iOpening'); if(op)op.onclick=function(){closeSheet();openingSheet(it)};
  $('iSave').onclick=function(){
    var name=$('iName').value.trim();
    if(!name){toast('The item needs a name.');return}
    var before=existing?JSON.stringify({n:it.name,c:it.cost,r:it.reorder}):null;
    it.name=name; it.sku=$('iSku').value.trim(); it.cat=$('iCat').value;
    it.brand=$('iBrand').value.trim(); it.unit=$('iUnit').value.trim();
    it.punit=$('iPUnit').value.trim(); it.conv=numOrNull($('iConv').value);
    it.cost=numOrNull($('iCost').value); it.supplier=$('iSupp').value.trim();
    it.min=numOrNull($('iMin').value); it.reorder=numOrNull($('iReo').value); it.max=numOrNull($('iMax').value);
    it.notes=$('iNotes').value.trim();
    if(existing)it.active=$('iActive').checked;
    if(!existing)S.items.push(it);
    logIt(existing?'Item edited':'Item added', it.name+(existing&&before!==JSON.stringify({n:it.name,c:it.cost,r:it.reorder})?' (was '+before+')':''));
    closeSheet(); saveState(existing?'Item saved.':'Item added.'); render();
  };
  setTimeout(function(){$('iName').focus()},60);
}
function numOrNull(v){v=String(v==null?'':v).trim();if(v==='')return null;var n=Number(v);return isFinite(n)?n:null}

function openingSheet(it){
  sheet('<div class="sheet"><div class="sheet-head"><h3>Opening stock</h3>'+
    '<div class="who">'+esc(it.name)+' &mdash; sets the starting quantity at each location. Recorded as an opening movement, not as a silent overwrite.</div></div>'+
    '<div class="sheet-body">'+locList().map(function(l){
      return '<div class="field"><label class="lbl" for="op_'+l.id+'">'+esc(l.name)+
        ' (now '+n3(qtyOf(it.id,l.id))+')</label>'+
        '<input class="f num" id="op_'+l.id+'" type="number" step="any" min="0" placeholder="leave empty to keep"></div>';
    }).join('')+'</div>'+
    '<div class="sheet-foot"><button class="btn" id="opCancel">Cancel</button>'+
    '<button class="btn primary" id="opSave">Save</button></div></div>');
  $('opCancel').onclick=closeSheet;
  $('opSave').onclick=function(){
    var n=0;
    locList().forEach(function(l){
      var v=numOrNull($('op_'+l.id).value); if(v===null)return;
      var diff=n3(v-qtyOf(it.id,l.id)); if(diff===0)return;
      S.moves.push({id:uid('m'),at:new Date().toISOString(),i:it.id,l:l.id,q:diff,
        c:Number(it.cost||0),k2:'opening',src:'manual',by:role});
      n++;
    });
    _stockRev=-1;
    if(n)logIt('Opening stock set',it.name+' at '+n+' location'+(n===1?'':'s'));
    closeSheet(); saveState(n?'Opening stock recorded.':'Nothing changed.'); render();
  };
}

/* ------------------------------ CSV --------------------------------- */
function parseCSV(text){
  var rows=[], row=[], cell='', q=false;
  for(var i=0;i<text.length;i++){
    var c=text[i];
    if(q){
      if(c==='"'){ if(text[i+1]==='"'){cell+='"';i++} else q=false }
      else cell+=c;
    }else{
      if(c==='"')q=true;
      else if(c===','){row.push(cell);cell=''}
      else if(c==='\n'){row.push(cell);rows.push(row);row=[];cell=''}
      else if(c!=='\r')cell+=c;
    }
  }
  if(cell!==''||row.length){row.push(cell);rows.push(row)}
  return rows.filter(function(r){return r.some(function(x){return String(x).trim()!==''})});
}
var CSV_FIELDS=[['sku','SKU'],['name','Item Name'],['cat','Category'],['brand','Brand'],
  ['supplier','Supplier'],['punit','Purchase Unit'],['unit','Count Unit'],['conv','Conversion Factor'],
  ['cost','Unit Cost'],['min','Minimum Stock Level'],['reorder','Reorder Level'],['max','Maximum Stock Level'],
  ['notes','Notes']];
function importSheet(text){
  var rows=parseCSV(text);
  if(rows.length<2){toast('That file has no rows.',3500);return}
  var head=rows[0].map(function(h){return h.trim().toLowerCase()});
  function col(){for(var i=0;i<arguments.length;i++){var k=head.indexOf(arguments[i]);if(k>=0)return k}return -1}
  var map={sku:col('sku','item id','item id / sku','code'),name:col('item name','name','item'),
    cat:col('category'),brand:col('brand'),supplier:col('supplier','preferred supplier'),
    punit:col('purchase unit'),unit:col('stock count unit','count unit','unit'),
    conv:col('conversion factor'),cost:col('unit cost','cost'),
    min:col('minimum stock level','min'),reorder:col('reorder level','reorder'),
    max:col('maximum stock level','max'),notes:col('notes')};
  if(map.name<0){toast('No "Item Name" column found.',4500);return}

  var ok=[],bad=[],dupFile=[],dupExisting=[],seen={};
  rows.slice(1).forEach(function(r,n){
    var g=function(k){return map[k]>=0?String(r[map[k]]==null?'':r[map[k]]).trim():''};
    var name=g('name');
    if(!name){bad.push({n:n+2,why:'no item name'});return}
    var sku=g('sku');
    var key=(sku||name).toLowerCase();
    if(seen[key]){dupFile.push({n:n+2,name:name});return}
    seen[key]=1;
    var exists=S.items.filter(function(i){
      return (sku&&i.sku&&i.sku.toLowerCase()===sku.toLowerCase())||i.name.toLowerCase()===name.toLowerCase()})[0];
    var rec={sku:sku,name:name,cat:g('cat'),brand:g('brand'),supplier:g('supplier'),
      punit:g('punit'),unit:g('unit'),conv:numOrNull(g('conv')),cost:numOrNull(g('cost')),
      min:numOrNull(g('min')),reorder:numOrNull(g('reorder')),max:numOrNull(g('max')),notes:g('notes')};
    var numsBad=['conv','cost','min','reorder','max'].filter(function(k){
      var raw=g(k); return raw!==''&&rec[k]===null});
    if(numsBad.length){bad.push({n:n+2,why:'"'+numsBad.join('", "')+'" is not a number',name:name});return}
    if(exists){dupExisting.push({rec:rec,existing:exists});return}
    ok.push(rec);
  });

  var newCats={};
  ok.concat(dupExisting.map(function(d){return d.rec})).forEach(function(r){
    if(r.cat&&(S.categories||[]).indexOf(r.cat)<0)newCats[r.cat]=1});

  sheet('<div class="sheet"><div class="sheet-head"><h3>Check before importing</h3>'+
    '<div class="who">Nothing is imported until you confirm.</div></div><div class="sheet-body">'+
    '<div class="tiles">'+
      tile('Ready',ok.length,'new items','good')+
      tile('Already here',dupExisting.length,'will be updated')+
      tile('Rejected',bad.length,'cannot be read',bad.length?'bad':'')+
      tile('Repeated in file',dupFile.length,'first one kept',dupFile.length?'warn':'')+
    '</div>'+
    (Object.keys(newCats).length?'<div class="note-box">New categories that will be created: <strong>'+
      esc(Object.keys(newCats).join(', '))+'</strong></div>':'')+
    (bad.length?'<div class="note-box bad"><strong>Rejected rows</strong><br>'+
      bad.slice(0,14).map(function(b){return 'Row '+b.n+(b.name?' ('+esc(b.name)+')':'')+' &mdash; '+esc(b.why)}).join('<br>')+
      (bad.length>14?'<br>and '+(bad.length-14)+' more':'')+'</div>':'')+
    (dupExisting.length?'<div class="note-box warn"><strong>Existing items</strong><br>'+
      esc(dupExisting.slice(0,12).map(function(d){return d.existing.name}).join(', '))+
      (dupExisting.length>12?' and '+(dupExisting.length-12)+' more':'')+
      '<br>Their details will be overwritten. Stock quantities are never touched by an import.</div>':'')+
    '</div><div class="sheet-foot"><button class="btn" id="csvCancel">Cancel</button>'+
    (ok.length+dupExisting.length?'<button class="btn primary" id="csvGo">Import '+
      (ok.length+dupExisting.length)+' item'+((ok.length+dupExisting.length)===1?'':'s')+'</button>':'')+
    '</div></div>');
  $('csvCancel').onclick=closeSheet;
  var go=$('csvGo');
  if(go)go.onclick=function(){
    if(!S.categories)S.categories=[];
    Object.keys(newCats).forEach(function(c){S.categories.push(c)});
    S.categories.sort();
    ok.forEach(function(r){S.items.push(Object.assign({id:uid('i'),active:true},r))});
    dupExisting.forEach(function(d){Object.assign(d.existing,d.rec)});
    logIt('Item master imported',ok.length+' added, '+dupExisting.length+' updated, '+bad.length+' rejected');
    closeSheet(); saveState('Imported '+(ok.length+dupExisting.length)+' items.'); render();
  };
}
function exportItems(){
  var head=CSV_FIELDS.map(function(f){return f[1]});
  var lines=[head.join(',')];
  S.items.forEach(function(it){
    lines.push(CSV_FIELDS.map(function(f){
      var v=it[f[0]]; v=(v==null?'':String(v));
      return /[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v;
    }).join(','));
  });
  var csv=lines.join('\n');
  sheet('<div class="sheet"><div class="sheet-head"><h3>Item master as CSV</h3>'+
    '<div class="who">'+S.items.length+' items. Select all and copy, then paste into Excel and use Text to Columns, or save as a .csv file.</div></div>'+
    '<div class="sheet-body"><textarea class="f" style="min-height:260px;font-family:var(--font-mono);font-size:11.5px" id="csvOut" readonly>'+
    esc(csv)+'</textarea>'+
    '<div class="note-box">A direct file download is deliberately not offered: turning it on would stop this page from being shareable by link, which matters more day to day.</div>'+
    '</div><div class="sheet-foot"><button class="btn primary" id="csvDone">Done</button></div></div>');
  $('csvDone').onclick=closeSheet;
  setTimeout(function(){var t=$('csvOut');t.focus();t.select()},80);
}

/* ------------------------------- save ------------------------------- */
function buildDocument(){
  var css=document.getElementById('appStyle').textContent;
  var app=document.getElementById('app').textContent;
  var json=JSON.stringify(S).replace(/</g,'\\u003c');
  return '<!doctype html><html lang="en"><head><meta charset="utf-8">'
    +'<meta name="viewport" content="width=device-width,initial-scale=1">'
    +'<title>Shan Village Inventory</title>'
    +'<link rel="preconnect" href="https://fonts.googleapis.com">'
    +'<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
    +'<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap">'
    +'<style id="appStyle">'+css+'</style></head><body><div id="root"></div>'
    +'<script id="state" type="application/json">'+json+'<\/script>'
    +'<script id="app">'+app+'<\/script></body></html>';
}
function goReadOnly(){
  readOnly=true;
  $('banner').innerHTML='<div class="note-box bad" style="margin-bottom:13px">This link can be read but not '+
    'written to, so nothing you change here can be saved. Ask the office for the link that allows editing.</div>';
  renderChrome();
}
async function saveState(msg,quiet){
  if(busy)return false;
  if(!api){goReadOnly();return false}
  busy=true;
  var prevPub=S.pub, prevRev=S.rev||0;
  S.pub=new Date().toISOString(); S.rev=prevRev+1;
  try{
    await api.publish(buildDocument());
    busy=false;
    if(msg)toast(msg,3000);
    return true;
  }catch(err){
    S.pub=prevPub; S.rev=prevRev; busy=false;
    var code=(err&&err.code)||'upstream_error';
    if(code==='not_writer'||code==='not_granted'||code==='not_declared'||code==='capability_disabled')goReadOnly();
    else if(code==='conflict')toast('Somebody saved first - loading their version.',4000);
    else if(code==='too_large')toast('The page is too large to save. Lower how long photos are kept in Settings.',6000);
    else if(code==='rate_limited'&&quiet){ scheduleSave(); }
    else if(!quiet)toast('That did not save. Check the connection and try again.',4500);
    return false;
  }
}

/* ------------------------------- tabs ------------------------------- */
var TABS=['count','stock','items','settings','audit','dash'];
function selectTab(id){
  tab=id.replace('tab-','');
  if((tab==='items'||tab==='settings'||tab==='audit')&&!canManage())tab='stock';
  if(tab==='count'&&!canCount())tab='stock';
  TABS.forEach(function(t){
    var b=$('tab-'+t), p=$('panel-'+t);
    if(!b||!p)return;
    var on=(t===tab);
    b.setAttribute('aria-selected',on?'true':'false');
    p.hidden=!on;
  });
  try{sessionStorage.setItem('sv-i-tab',tab)}catch(e){}
  if(tab==='dash')renderDash();
  if(tab==='stock')renderStock();
  if(tab==='count')session?renderRun():renderTakeHome();
  if(tab==='items')renderItems();
  if(tab==='settings')renderSettings();
  if(tab==='audit')renderAudit();
}

/* ------------------------------ events ------------------------------ */
function wire(){
  TABS.forEach(function(t){var b=$('tab-'+t);if(b)b.onclick=function(){selectTab('tab-'+t)}});
  $('lockBtn').onclick=lockClicked;
  $('locPick').onchange=function(){
    loc=this.value;
    try{sessionStorage.setItem('sv-i-loc',loc)}catch(e){}
    render();
  };
  ['stSearch','stCat','stStatus'].forEach(function(id){
    $(id).oninput=renderStock; $(id).onchange=renderStock;
  });
  $('stPrint').onclick=function(){window.print()};

  $('ctLoc').onchange=checkDuplicate; $('ctDate').onchange=checkDuplicate;
  modeHint();
  $('ctStart').onclick=startTake;
  $('runClose').onclick=function(){ clearTimeout(saveTimer); saveState(null,true); hideRun() };
  $('runAdd').onclick=addCountSheet;
  $('ctMode').onclick=function(ev){
    var b=ev.target.closest('[data-mode]'); if(!b)return;
    Array.prototype.forEach.call(this.querySelectorAll('.chip'),function(c){
      c.setAttribute('aria-pressed',c===b?'true':'false')});
    modeHint();
  };
  $('runSearch').oninput=renderRun; $('runShow').onchange=renderRun;

  $('imAdd').onclick=function(){itemSheet(null)};
  $('imImport').onclick=function(){$('csvFile').click()};
  $('imExport').onclick=exportItems;
  ['imSearch','imCat','imActive'].forEach(function(id){
    $(id).oninput=renderItems; $(id).onchange=renderItems;
  });
  $('csvFile').onchange=function(){
    var f=this.files&&this.files[0]; this.value='';
    if(!f)return;
    var r=new FileReader();
    r.onload=function(){importSheet(String(r.result||''))};
    r.onerror=function(){toast('That file could not be read.',4000)};
    r.readAsText(f);
  };
  $('photoFile').onchange=function(){
    var f=this.files&&this.files[0]; this.value='';
    if(!f||!photoFor)return;
    var id=photoFor; photoFor=null;
    if(id==='__add'){
      toast('Shrinking the picture…',1200);
      shrink(f,function(dataUrl,err){
        if(err){toast(err,4000);return}
        if(window.__acPhoto)window.__acPhoto(dataUrl);
      });
      return;
    }
    toast('Shrinking the picture…',1500);
    shrink(f,function(dataUrl,err){
      if(err){toast(err,4000);return}
      var t=takeById(session); if(!t||!t.lines[id])return;
      t.lines[id].photo=dataUrl; t.lines[id].photoAt=new Date().toISOString();
      scheduleSave(); renderRun();
      toast('Picture attached ('+Math.round(dataUrl.length/1024)+' KB).');
    });
  };

  $('addLoc').onclick=function(){
    var v=$('newLoc').value.trim(); if(!v)return;
    S.locations.push({id:uid('l'),code:v.toUpperCase().replace(/[^A-Z0-9]+/g,'_').slice(0,20),name:v,active:true});
    $('newLoc').value=''; logIt('Location added',v); saveState('Location added.'); render();
  };
  $('addCat').onclick=function(){
    var v=$('newCat').value.trim(); if(!v)return;
    if(!S.categories)S.categories=[];
    if(S.categories.indexOf(v)>=0){toast('That category already exists.');return}
    S.categories.push(v); S.categories.sort();
    $('newCat').value=''; logIt('Category added',v); saveState('Category added.'); render();
  };
  $('setSave').onclick=function(){
    if(!S.settings)S.settings={};
    S.settings.tolPct=numOrNull($('sTolPct').value); S.settings.tolQty=numOrNull($('sTolQty').value);
    S.settings.reviewPct=numOrNull($('sRevPct').value); S.settings.reviewValue=numOrNull($('sRevVal').value);
    S.settings.keepPhotos=numOrNull($('sKeep').value)||30;
    S.settings.photoRule=$('sPhoto').value; S.settings.commentRule=$('sComment').value;
    S.cur=$('sCur').value.trim()||'AED';
    logIt('Settings changed','tolerance '+S.settings.tolPct+'% / review '+S.settings.reviewPct+'% / photos '+S.settings.photoRule);
    shedPhotos(); saveState('Settings saved.'); render();
  };

  document.addEventListener('click',function(ev){
    var z=ev.target.closest('[data-zoom]');
    if(z){ var t=takeById(session), L=t&&t.lines[z.getAttribute('data-zoom')];
      if(L&&L.photo){var d=$('light');d.innerHTML='<img src="'+L.photo+'" alt="">';d.showModal();d.onclick=function(){d.close()}}
      return; }
    var m=ev.target.closest('[data-minus]'); if(m){bump(m.getAttribute('data-minus'),-1);return}
    var p=ev.target.closest('[data-plus]');  if(p){bump(p.getAttribute('data-plus'),1);return}
    var zr=ev.target.closest('[data-zero]'); if(zr){setQty(zr.getAttribute('data-zero'),0);return}
    var ph=ev.target.closest('[data-photo]'); if(ph){photoFor=ph.getAttribute('data-photo');$('photoFile').click();return}
    var nt=ev.target.closest('[data-note]'); if(nt){noteSheet(nt.getAttribute('data-note'));return}
    var ed=ev.target.closest('[data-edit]'); if(ed&&canManage()){itemSheet(item(ed.getAttribute('data-edit')));return}
    var op=ev.target.closest('[data-open]'); if(op){session=op.getAttribute('data-open');showRun();return}
    var lt=ev.target.closest('[data-loctoggle]');
    if(lt&&canManage()){
      var l=S.locations.filter(function(x){return x.id===lt.getAttribute('data-loctoggle')})[0];
      if(l){l.active=(l.active===false); logIt(l.active?'Location reactivated':'Location deactivated',l.name);
            saveState('Saved.'); render()}
      return;
    }
    var dc=ev.target.closest('[data-delcat]');
    if(dc&&canManage()){
      var c=dc.getAttribute('data-delcat');
      var used=S.items.filter(function(i){return i.cat===c}).length;
      if(used&&!confirm(used+' item'+(used===1?' is':'s are')+' in "'+c+'". Removing the category leaves them uncategorised. Continue?'))return;
      S.categories=S.categories.filter(function(x){return x!==c});
      S.items.forEach(function(i){if(i.cat===c)i.cat=''});
      logIt('Category removed',c); saveState('Category removed.'); render();
      return;
    }
  });
  document.addEventListener('change',function(ev){
    var q=ev.target.closest('[data-qty]');
    if(q){setQty(q.getAttribute('data-qty'),q.value===''?null:q.value)}
  });
}
function modeHint(){
  var m=countMode();
  $('ctCatWrap').hidden=(m!=='list');
  $('ctModeHint').textContent = m==='manual'
    ? 'Add each item as you count it, with a photo. Nothing needs to be set up first.'
    : 'Every active item becomes a line to fill in. Best once the item master is complete.';
}
function noteSheet(id){
  var t=takeById(session), L=t&&t.lines[id], it=item(id); if(!L||!it)return;
  var v=lineVariance(L,id), needs=v&&v.vq!==0&&varianceStatus(v.vq,L.sys,v.vv)==='review';
  sheet('<div class="sheet"><div class="sheet-head"><h3>'+esc(it.name)+'</h3>'+
    '<div class="who">'+(v?'Counted '+L.q+' against a book figure of '+n3(L.sys):'Not counted yet')+'</div></div>'+
    '<div class="sheet-body">'+
    (needs?'<div class="note-box warn">This variance is above the review threshold, so a comment is required before the count can be submitted.</div>':'')+
    '<div class="field"><label class="lbl" for="nVar">Why is it different?</label>'+
      '<textarea class="f" id="nVar">'+esc(L.vcom||'')+'</textarea></div>'+
    '<div class="field"><label class="lbl" for="nNote">Note</label>'+
      '<textarea class="f" id="nNote">'+esc(L.note||'')+'</textarea></div>'+
    '</div><div class="sheet-foot"><button class="btn" id="nCancel">Cancel</button>'+
    '<button class="btn primary" id="nSave">Save</button></div></div>');
  $('nCancel').onclick=closeSheet;
  $('nSave').onclick=function(){
    L.vcom=$('nVar').value.trim(); L.note=$('nNote').value.trim();
    closeSheet(); scheduleSave(); renderRun();
  };
}

/* ------------------------------- start ------------------------------ */
function boot(){
  document.getElementById('root').innerHTML=SHELL;
  try{var r0=sessionStorage.getItem('sv-i-role');
      if(r0==='owner'||r0==='admin'||r0==='chef'||r0==='staff')role=r0}catch(e){}
  try{var l0=sessionStorage.getItem('sv-i-loc');
      if(l0&&(l0==='ALL'||S.locations.some(function(x){return x.id===l0})))loc=l0}catch(e){}
  wire();
  $('ctDate').value=todayISO();
  refreshMode();
  var t0='count'; try{t0=sessionStorage.getItem('sv-i-tab')||'count'}catch(e){}
  selectTab('tab-'+t0);

  var reach=(window.claude&&typeof claude.use==='function')?claude.use('artifact'):Promise.resolve(null);
  reach.then(function(a){ api=a; if(!a)goReadOnly() }).catch(function(){goReadOnly()});

  /* A page nobody is working in catches up by itself. */
  var AUTO=900000, AWAY=300000, hiddenAt=0;
  function idle(){return !busy&&!session&&!canCount()}
  setInterval(function(){ if(idle()&&document.visibilityState==='visible')location.reload() },AUTO);
  document.addEventListener('visibilitychange',function(){
    if(document.visibilityState==='hidden'){hiddenAt=Date.now();return}
    var away=hiddenAt?Date.now()-hiddenAt:0; hiddenAt=0;
    if(away>AWAY&&idle())location.reload();
  });
  window.addEventListener('beforeunload',function(e){
    if(session&&saveTimer){e.preventDefault();e.returnValue=''}
  });
}
boot();
