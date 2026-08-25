/* =====================================================================
   Shan Village - Daily Wastage Report
   ---------------------------------------------------------------------
   One page, no server. Everything anyone submits lives in the page's own
   state and is written back by publishing a new version of the page, the
   same way the duty roster works.

   Two things follow from that and shape most of the code below:

   * A submit is a publish, and a publish is compare-and-set. When two
     cooks send at the same moment one of them loses with 'conflict' and
     the view is reloaded to the winner. Nothing may be lost that way, so
     an entry is stashed before the call and re-sent after the reload.
   * Photos live inside the page. A page has a size limit, so pictures are
     shrunk hard on the phone before they are ever stored, and old ones are
     let go while their entry - item, quantity, price, note - is kept.
   ===================================================================== */
var S = JSON.parse(document.getElementById('state').textContent);

var TZ='Asia/Dubai', TZ_LABEL='Abu Dhabi time';
var PHOTO_EDGE=720;              /* longest side kept, in pixels          */
var PHOTO_MAX=170000;            /* characters of data URI per photo      */
var STATE_BUDGET=8500000;        /* characters of state before we shed    */
var PENDING='sv-w-pending';      /* an entry in flight, across a reload   */

var api=null, role=null, readOnly=false, sending=false, tab='add';
var photo=null, idleTimer=null;

/* ------------------------------ time -------------------------------- */
/* Every date and time in this page is Abu Dhabi's, never the phone's:
   a cook whose handset is still on Yangon time must not file today's
   wastage under tomorrow. */
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
  var x=new Date(d+'T12:00:00Z');
  if(isNaN(x))return d;
  return x.toLocaleDateString('en-GB',{timeZone:'UTC',weekday:'short',day:'numeric',month:'short',year:'numeric'});
}
function dayName(d){
  var t=todayISO();
  if(d===t)return 'Today';
  var y=new Date(t+'T12:00:00Z'); y.setUTCDate(y.getUTCDate()-1);
  if(d===y.toISOString().slice(0,10))return 'Yesterday';
  return fmtDay(d);
}
function stampText(isoStr){
  if(!isoStr)return 'Nothing sent yet';
  var d=new Date(isoStr); if(isNaN(d))return 'Nothing sent yet';
  var o={timeZone:TZ,day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false};
  try{return d.toLocaleString('en-GB',o)}catch(e){delete o.timeZone;return d.toLocaleString('en-GB',o)}
}

/* ----------------------------- helpers ------------------------------ */
function $(id){return document.getElementById(id)}
function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(m){
  return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]})}
function uid(){return 'w'+Date.now().toString(36)+Math.random().toString(36).slice(2,7)}
function cur(){return S.cur||'AED'}
function money(n){
  if(n==null||n==='')return '';
  var v=Number(n); if(!isFinite(v))return '';
  return cur()+' '+v.toFixed(2);
}
function qtyText(e){
  if(e.qty==null||e.qty==='')return '';
  return (Math.round(Number(e.qty)*1000)/1000)+(e.unit?' '+e.unit:'');
}
function entriesOn(d){return S.entries.filter(function(e){return e.d===d})}
function sumCost(list){
  return list.reduce(function(n,e){var v=Number(e.price);return n+(isFinite(v)?v:0)},0);
}
function withCost(list){return list.filter(function(e){return isFinite(Number(e.price))&&e.price!==''&&e.price!=null})}
function days(){
  var seen={};
  S.entries.forEach(function(e){seen[e.d]=1});
  return Object.keys(seen).sort().reverse();
}
function toast(msg,ms){
  var t=document.createElement('div'); t.className='toast'; t.textContent=msg;
  document.body.appendChild(t);
  setTimeout(function(){t.remove()},ms||2600);
}

/* ---------------------------- lock codes ----------------------------
   Submitting needs no code: that is the whole point, a cook with the link
   can send a photo in fifteen seconds. A code is only needed to look back
   past today, to correct or remove somebody's entry, and to change the
   settings. The same three codes as the duty roster, so nobody carries a
   second set. Only salted hashes are stored here.
   -------------------------------------------------------------------- */
function cryptoOk(){return !!(window.crypto&&window.crypto.subtle&&window.crypto.getRandomValues)}
function hex(b){return Array.prototype.map.call(b,function(x){return ('0'+x.toString(16)).slice(-2)}).join('')}
function randSalt(){var a=new Uint8Array(8);crypto.getRandomValues(a);return hex(a)}
async function codeHash(code,salt){
  var d=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(salt+'|shan-village|'+String(code)));
  return hex(new Uint8Array(d));
}
function getLocks(){return S.locks||null}
function hasLocks(){var l=getLocks();return !!(l&&(l.owner||l.admin||l.chef))}
function isOffice(){return role!==null}
function roleName(r){return r==='chef'?'Chef':(r==='admin'?'Admin':(r==='owner'?'Owner':''))}

