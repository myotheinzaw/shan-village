(function(){
'use strict';

/* =====================================================================
   Shan Village Stock Count
   ---------------------------------------------------------------------
   One page, one link. A counter opens it on a phone in the store,
   unlocks with a code, and logs what is on the shelf. Everything the
   team types is written back into this page when Publish is pressed,
   so the next person to open the link sees the same list.

   State lives in the <script id="state"> JSON below. The page rebuilds
   itself from CSS + this script + that JSON in buildDocument().
   ===================================================================== */

var S = JSON.parse(document.getElementById('state').textContent);
var api=null, dl=null, apiReady=false;
var ROLES=['owner','admin','chef'];
var role=null, readOnly=true, dirty=false, publishing=false, pending=[];
var idleTimer=0;
var tab='stock', view='cards';
var f={q:'',loc:'All',stat:'All',cat:'All',sort:'new'};
var editing=null;          /* item id being edited, or null for a new one */
var draftPhoto=undefined;  /* undefined = untouched, null = cleared, string = new */

var LOCK_SALT_NS='|shan-village-inventory|';
var PHOTO_MAX=1000;        /* longest side, px */
var PHOTO_Q=0.55;
var SOFT_LIMIT=9*1024*1024, HARD_LIMIT=13*1024*1024;

var $=function(id){return document.getElementById(id)};
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){
  return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function pad(n){return n<10?'0'+n:''+n}
function todayISO(){var d=new Date();return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())}
function parseISO(s){var p=String(s||'').split('-');return new Date(+p[0],+p[1]-1,+p[2])}
function daysTo(iso){
  if(!iso)return null;
  var a=parseISO(todayISO()), b=parseISO(iso);
  return Math.round((b-a)/86400000);
}
function dnice(iso){
  if(!iso)return '';
  var d=parseISO(iso);
  if(isNaN(d))return iso;
  var M=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return d.getDate()+' '+M[d.getMonth()]+' '+d.getFullYear();
}
function stampText(iso){
  if(!iso)return 'Not published yet';
  var d=new Date(iso);
  if(isNaN(d))return 'Not published yet';
  return dnice(d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate()))+', '+pad(d.getHours())+':'+pad(d.getMinutes());
}
function num(v){var n=parseFloat(v);return isFinite(n)?n:0}
function fmtQty(n){
  if(!isFinite(n))return '0';
  return (Math.round(n*1000)/1000).toLocaleString('en-US',{maximumFractionDigits:3});
}
function money(n){
  return (Math.round(n*100)/100).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
}
function toast(msg,ms){
  var t=$('toast'); t.textContent=msg; t.hidden=false;
  clearTimeout(toast._t); toast._t=setTimeout(function(){t.hidden=true},ms||2600);
}

/* ------------------------------- items ------------------------------ */

function items(){ return S.items||(S.items=[]) }
function photoOf(id){ return (S.photos&&S.photos[id])||null }
function findItem(id){ var a=items(); for(var i=0;i<a.length;i++)if(a[i].id===id)return a[i]; return null }
function nextId(){ S.seq=(S.seq||0)+1; return 'I'+String(S.seq).padStart(4,'0') }

/* Expiry drives most of what the page shows, so it is computed in one
   place and nowhere else. */