function refreshMode(){
  document.body.classList.toggle('is-office',isOffice());
  ['tab-history','tab-settings'].forEach(function(id){
    var b=$(id); if(b)b.hidden=!isOffice();
  });
  if(!isOffice()&&(tab==='history'||tab==='settings'))selectTab('tab-add');
  var b=$('lockBtn');
  var shut='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><rect x="4" y="10.5" width="16" height="10.5" rx="2"/><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5"/></svg>';
  var open='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><rect x="4" y="10.5" width="16" height="10.5" rx="2"/><path d="M8 10.5V7a4 4 0 0 1 7.8-1.3"/></svg>';
  if(!isOffice()){b.className='btn-lock';b.innerHTML=shut+'Office'}
  else{b.className='btn-lock open';b.innerHTML=open+roleName(role)+' - lock'}
  render();
}
function lockNow(quiet){
  role=null; clearTimeout(idleTimer);
  try{sessionStorage.removeItem('sv-w-role')}catch(e){}
  refreshMode(); if(!quiet)toast('Locked.');
}
function unlockAs(r){
  role=r;
  try{sessionStorage.setItem('sv-w-role',r)}catch(e){}
  armIdle(); refreshMode();
  toast('Open as '+roleName(r)+'.');
}
function armIdle(){
  clearTimeout(idleTimer);
  if(!isOffice())return;
  idleTimer=setTimeout(function(){ if(isOffice()){lockNow(true);toast('Locked again after 15 minutes.',4000)} },900000);
}
['pointerdown','keydown'].forEach(function(ev){
  document.addEventListener(ev,function(){ if(isOffice())armIdle() },{passive:true});
});

function sheet(html){var d=$('sheet');d.innerHTML=html;d.showModal();return d}
function askUnlock(){
  if(!cryptoOk()){toast('This browser cannot check the code.',4000);return}
  var d=sheet('<div class="sheet"><div class="sheet-head"><h3>Office access</h3>'+
    '<div class="who">Owner, admin or chef code. Staff do not need one to send wastage.</div></div>'+
    '<div class="sheet-body"><div id="lkErr"></div>'+
    '<div><label class="lbl" for="lkCode">Code</label>'+
    '<input class="f pin" id="lkCode" type="password" autocomplete="off"></div></div>'+
    '<div class="sheet-foot"><button class="btn" id="lkCancel">Cancel</button>'+
    '<button class="btn" id="lkGo" style="border-color:var(--accent);color:var(--accent)">Open</button></div></div>');
  var go=async function(){
    var v=$('lkCode').value; if(!v)return;
    var l=getLocks()||{}, m=null;
    if(l.owner&&await codeHash(v,l.owner.salt)===l.owner.hash)m='owner';
    else if(l.admin&&await codeHash(v,l.admin.salt)===l.admin.hash)m='admin';
    else if(l.chef&&await codeHash(v,l.chef.salt)===l.chef.hash)m='chef';
    if(m){d.close();unlockAs(m)}
    else{
      $('lkErr').innerHTML='<div class="note-box bad">That code is not right.</div>';
      $('lkCode').value=''; $('lkCode').focus();
    }
  };
  $('lkGo').onclick=go;
  $('lkCancel').onclick=function(){d.close()};
  $('lkCode').onkeydown=function(e){if(e.key==='Enter'){e.preventDefault();go()}};
  setTimeout(function(){$('lkCode').focus()},60);
}
function lockClicked(){ isOffice()?lockNow():askUnlock() }

/* ------------------------------ photos ------------------------------
   A phone camera hands over three to five megabytes. That cannot go into
   a page that is republished on every submit, so the picture is redrawn
   on a canvas at a size that is still clear enough to see what was thrown
   away, and the quality is stepped down until it fits the budget. The
   original never leaves the phone.
   -------------------------------------------------------------------- */
function shrink(file,cb){
  if(!file||!/^image\//.test(file.type||'')){cb(null,'That file is not a picture.');return}
  var url=URL.createObjectURL(file), img=new Image();
  img.onload=function(){
    try{
      var w=img.naturalWidth||img.width, h=img.naturalHeight||img.height;
      var s=Math.min(1,PHOTO_EDGE/Math.max(w,h));
      var c=document.createElement('canvas');
      c.width=Math.max(1,Math.round(w*s)); c.height=Math.max(1,Math.round(h*s));
      var ctx=c.getContext('2d');
      ctx.fillStyle='#fff'; ctx.fillRect(0,0,c.width,c.height);   /* no black behind transparency */
      ctx.drawImage(img,0,0,c.width,c.height);
      var q=0.55, out=c.toDataURL('image/jpeg',q);
      while(out.length>PHOTO_MAX&&q>0.24){q=Math.round((q-0.08)*100)/100;out=c.toDataURL('image/jpeg',q)}
      URL.revokeObjectURL(url);
      if(out.length>PHOTO_MAX){cb(null,'That picture is too large even after shrinking. Try again with less detail.');return}
      cb(out,null);
    }catch(err){URL.revokeObjectURL(url);cb(null,'The picture could not be read.')}
  };
  img.onerror=function(){URL.revokeObjectURL(url);cb(null,'The picture could not be read.')};
  img.src=url;
}

/* Photos are the only thing here that grows without limit. Entries are
   kept for good; their pictures are let go once they are older than the
   office asked for, and again - regardless of age - if the page is close
   to the size the platform will accept. The row, the cost and the note
   all survive; only the image goes. */
function keepDays(){var n=Number(S.keep);return (isFinite(n)&&n>0)?n:21}
function shedPhotos(){
  var cut=new Date(todayISO()+'T12:00:00Z');
  cut.setUTCDate(cut.getUTCDate()-keepDays());
  var cutISO=cut.toISOString().slice(0,10), dropped=0;
  S.entries.forEach(function(e){ if(e.photo&&e.d<cutISO){delete e.photo;e.hadPhoto=1;dropped++} });
  var older=S.entries.filter(function(e){return e.photo}).sort(function(a,b){return a.at<b.at?-1:1});
  while(JSON.stringify(S).length>STATE_BUDGET&&older.length){
    var e=older.shift(); delete e.photo; e.hadPhoto=1; dropped++;
  }
  return dropped;
}

/* ------------------------------- shell ------------------------------- */
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
'  <div>',
'    <h1>Daily Wastage</h1>',
'    <div class="sub">Shan Village</div>',
'  </div>',
'  <div class="right">',
'    <div class="themer" role="group" aria-label="Appearance">',
'      <button id="thLight" title="Light" aria-pressed="false"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4.2"/><path d="M12 2v2.4M12 19.6V22M2 12h2.4M19.6 12H22M4.9 4.9l1.7 1.7M17.4 17.4l1.7 1.7M19.1 4.9l-1.7 1.7M6.6 17.4l-1.7 1.7"/></svg></button>',
'      <button id="thAuto" title="Match device" aria-pressed="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="2.8" y="4.5" width="18.4" height="12.5" rx="2"/><path d="M8.5 20.5h7"/></svg></button>',
'      <button id="thDark" title="Dark" aria-pressed="false"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.2A8.4 8.4 0 0 1 9.8 4 8.4 8.4 0 1 0 20 14.2Z"/></svg></button>',
'    </div>',
'    <button class="btn-refresh" id="refreshBtn" title="Fetch the newest report">',
'      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 5v6h-6"/></svg>Refresh</button>',
'    <button class="btn-lock" id="lockBtn"></button>',
'    <div class="stamp" id="stamp"></div>',
'  </div>',
'</header>',
'<nav class="tabs" role="tablist" aria-label="Sections">',
'  <button role="tab" id="tab-add" aria-controls="panel-add" aria-selected="true">Add wastage</button>',
'  <button role="tab" id="tab-today" aria-controls="panel-today" aria-selected="false">Today</button>',
'  <button role="tab" id="tab-history" aria-controls="panel-history" aria-selected="false" hidden>History</button>',
'  <button role="tab" id="tab-settings" aria-controls="panel-settings" aria-selected="false" hidden>Settings</button>',
'</nav>',
'<main>',

/* ---- add ---- */
'  <section class="panel" id="panel-add" role="tabpanel" aria-labelledby="tab-add">',
'    <div id="sendState"></div>',
'    <div class="card card-pad" style="display:flex;flex-direction:column;gap:15px">',
'      <div>',
'        <span class="lbl">Picture</span>',
'        <div class="shot">',
'          <button type="button" class="shot-btn" id="shotBtn">',
'            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8.5A2.5 2.5 0 0 1 5.5 6h1.7l1.2-2h6.2l1.2 2h1.7A2.5 2.5 0 0 1 20 8.5v9A2.5 2.5 0 0 1 17.5 20h-11A2.5 2.5 0 0 1 4 17.5Z"/><circle cx="11.9" cy="13" r="3.6"/></svg>',
'            Take a picture',
'          </button>',
'          <div class="shot-prev" id="shotPrev" hidden>',
'            <img id="shotImg" alt="The wastage you photographed">',
'            <button type="button" class="shot-drop" id="shotDrop" aria-label="Remove the picture">&times;</button>',
'          </div>',
'        </div>',
'        <input type="file" id="shotFile" accept="image/*" capture="environment" hidden>',
'        <div class="hint" id="shotHint">Optional, but a picture settles most questions later.</div>',
'      </div>',
'      <div class="field">',
'        <label class="lbl" for="fItem">What was wasted</label>',
'        <input class="f" id="fItem" list="itemList" placeholder="Chicken thigh, tom yum paste, jasmine rice&hellip;" autocomplete="off">',
'        <datalist id="itemList"></datalist>',
'      </div>',
'      <div class="grid3">',
'        <div class="field"><label class="lbl" for="fQty">Quantity</label>',
'          <input class="f num" id="fQty" type="number" inputmode="decimal" step="0.001" min="0" placeholder="0"></div>',
'        <div class="field"><label class="lbl" for="fUnit">Unit</label>',
'          <select class="f" id="fUnit"></select></div>',
'        <div class="field"><label class="lbl" for="fPrice">Value if known</label>',
'          <input class="f num" id="fPrice" type="number" inputmode="decimal" step="0.01" min="0" placeholder="leave empty"></div>',
'      </div>',
'      <div>',
'        <span class="lbl">Why</span>',
'        <div class="chips" id="reasonChips"></div>',
'      </div>',
'      <div class="field">',
'        <label class="lbl" for="fNote">Note</label>',
'        <textarea class="f" id="fNote" placeholder="Anything the office should know"></textarea>',
'      </div>',
'      <div class="grid3">',
'        <div class="field span2"><label class="lbl" for="fBy">Your name</label>',
'          <input class="f" id="fBy" list="byList" autocomplete="off" placeholder="Who is sending this">',
'          <datalist id="byList"></datalist></div>',
'        <div class="field"><label class="lbl" for="fDate">Date</label>',
'          <input class="f" id="fDate" type="date"></div>',
'        <div class="field"><label class="lbl" for="fTime">Time</label>',
'          <input class="f" id="fTime" type="time"></div>',
'      </div>',
'      <div class="hint" id="whenHint"></div>',
'      <button class="btn-send" id="sendBtn">Send wastage</button>',
'    </div>',
'  </section>',

/* ---- today ---- */
'  <section class="panel" id="panel-today" role="tabpanel" aria-labelledby="tab-today" hidden>',
'    <div class="tiles" id="todayTiles"></div>',
'    <div class="row no-print"><h2 class="sec" id="todayHead">Today</h2><div class="spacer"></div>',
'      <button class="btn" id="printToday">Print</button></div>',
'    <div id="todayList"></div>',
'  </section>',

/* ---- history ---- */
'  <section class="panel" id="panel-history" role="tabpanel" aria-labelledby="tab-history" hidden>',
'    <div class="tiles" id="histTiles"></div>',
'    <div class="row no-print"><label class="lbl" for="histFrom" style="margin:0">From</label>',
'      <input class="f" id="histFrom" type="date" style="width:auto">',
'      <label class="lbl" for="histTo" style="margin:0">to</label>',
'      <input class="f" id="histTo" type="date" style="width:auto">',
'      <div class="spacer"></div><button class="btn" id="printHist">Print</button></div>',
'    <div id="histList"></div>',
'  </section>',

/* ---- settings ---- */
'  <section class="panel" id="panel-settings" role="tabpanel" aria-labelledby="tab-settings" hidden>',
'    <div class="card card-pad" style="display:flex;flex-direction:column;gap:14px">',
'      <div><h2 class="sec">Settings</h2><p class="sec">These are policy, not fixed rules - set them to match how Shan Village works.</p></div>',
'      <div class="grid2">',
'        <div class="field"><label class="lbl" for="setCur">Currency</label>',
'          <input class="f" id="setCur" maxlength="6"></div>',
'        <div class="field"><label class="lbl" for="setKeep">Keep pictures for</label>',
'          <input class="f num" id="setKeep" type="number" min="1" max="365" step="1"></div>',
'      </div>',
'      <div class="hint">Entries are kept for good. Only the pictures are let go after that many days, so the page stays small enough to send.</div>',
'      <div class="field"><label class="lbl" for="setReasons">Reasons offered</label>',
'        <textarea class="f" id="setReasons" style="min-height:120px"></textarea>',
'        <div class="hint">One per line, in the order they should appear.</div></div>',
'      <div class="field"><label class="lbl" for="setUnits">Units offered</label>',
'        <input class="f" id="setUnits">',
'        <div class="hint">Separated by commas.</div></div>',
'      <button class="btn" id="setSave" style="align-self:flex-start;border-color:var(--accent);color:var(--accent)">Save settings</button>',
'    </div>',
'    <div class="card card-pad">',
'      <h2 class="sec">How this page works</h2>',
'      <p class="sec" style="margin-top:6px">Anyone with the link can send wastage - no code, nothing to install. Today is open to everyone so the kitchen can see what has already been sent and avoid entering it twice. History, corrections and these settings need the owner, admin or chef code.</p>',
'      <p class="sec" style="margin-top:8px">Every entry is written into the page itself the moment it is sent, and the daily report in Google Drive is built from exactly what you see here.</p>',
'    </div>',
'  </section>',
'</main>',
'<dialog id="sheet"></dialog>',
'<dialog id="light" class="lightbox"></dialog>'
].join('');