function statusOf(it){
  if(it.cond==='Expired'||it.cond==='To discard')return 'expired';
  if(it.cond==='Damaged')return 'week';
  var d=daysTo(it.expiry);
  if(d===null)return 'ok';
  if(d<0)return 'expired';
  if(d<=7)return 'week';
  if(d<=30)return 'month';
  return 'ok';
}
function belowPar(it){ return num(it.par)>0 && num(it.qty)<num(it.par) }
function valueOf(it){ return num(it.qty)*num(it.cost) }
var STATUS_LABEL={expired:'Expired',week:'7 days',month:'30 days',ok:'Good'};
var STATUS_PILL={expired:'bad',week:'bad',month:'warn',ok:'good'};
function statusPill(it){
  var s=statusOf(it), d=daysTo(it.expiry), txt;
  if(s==='expired')txt = (d!==null&&d<0) ? 'Expired '+Math.abs(d)+'d ago' : (it.cond||'Expired');
  else if(s==='week')txt = it.cond==='Damaged' ? 'Damaged' : 'Expires in '+d+'d';
  else if(s==='month')txt = 'Expires in '+d+'d';
  else txt = it.expiry ? 'Expires '+dnice(it.expiry) : 'No expiry date';
  var cls = (s==='ok'&&!it.expiry) ? 'off' : STATUS_PILL[s];
  return '<span class="pill '+cls+'">'+esc(txt)+'</span>';
}

function filtered(){
  var q=f.q.trim().toLowerCase();
  var out=items().filter(function(it){
    if(f.loc!=='All'&&it.loc!==f.loc)return false;
    if(f.cat!=='All'&&it.cat!==f.cat)return false;
    if(f.stat==='Expired'&&statusOf(it)!=='expired')return false;
    if(f.stat==='Soon'){var s=statusOf(it); if(s!=='week'&&s!=='month')return false}
    if(f.stat==='Low'&&!belowPar(it))return false;
    if(f.stat==='Today'&&it.invDate!==todayISO())return false;
    if(q){
      var hay=[it.name,it.cat,it.loc,it.sub,it.remark,it.batch,it.supplier,it.by].join(' ').toLowerCase();
      if(hay.indexOf(q)<0)return false;
    }
    return true;
  });
  var rank={expired:0,week:1,month:2,ok:3};
  out.sort(function(a,b){
    if(f.sort==='name')return a.name.localeCompare(b.name);
    if(f.sort==='value')return valueOf(b)-valueOf(a);
    if(f.sort==='expiry'){
      var ra=rank[statusOf(a)],rb=rank[statusOf(b)];
      if(ra!==rb)return ra-rb;
      return String(a.expiry||'9999').localeCompare(String(b.expiry||'9999'));
    }
    return String(b.t||'').localeCompare(String(a.t||''));
  });
  return out;
}

function storageBytes(){
  try{ return new Blob([JSON.stringify(S)]).size }catch(e){ return JSON.stringify(S).length }
}

/* ------------------------------- shell ------------------------------ */

var LOGO = [
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
'<g clip-path="url(#hutClip)">',
'  <rect x="20" y="28" width="160" height="112" fill="#000"/>',
'  <rect x="20" y="38"  width="160" height="8" fill="#F0873A"/>',
'  <rect x="20" y="49"  width="160" height="8" fill="#E63329"/>',
'  <rect x="20" y="60"  width="160" height="8" fill="#F0873A"/>',
'  <rect x="20" y="71"  width="160" height="8" fill="#E63329"/>',
'  <rect x="20" y="82"  width="160" height="8" fill="#F0873A"/>',
'  <rect x="20" y="93"  width="160" height="8" fill="#E63329"/>',
'  <rect x="20" y="104" width="160" height="8" fill="#F0873A"/>',
'  <rect x="20" y="115" width="160" height="8" fill="#E63329"/>',
'  <rect x="20" y="126" width="160" height="8" fill="#F0873A"/>',
'</g>',
'<path d="M100 33 L173 99 L154 99 L154 134 L46 134 L46 99 L27 99 Z"',
'      fill="none" stroke="#E63329" stroke-width="3.4" stroke-linejoin="round"/>',
'<g clip-path="url(#discClip)">',
'  <rect x="8" y="148" width="184" height="9" fill="url(#goldFlat)"/>',
'  <rect x="8" y="161" width="184" height="9" fill="url(#goldFlat)"/>',
'  <rect x="8" y="174" width="184" height="9" fill="url(#goldFlat)"/>',
'  <rect x="8" y="187" width="184" height="9" fill="url(#goldFlat)"/>',
'</g>',
'<text font-family="Georgia,\'Times New Roman\',serif" font-size="27" font-weight="700"',
'      fill="url(#gold)" stroke="#4A3208" stroke-width=".5" letter-spacing="2.4">',
'  <textPath href="#arc" startOffset="50%" text-anchor="middle">SHAN VILLAGE</textPath>',
'</text>',
'<text x="100" y="120" font-family="Georgia,\'Times New Roman\',serif" font-size="78"',
'      font-style="italic" font-weight="700" text-anchor="middle"',
'      fill="url(#gold)" stroke="#FFF7E4" stroke-width="2.6" paint-order="stroke">SV</text></svg>'
].join('');