/* ------------------------------ render ------------------------------- */
function tile(k,v,n,cls){
  return '<div class="tile'+(cls?' '+cls:'')+'"><div class="k">'+esc(k)+'</div>'+
    '<div class="v">'+esc(v)+'</div><div class="n">'+esc(n||'')+'</div></div>';
}
function entryHtml(e){
  var img=e.photo?'<img src="'+e.photo+'" alt="'+esc(e.item||'Wastage')+'" data-zoom="'+e.id+'">'
        :(e.hadPhoto?'<div class="pill" style="width:62px;height:62px;display:flex;align-items:center;justify-content:center;text-align:center;line-height:1.2">photo<br>gone</div>':'');
  var m=money(e.price);
  return '<div class="entry" data-entry="'+e.id+'">'+img+
    '<div class="body">'+
      '<div class="top"><span class="item">'+esc(e.item||'(not named)')+'</span>'+
        (qtyText(e)?'<span class="qty">'+esc(qtyText(e))+'</span>':'')+
        (m?'<span class="money">'+esc(m)+'</span>':'')+
      '</div>'+
      '<div class="meta">'+esc(e.t||'')+' &middot; '+esc(e.by||'not named')+
        (e.reason?' &middot; <span class="pill">'+esc(e.reason)+'</span>':'')+'</div>'+
      (e.note?'<div class="note">'+esc(e.note)+'</div>':'')+
      (isOffice()?'<div class="row no-print" style="margin-top:8px;gap:7px">'+
        '<button class="btn" data-edit="'+e.id+'" style="padding:5px 11px;font-size:12.5px">Correct</button>'+
        '<button class="btn danger" data-del="'+e.id+'" style="padding:5px 11px;font-size:12.5px">Remove</button></div>':'')+
    '</div></div>';
}
function listHtml(list,groupByDay){
  if(!list.length)return '<div class="card empty">Nothing recorded.</div>';
  if(!groupByDay)return '<div class="daygroup">'+list.map(entryHtml).join('')+'</div>';
  var byDay={};
  list.forEach(function(e){(byDay[e.d]=byDay[e.d]||[]).push(e)});
  return Object.keys(byDay).sort().reverse().map(function(d){
    var rows=byDay[d], c=sumCost(rows), priced=withCost(rows).length;
    return '<div class="daygroup" style="margin-bottom:18px">'+
      '<div class="dayhead"><h3>'+esc(dayName(d))+'</h3>'+
      '<span class="faint" style="font-size:12px">'+esc(fmtDay(d))+'</span>'+
      '<span class="n">'+rows.length+' item'+(rows.length>1?'s':'')+
        (priced?' &middot; '+esc(money(c)):'')+'</span></div>'+
      rows.map(entryHtml).join('')+'</div>';
  }).join('');
}
function sortEntries(list){
  return list.slice().sort(function(a,b){
    if(a.d!==b.d)return a.d<b.d?1:-1;
    return (a.t||'')<(b.t||'')?1:-1;
  });
}

function renderToday(){
  var d=todayISO(), rows=sortEntries(entriesOn(d)), priced=withCost(rows);
  $('todayHead').textContent='Today - '+fmtDay(d);
  var qtyBits={};
  rows.forEach(function(e){
    if(e.qty==null||e.qty===''||!e.unit)return;
    qtyBits[e.unit]=(qtyBits[e.unit]||0)+Number(e.qty);
  });
  var qtyText2=Object.keys(qtyBits).sort().map(function(u){
    return (Math.round(qtyBits[u]*1000)/1000)+' '+u}).join(' &middot; ');
  $('todayTiles').innerHTML=
    tile('Entries',rows.length,'sent today')+
    tile('Value',priced.length?money(sumCost(rows)):'-',
         priced.length?priced.length+' of '+rows.length+' priced':'no prices entered','money')+
    tile('With a picture',rows.filter(function(e){return e.photo}).length,'of '+rows.length)+
    '<div class="tile"><div class="k">Quantity</div><div class="v" style="font-size:15px;line-height:1.35">'+
      (qtyText2||'-')+'</div><div class="n">by unit</div></div>';
  $('todayList').innerHTML=listHtml(rows,false);
}

function histRange(){
  var f=$('histFrom').value, t=$('histTo').value;
  var all=S.entries.slice();
  if(f)all=all.filter(function(e){return e.d>=f});
  if(t)all=all.filter(function(e){return e.d<=t});
  return sortEntries(all);
}
function renderHistory(){
  if(!isOffice())return;
  var rows=histRange(), priced=withCost(rows);
  var dayCount={}; rows.forEach(function(e){dayCount[e.d]=1});
  var nDays=Object.keys(dayCount).length;
  $('histTiles').innerHTML=
    tile('Entries',rows.length,nDays+' day'+(nDays===1?'':'s'))+
    tile('Value',priced.length?money(sumCost(rows)):'-',
         priced.length?priced.length+' priced':'no prices','money')+
    tile('Busiest day',(function(){
      var by={}; rows.forEach(function(e){by[e.d]=(by[e.d]||0)+1});
      var k=Object.keys(by).sort(function(a,b){return by[b]-by[a]})[0];
      return k?dayName(k):'-';
    })(),'most entries')+
    tile('Average a day',nDays?(Math.round(rows.length/nDays*10)/10):'-','entries');
  $('histList').innerHTML=listHtml(rows,true);
}