var IC_SUN='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.6v2.2M12 19.2v2.2M2.6 12h2.2M19.2 12h2.2M5.4 5.4l1.6 1.6M17 17l1.6 1.6M18.6 5.4L17 7M7 17l-1.6 1.6"/></svg>';
var IC_MOON='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.3A8.4 8.4 0 0 1 9.7 4a8.4 8.4 0 1 0 10.3 10.3z"/></svg>';
var IC_CAM='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8.5A1.5 1.5 0 0 1 4.5 7h2.2l1.2-2h8.2l1.2 2h2.2A1.5 1.5 0 0 1 21 8.5v9A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5z"/><circle cx="12" cy="13" r="3.6"/></svg>';
var IC_PLUS='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>';

var SHELL = [
'<header class="app-header">',
LOGO,
'<div><h1>Stock Count</h1><div class="sub">Shan Village &middot; Al Ghurair &amp; Al Quoz</div></div>',
'<div class="right">',
  '<div class="themer" role="group" aria-label="Light or dark">',
    '<button type="button" data-mode="light" title="Light" aria-label="Light">'+IC_SUN+'</button>',
    '<button type="button" data-mode="dark" title="Dark" aria-label="Dark">'+IC_MOON+'</button>',
    '<button type="button" data-mode="auto" title="Follow device" aria-label="Follow device">AUTO</button>',
  '</div>',
  '<button class="btn-lock" id="lockBtn" hidden></button>',
  '<div class="pubwrap">',
    '<div class="stamp" id="pubStamp"></div>',
    '<button class="btn-pub" id="pubBtn" hidden></button>',
  '</div>',
'</div></header>',

'<nav class="tabs" role="tablist" aria-label="Sections">',
  '<button type="button" role="tab" id="tab-stock">Stock</button>',
  '<button type="button" role="tab" id="tab-overview">Overview</button>',
  '<button type="button" role="tab" id="tab-export">Excel &amp; photos</button>',
  '<button type="button" role="tab" id="tab-setup" class="office-only">Setup</button>',
'</nav>',

'<main>',

/* ---- stock ---- */
'<section class="panel stack" id="panel-stock" role="tabpanel" aria-labelledby="tab-stock">',
  '<div class="note ro-only" id="roNote"></div>',
  '<div class="card card-pad filterbar">',
    '<div class="row fbtop">',
      '<input class="f" id="q" type="search" placeholder="Search item, remark, batch, supplier&hellip;">',
      '<select class="f" id="sortBy" aria-label="Sort the list">',
        '<option value="new">Newest first</option>',
        '<option value="expiry">Expiry first</option>',
        '<option value="name">Name A&ndash;Z</option>',
        '<option value="value">Highest value</option>',
      '</select>',
      '<div class="viewseg" role="group" aria-label="How to show the list">',
        '<button type="button" class="chip" id="vCards" aria-pressed="true">Cards</button>',
        '<button type="button" class="chip" id="vTable" aria-pressed="false">Table</button>',
      '</div>',
    '</div>',
    '<div class="chiprow" id="chipsLoc"></div>',
    '<div class="chiprow" id="chipsStat"></div>',
    '<div class="chiprow" id="chipsCat"></div>',
  '</div>',
  '<div class="row"><div class="muted" id="stockCount"></div></div>',
  '<div id="stockList"></div>',
'</section>',

/* ---- overview ---- */
'<section class="panel stack" id="panel-overview" role="tabpanel" aria-labelledby="tab-overview" hidden>',
  '<div class="tiles" id="ovTiles"></div>',
  '<div class="card">',
    '<div class="card-pad"><h2 class="sec">Needs attention</h2><p class="sec">Expired, expiring within 30 days, or below the minimum you set.</p></div>',
    '<div class="wrap" style="border:0;border-top:1px solid var(--border);border-radius:0;box-shadow:none"><table class="plain" id="actionTable"></table></div>',
  '</div>',
  '<div class="card card-pad stack"><h2 class="sec">Stock value by location</h2><div class="bars" id="barsLoc"></div></div>',
  '<div class="card card-pad stack"><h2 class="sec">Items by category</h2><div class="bars" id="barsCat"></div></div>',
'</section>',

/* ---- export ---- */
'<section class="panel stack" id="panel-export" role="tabpanel" aria-labelledby="tab-export" hidden>',
  '<div class="card card-pad stack">',
    '<div><h2 class="sec">Send the count to Excel</h2><p class="sec">A .csv file. Double-click it and Excel opens it with every column filled in.</p></div>',
    '<div class="row">',
      '<button type="button" class="btn primary" id="csvAll">Download full count</button>',
      '<button type="button" class="btn" id="csvAction">Download attention list</button>',
      '<button type="button" class="btn" id="copyTsv">Copy to clipboard</button>',
      '<a class="btn" id="driveLink" target="_blank" rel="noopener">Open the Drive folder</a>',
    '</div>',
    '<div class="note">The .csv belongs in the <strong>main</strong> Drive folder. Downloads land in your phone or computer’s Downloads folder first. <strong>Copy to clipboard</strong> is the backup: paste straight into an open sheet with Ctrl+V.</div>',
  '</div>',
  '<div class="card card-pad stack">',
    '<div><h2 class="sec">Photos</h2><p class="sec">Every photo taken during the count, saved one by one so you can put them in Drive.</p></div>',
    '<div class="row">',
      '<button type="button" class="btn primary" id="savePhotos">Save all photos</button>',
      '<a class="btn" id="drivePhotosLink" target="_blank" rel="noopener">Open the photos folder</a>',
    '</div>',
    '<div class="note" id="photoHow"></div>',
    '<div id="photoMeter"></div>',
  '</div>',
'</section>',

/* ---- setup ---- */
'<section class="panel stack" id="panel-setup" role="tabpanel" aria-labelledby="tab-setup" hidden>',
  '<div class="card card-pad stack">',
    '<div><h2 class="sec">Lock codes</h2><p class="sec">The same three codes as the duty roster. Chef can count stock. Owner and Admin can also delete items, change these lists and the Drive links, and read the change log.</p></div>',
    '<div class="row"><button type="button" class="btn" id="setCodes">Change lock codes</button></div>',
  '</div>',
  '<div class="card card-pad stack" id="drivesCard"></div>',
  '<div class="card card-pad stack" id="listsCard"></div>',
  '<div class="card">',
    '<div class="card-pad"><h2 class="sec">Change log</h2><p class="sec">Every publish, and what changed in it.</p></div>',
    '<div class="wrap" style="border:0;border-top:1px solid var(--border);border-radius:0;box-shadow:none"><table class="plain" id="logTable"></table></div>',
  '</div>',
'</section>',

'</main>',
'<button type="button" class="fab" id="fabAdd">'+IC_PLUS+'New item</button>',
'<dialog class="sheet wide" id="formSheet"></dialog>',
'<dialog class="sheet wide" id="detSheet"></dialog>',
'<dialog class="sheet" id="lockSheet"></dialog>',
'<div id="toast" hidden></div>'
].join('');