function renderStamp(){
  $('stamp').innerHTML='<strong>'+esc(stampText(S.pub))+'</strong>'+
    (readOnly?'View only':'Live - '+TZ_LABEL);
}
function renderForm(){
  var units=S.units||[];
  var sel=$('fUnit'), keep=sel.value;
  sel.innerHTML='<option value=""></option>'+units.map(function(u){
    return '<option value="'+esc(u)+'">'+esc(u)+'</option>'}).join('');
  if(keep)sel.value=keep;
  var chosen=$('reasonChips').getAttribute('data-value')||'';
  $('reasonChips').innerHTML=(S.reasons||[]).map(function(r){
    return '<button type="button" class="chip" data-reason="'+esc(r)+'" aria-pressed="'+(r===chosen?'true':'false')+'">'+esc(r)+'</button>';
  }).join('');
  var items={}, names={};
  S.entries.forEach(function(e){ if(e.item)items[e.item]=1; if(e.by)names[e.by]=1 });
  $('itemList').innerHTML=Object.keys(items).sort().map(function(i){return '<option value="'+esc(i)+'">'}).join('');
  $('byList').innerHTML=Object.keys(names).sort().map(function(i){return '<option value="'+esc(i)+'">'}).join('');
  $('whenHint').textContent='Date and time are today in '+TZ_LABEL+'. Change them if you are recording something from earlier.';
}
function renderSettings(){
  if(!isOffice())return;
  $('setCur').value=cur();
  $('setKeep').value=keepDays();
  $('setReasons').value=(S.reasons||[]).join('\n');
  $('setUnits').value=(S.units||[]).join(', ');
}
function render(){
  renderStamp(); renderForm(); renderToday();
  if(isOffice()){renderHistory();renderSettings()}
}

/* ------------------------------- send -------------------------------- */
function buildDocument(){
  var css=document.getElementById('appStyle').textContent;
  var app=document.getElementById('app').textContent;
  var json=JSON.stringify(S).replace(/</g,'\\u003c');
  return '<!doctype html><html lang="en"><head><meta charset="utf-8">'
    +'<meta name="viewport" content="width=device-width,initial-scale=1">'
    +'<title>Shan Village Daily Wastage</title>'
    +'<link rel="preconnect" href="https://fonts.googleapis.com">'
    +'<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
    +'<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap">'
    +'<style id="appStyle">'+css+'</style></head><body><div id="root"></div>'
    +'<script id="state" type="application/json">'+json+'<\/script>'
    +'<script id="app">'+app+'<\/script></body></html>';
}

function goReadOnly(){
  readOnly=true;
  $('sendState').innerHTML='<div class="note-box bad">This link can be read but not written to, so nothing you send here can reach the office. '+
    'Ask for the link that allows sending.</div>';
  renderStamp();
}

/* A submit is a publish, and a publish can lose a race. Stash first, send
   second: if the page is reloaded to somebody else's version the entry is
   still on this phone and goes out again on the next load. */
function stash(entry,tries){
  try{sessionStorage.setItem(PENDING,JSON.stringify({e:entry,tries:tries||1}))}catch(err){}
}
function unstash(){
  try{var raw=sessionStorage.getItem(PENDING);return raw?JSON.parse(raw):null}catch(err){return null}
}
function clearStash(){try{sessionStorage.removeItem(PENDING)}catch(err){}}

async function pushEntry(entry,tries){
  if(sending)return false;
  if(!api){goReadOnly();return false}
  sending=true; $('sendBtn').disabled=true; $('sendBtn').textContent='Sending…';
  stash(entry,tries||1);
  S.entries.unshift(entry);
  var dropped=shedPhotos();
  var prevPub=S.pub, prevRev=S.rev||0;
  S.pub=new Date().toISOString(); S.rev=prevRev+1;
  try{
    await api.publish(buildDocument());
    clearStash();
    sending=false;
    toast('Sent. Thank you.'+(dropped?' Older pictures were cleared to make room.':''),3200);
    return true;
  }catch(err){
    S.entries=S.entries.filter(function(x){return x.id!==entry.id});
    S.pub=prevPub; S.rev=prevRev;
    sending=false; $('sendBtn').disabled=false; $('sendBtn').textContent='Send wastage';
    var code=(err&&err.code)||'upstream_error';
    if(code==='conflict'){
      /* the shell is already reloading us to the winning version; the
         stash carries this entry across and boot() sends it again */
      toast('Somebody else sent at the same moment - yours is queued.',4000);
    }else if(code==='not_writer'||code==='not_granted'||code==='not_declared'||
             code==='consent_required'||code==='capability_disabled'){
      clearStash(); goReadOnly();
    }else if(code==='too_large'){
      clearStash();
      $('sendState').innerHTML='<div class="note-box bad">The report has grown too large to save. '+
        'Open Settings and lower how long pictures are kept.</div>';
    }else if(code==='rate_limited'){
      toast('Too many at once. Wait a moment and send again.',4000);
    }else{
      toast('That did not send. Check the connection and try again.',4500);
    }
    return false;
  }
}

function readForm(){
  var item=$('fItem').value.trim();
  if(!item){ $('fItem').focus(); toast('Say what was wasted first.',3000); return null }
  var qty=$('fQty').value.trim(), price=$('fPrice').value.trim();
  var e={
    id:uid(),
    at:new Date().toISOString(),
    d:$('fDate').value||todayISO(),
    t:$('fTime').value||nowHM(),
    item:item,
    qty:qty===''?null:Number(qty),
    unit:$('fUnit').value||'',
    reason:$('reasonChips').getAttribute('data-value')||'',
    note:$('fNote').value.trim(),
    price:price===''?null:Number(price),
    by:$('fBy').value.trim()
  };
  if(e.qty!=null&&(!isFinite(e.qty)||e.qty<0)){toast('That quantity is not a number.',3000);return null}
  if(e.price!=null&&(!isFinite(e.price)||e.price<0)){toast('That value is not a number.',3000);return null}
  if(photo)e.photo=photo;
  return e;
}
function clearForm(){
  ['fItem','fQty','fPrice','fNote'].forEach(function(id){$(id).value=''});
  $('reasonChips').setAttribute('data-value','');
  photo=null; $('shotPrev').hidden=true; $('shotImg').removeAttribute('src');
  $('fDate').value=todayISO(); $('fTime').value=nowHM();
  renderForm();
}
async function sendClicked(){
  var e=readForm(); if(!e)return;
  try{localStorage.setItem('sv-w-by',e.by||'')}catch(err){}
  if(await pushEntry(e,1)){ clearForm(); render(); selectTab('tab-today') }
}

/* ------------------------------ office ------------------------------- */
async function saveState(what){
  if(!api){goReadOnly();return false}
  var prevPub=S.pub, prevRev=S.rev||0;
  S.pub=new Date().toISOString(); S.rev=prevRev+1;
  try{ await api.publish(buildDocument()); toast(what||'Saved.'); return true }
  catch(err){
    S.pub=prevPub; S.rev=prevRev;
    var code=(err&&err.code)||'upstream_error';
    if(code==='not_writer'||code==='not_granted')goReadOnly();
    else if(code==='conflict')toast('Somebody saved first - loading their version.',4000);
    else toast('That did not save. Try again.',4000);
    return false;
  }
}
function askEdit(id){
  var e=S.entries.filter(function(x){return x.id===id})[0]; if(!e)return;
  var d=sheet('<div class="sheet"><div class="sheet-head"><h3>Correct this entry</h3>'+
    '<div class="who">'+esc(e.item||'')+' &middot; '+esc(dayName(e.d))+' '+esc(e.t||'')+'</div></div>'+
    '<div class="sheet-body">'+
      '<div class="field"><label class="lbl" for="edItem">What was wasted</label><input class="f" id="edItem" value="'+esc(e.item||'')+'"></div>'+
      '<div class="grid2">'+
        '<div class="field"><label class="lbl" for="edQty">Quantity</label><input class="f num" id="edQty" type="number" step="0.001" min="0" value="'+esc(e.qty==null?'':e.qty)+'"></div>'+
        '<div class="field"><label class="lbl" for="edPrice">Value</label><input class="f num" id="edPrice" type="number" step="0.01" min="0" value="'+esc(e.price==null?'':e.price)+'"></div>'+
      '</div>'+
      '<div class="field"><label class="lbl" for="edNote">Note</label><textarea class="f" id="edNote">'+esc(e.note||'')+'</textarea></div>'+
    '</div><div class="sheet-foot"><button class="btn" id="edCancel">Cancel</button>'+
    '<button class="btn" id="edSave" style="border-color:var(--accent);color:var(--accent)">Save</button></div></div>');
  $('edCancel').onclick=function(){d.close()};
  $('edSave').onclick=async function(){
    var q=$('edQty').value.trim(), p=$('edPrice').value.trim();
    e.item=$('edItem').value.trim()||e.item;
    e.qty=q===''?null:Number(q);
    e.price=p===''?null:Number(p);
    e.note=$('edNote').value.trim();
    e.fixed=(e.fixed||0)+1;
    d.close();
    await saveState('Entry corrected.'); render();
  };
}
async function delEntry(id){
  var e=S.entries.filter(function(x){return x.id===id})[0]; if(!e)return;
  if(!confirm('Remove "'+(e.item||'this entry')+'" from '+dayName(e.d)+'?\n\nIt disappears from the report and from the file in Drive.'))return;
  S.entries=S.entries.filter(function(x){return x.id!==id});
  await saveState('Entry removed.'); render();
}

/* ------------------------------- tabs -------------------------------- */
function selectTab(id){
  tab=id.replace('tab-','');
  if(!isOffice()&&(tab==='history'||tab==='settings')){id='tab-add';tab='add'}
  ['add','today','history','settings'].forEach(function(t){
    var b=$('tab-'+t), p=$('panel-'+t);
    if(!b||!p)return;
    var on=(t===tab);
    b.setAttribute('aria-selected',on?'true':'false');
    p.hidden=!on;
  });
  if(tab==='today')renderToday();
  if(tab==='history')renderHistory();
  if(tab==='settings')renderSettings();
}

/* ------------------------------- theme ------------------------------- */
function applyTheme(t){
  var r=document.documentElement;
  if(t==='light'||t==='dark')r.setAttribute('data-theme',t); else r.removeAttribute('data-theme');
  ['Light','Auto','Dark'].forEach(function(k){
    var b=$('th'+k); if(b)b.setAttribute('aria-pressed',(k.toLowerCase()===(t||'auto'))?'true':'false');
  });
  try{localStorage.setItem('sv-w-theme',t||'auto')}catch(e){}
}

/* ------------------------------- events ------------------------------ */
function wire(){
  ['add','today','history','settings'].forEach(function(t){
    var b=$('tab-'+t); if(b)b.onclick=function(){selectTab('tab-'+t)};
  });
  $('thLight').onclick=function(){applyTheme('light')};
  $('thAuto').onclick=function(){applyTheme('auto')};
  $('thDark').onclick=function(){applyTheme('dark')};
  $('lockBtn').onclick=lockClicked;
  $('refreshBtn').onclick=function(){
    var b=$('refreshBtn'); b.disabled=true; b.classList.add('busy'); location.reload();
  };
  $('shotBtn').onclick=function(){$('shotFile').click()};
  $('shotFile').onchange=function(){
    var f=this.files&&this.files[0]; this.value='';
    if(!f)return;
    $('shotHint').textContent='Shrinking the picture…';
    shrink(f,function(dataUrl,err){
      if(err){$('shotHint').textContent=err;return}
      photo=dataUrl;
      $('shotImg').src=dataUrl; $('shotPrev').hidden=false;
      $('shotHint').textContent='Picture ready ('+Math.round(dataUrl.length/1024)+' KB).';
    });
  };
  $('shotDrop').onclick=function(){
    photo=null; $('shotPrev').hidden=true; $('shotImg').removeAttribute('src');
    $('shotHint').textContent='Optional, but a picture settles most questions later.';
  };
  $('reasonChips').onclick=function(ev){
    var b=ev.target.closest('[data-reason]'); if(!b)return;
    var r=b.getAttribute('data-reason');
    var curv=this.getAttribute('data-value');
    this.setAttribute('data-value',curv===r?'':r);
    renderForm();
  };
  $('sendBtn').onclick=sendClicked;
  $('printToday').onclick=function(){window.print()};
  $('printHist').onclick=function(){window.print()};
  ['histFrom','histTo'].forEach(function(id){$(id).onchange=renderHistory});
  document.addEventListener('click',function(ev){
    var z=ev.target.closest('[data-zoom]'); if(z){
      var e=S.entries.filter(function(x){return x.id===z.getAttribute('data-zoom')})[0];
      if(e&&e.photo){var d=$('light');d.innerHTML='<img src="'+e.photo+'" alt="">';d.showModal();
        d.onclick=function(){d.close()}}
      return;
    }
    var ed=ev.target.closest('[data-edit]'); if(ed&&isOffice()){askEdit(ed.getAttribute('data-edit'));return}
    var dl=ev.target.closest('[data-del]'); if(dl&&isOffice()){delEntry(dl.getAttribute('data-del'));return}
  });
  $('setSave').onclick=async function(){
    var c=$('setCur').value.trim(), k=Number($('setKeep').value);
    var rs=$('setReasons').value.split('\n').map(function(x){return x.trim()}).filter(Boolean);
    var us=$('setUnits').value.split(',').map(function(x){return x.trim()}).filter(Boolean);
    if(!rs.length){toast('Keep at least one reason.',3000);return}
    if(!isFinite(k)||k<1){toast('Days must be a number of at least 1.',3000);return}
    S.cur=c||'AED'; S.keep=Math.round(k); S.reasons=rs; S.units=us;
    shedPhotos();
    await saveState('Settings saved.'); render();
  };
}

/* ------------------------------- start ------------------------------- */
function boot(){
  document.getElementById('root').innerHTML=SHELL;
  try{applyTheme(localStorage.getItem('sv-w-theme')||'auto')}catch(e){applyTheme('auto')}
  try{var r0=sessionStorage.getItem('sv-w-role');
      if(r0==='owner'||r0==='admin'||r0==='chef')role=r0}catch(e){}
  wire();
  $('fDate').value=todayISO(); $('fTime').value=nowHM();
  try{$('fBy').value=localStorage.getItem('sv-w-by')||''}catch(e){}
  $('histTo').value=todayISO();
  var from=new Date(todayISO()+'T12:00:00Z'); from.setUTCDate(from.getUTCDate()-29);
  $('histFrom').value=from.toISOString().slice(0,10);
  refreshMode(); selectTab('tab-add');

  var reach = (window.claude&&typeof claude.use==='function')
    ? claude.use('artifact') : Promise.resolve(null);
  reach.then(async function(a){
    api=a;
    if(!a){goReadOnly();return}
    /* an entry that was in flight when somebody else won the race */
    var p=unstash();
    if(p&&p.e){
      var already=S.entries.some(function(x){return x.id===p.e.id});
      if(already){clearStash()}
      else if((p.tries||1)<4){ if(await pushEntry(p.e,(p.tries||1)+1))render() }
      else{clearStash();toast('One entry could not be sent. Please send it again.',5000)}
    }
  }).catch(function(){goReadOnly()});

  /* a page nobody is working in catches up by itself */
  var AUTO=900000, AWAY=300000, hiddenAt=0;
  function idle(){return !sending&&!isOffice()&&!photo&&!$('fItem').value.trim()}
  setInterval(function(){ if(idle()&&document.visibilityState==='visible')location.reload() },AUTO);
  document.addEventListener('visibilitychange',function(){
    if(document.visibilityState==='hidden'){hiddenAt=Date.now();return}
    var away=hiddenAt?Date.now()-hiddenAt:0; hiddenAt=0;
    if(away>AWAY&&idle())location.reload();
  });
}
boot();
