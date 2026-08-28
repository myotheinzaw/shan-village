(function(){
"use strict";

/* =====================================================================
   SHAN VILLAGE — Duty Roster
   A self-saving roster. The page IS the file: pressing Publish writes a
   new version of this same artifact, and every open view — including the
   staff who have the view-only link — reloads to it.
   ===================================================================== */

var S = JSON.parse(document.getElementById('state').textContent);
var MONTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
var DAYS=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

var api=null, dl=null, readOnly=false, dirty=false, publishing=false;
/* readOnly is the derived answer to "can this person change anything right
   now". Two separate things can make it true: the viewer has no write access
   at all (staff on a view-only link), or the roster is locked with the code. */
/* Who is editing right now: null = nobody (view only), else 'owner',
   'admin' or 'chef'.
   The lock code is the gate, not the platform's namespace: a view-only viewer
   still receives the artifact namespace, so its presence proves nothing. */
var role=null, apiReady=false, idleTimer=null, pending=[];
var week = mondayOf(new Date());
var tab = 'timetable';
try{
  var sw=localStorage.getItem('sv-week'); if(sw&&/^\d{4}-\d{2}-\d{2}$/.test(sw)) week=sw;
  var st=localStorage.getItem('sv-tab'); if(st) tab=st;
}catch(e){}

/* ------------------------------ dates ------------------------------- */
function pad(n){return n<10?'0'+n:''+n}
function iso(d){return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())}
function parseISO(s){var p=s.split('-');return new Date(+p[0],+p[1]-1,+p[2])}
function mondayOf(d){var x=new Date(d.getFullYear(),d.getMonth(),d.getDate());x.setDate(x.getDate()-((x.getDay()+6)%7));return iso(x)}
function addDays(s,n){var d=parseISO(s);d.setDate(d.getDate()+n);return iso(d)}
function weekDates(s){var a=[];for(var i=0;i<7;i++)a.push(addDays(s,i));return a}
function dshort(s){var p=s.split('-');return (+p[2])+' '+MONTHS[+p[1]-1]}
function weekLabel(s){var d=weekDates(s);return dshort(d[0])+' - '+dshort(d[6])+' '+d[6].split('-')[0]}
var TZ='Asia/Dubai', TZ_LABEL='Abu Dhabi time';
function stampText(isoStr){
  if(!isoStr) return 'Not published yet';
  var d=new Date(isoStr);
  if(isNaN(d)) return 'Not published yet';
  /* Always Abu Dhabi, never the reader's own clock: a cook opening this on
     a phone still set to Yangon must not be told the roster went out three
     and a half hours later than it did. */
  var o={timeZone:TZ,day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false};
  try{ return d.toLocaleString('en-GB',o) }
  catch(e){ delete o.timeZone; return d.toLocaleString('en-GB',o) }
}

/* ------------------------------- time ------------------------------- */
function mins(t){var p=t.split(':');return (+p[0])*60+(+p[1])}
function seg(a,b,cross){var m=mins(b)-mins(a);if(cross||m<=0)m+=1440;return m}
function hoursOf(c){
  if(!c||c.k!=='WORK'||!c.s||!c.e)return 0;
  var m=c.sp&&c.s2&&c.e2 ? seg(c.s,c.e,false)+seg(c.s2,c.e2,!!c.x) : seg(c.s,c.e,!!c.x);
  return Math.round(m/60*100)/100;
}
function endLabel(t,cross){return cross&&t==='00:00'?'24:00':t}
function cellLabel(c){
  if(!c)return '';
  if(c.k!=='WORK')return c.k==='OFF'?'OFF':(c.k==='PH'?'PH':'LEAVE');
  if(!c.s)return 'ON';
  if(c.sp&&c.s2&&c.e2)return c.s+'–'+c.e+' / '+c.s2+'–'+endLabel(c.e2,c.x);
  return c.s+'–'+endLabel(c.e,c.x);
}
function shiftLabel(sh){
  if(sh.sp)return sh.s+'–'+sh.e+' / '+sh.s2+'–'+endLabel(sh.e2,sh.x);
  return sh.s+'–'+endLabel(sh.e,sh.x);
}
function hl(n){return (Math.round(n*100)/100)+''}

/* ------------------------------ helpers ----------------------------- */
function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(m){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]})}
function uid(){return 'x'+Math.random().toString(36).slice(2,9)}
function $(id){return document.getElementById(id)}
function cellOf(w,pid,i){var wk=S.roster[w];if(!wk)return null;var r=wk[pid];if(!r)return null;return r[i]||null}
function setCell(w,pid,i,c){
  if(!S.roster[w])S.roster[w]={};
  if(!S.roster[w][pid])S.roster[w][pid]={};
  if(c)S.roster[w][pid][i]=c; else delete S.roster[w][pid][i];
  if(!Object.keys(S.roster[w][pid]).length)delete S.roster[w][pid];
  if(!Object.keys(S.roster[w]).length)delete S.roster[w];
}
function find(id){return S.staff.filter(function(s){return s.id===id})[0]}
/* People who have left are marked x. Their past weeks stay exactly as they
   were - that is the point of keeping history - but they are gone from the
   current roster, so a week only lists someone who is still here or who
   actually worked that week. */
function activeStaff(){return S.staff.filter(function(p){return !p.x})}
function pastStaff(){return S.staff.filter(function(p){return !!p.x})}
function workedIn(pid,w){var r=S.roster[w];return !!(r&&r[pid]&&Object.keys(r[pid]).length)}
function teamFor(w){return S.staff.filter(function(p){return !p.x||workedIn(p.id,w)})}
function bind(sel,ev,fn){
  Array.prototype.forEach.call(document.querySelectorAll(sel),function(el){el['on'+ev]=function(){fn(el)}});
}
var toastTimer=null;
function toast(msg,ms){
  var t=$('toast'); if(!t)return;
  t.textContent=msg; t.hidden=false;
  clearTimeout(toastTimer); toastTimer=setTimeout(function(){t.hidden=true},ms||2600);
}

/* ------------------------------ lock codes ---------------------------
   Three codes: owner, admin and chef. Whoever unlocks is
   recorded against every change they publish, which is what makes the
   change log worth reading.

   Be clear about what a code is and is not. It is checked inside the page,
   so it stops accidental and casual editing. It is NOT the security wall:
   the wall is the share setting, because a view-only viewer is refused by
   the platform when the page tries to save. Their changes could never
   reach anybody, whatever they typed here.

   Only a salted hash of each code is stored, never the code itself.
   --------------------------------------------------------------------- */
function cryptoOk(){return !!(window.crypto&&window.crypto.subtle&&window.crypto.getRandomValues)}
function hex(b){return Array.prototype.map.call(b,function(x){return ('0'+x.toString(16)).slice(-2)}).join('')}
function randSalt(){var a=new Uint8Array(8);crypto.getRandomValues(a);return hex(a)}
async function codeHash(code,salt){
  var d=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(salt+'|shan-village|'+String(code)));
  return hex(new Uint8Array(d));
}
/* Older versions of this page stored a single code as S.lock. */
function getLocks(){
  if(S.locks)return S.locks;
  if(S.lock&&S.lock.salt)return {admin:S.lock};
  return null;
}
function hasLocks(){var l=getLocks();return !!(l&&(l.owner||l.admin||l.chef))}
function canEdit(){return role!==null}
function roleName(r){return r==='chef'?'Chef':(r==='admin'?'Admin':(r==='owner'?'Owner':''))}
/* The owner and the admin see the change log and may change the codes;
   the chef edits the roster but never sees who changed what. */
function seesLog(){return role==='admin'||role==='owner'}

function refreshMode(){
  readOnly=!canEdit();
  document.body.classList.toggle('readonly',readOnly);
  document.body.classList.toggle('is-admin',seesLog());
  var reason=$('roReason');
  if(reason){
    reason.textContent = hasLocks()
      ? 'It is locked. Only the office, with the lock code, can make changes.'
      : 'This link is view-only.';
  }
  renderLockButton();
  if((readOnly&&OPEN_TABS.indexOf(tab)<0)||(tab==='log'&&!seesLog()))selectTab('tab-timetable');
  render();
}
function renderLockButton(){
  var b=$('lockBtn'); if(!b)return;
  if(!cryptoOk()){b.hidden=true;return}
  b.hidden=false;
  var shut='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><rect x="4" y="10.5" width="16" height="10.5" rx="2"/><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5"/></svg>';
  var open='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><rect x="4" y="10.5" width="16" height="10.5" rx="2"/><path d="M8 10.5V7a4 4 0 0 1 7.8-1.3"/></svg>';
  if(!hasLocks()){ b.className='btn-lock'; b.innerHTML=shut+'Set lock codes'; }
  else if(!canEdit()){ b.className='btn-lock'; b.innerHTML=shut+'Locked'; }
  else { b.className='btn-lock open'; b.innerHTML=open+roleName(role)+' - lock now'; }
  var st=$('lockState');
  if(st){
    var l=getLocks()||{};
    st.textContent = hasLocks()
      ? ((l.owner?'Owner code set':'no owner code')+' · '+(l.admin?'Admin code set':'no admin code')+' · '+(l.chef?'Chef code set':'no chef code'))
      : 'No codes set yet';
  }
}
function lockNow(quiet){
  role=null; clearTimeout(idleTimer);
  try{sessionStorage.removeItem('sv-role')}catch(e){}
  refreshMode(); if(!quiet)toast('Locked.');
}
function unlockAs(r){
  role=r;
  try{sessionStorage.setItem('sv-role',r)}catch(e){}
  armIdleLock(); refreshMode();
  toast('Unlocked as '+roleName(r)+'. Your changes publish themselves when you lock.',4000);
}
/* Re-locks itself if the page is left alone - a phone put down on the pass
   should not stay editable. */
function armIdleLock(){
  clearTimeout(idleTimer);
  if(!canEdit()||!hasLocks())return;
  idleTimer=setTimeout(async function(){
    if(!canEdit())return;
    if(dirty&&!(await publish())){armIdleLock();return}
    lockNow(true);
    toast('Locked again after 15 minutes without use.',4500);
  },900000);
}
['pointerdown','keydown'].forEach(function(ev){
  document.addEventListener(ev,function(){ if(canEdit()&&hasLocks())armIdleLock() },{passive:true});
});

/* Every change is remembered with a plain-English description and written
   into the log when the roster is published. */
function logChange(text){ if(canEdit())pending.push(text) }

function lockSheet(html){var d=$('lockSheet');d.innerHTML=html;d.showModal();return d}
function askUnlock(){
  var d=lockSheet(
    '<div class="sheet-head"><h3>Unlock to edit</h3><div class="who">Enter your lock code - owner, admin or chef.</div></div>'+
    '<div class="sheet-body"><div id="lkErr"></div>'+
    '<div><label class="lbl" for="lkCode">Lock code</label>'+
    '<input class="f pin" id="lkCode" type="password" autocomplete="off" style="width:100%"></div>'+
    '<div class="note">Staff do not have a code. Without one the roster can be read but not changed.</div>'+
    '</div><div class="sheet-foot"><button class="btn" id="lkCancel">Cancel</button>'+
    '<button class="btn primary" id="lkGo">Unlock</button></div>');
  var go=async function(){
    var v=$('lkCode').value; if(!v)return;
    var l=getLocks()||{}, matched=null;
    if(l.owner&&await codeHash(v,l.owner.salt)===l.owner.hash)matched='owner';
    else if(l.admin&&await codeHash(v,l.admin.salt)===l.admin.hash)matched='admin';
    else if(l.chef&&await codeHash(v,l.chef.salt)===l.chef.hash)matched='chef';
    if(matched){ d.close(); unlockAs(matched) }
    else{
      $('lkErr').innerHTML='<div class="note" style="border-left-color:var(--critical);margin-bottom:10px">That code is not right.</div>';
      $('lkCode').value=''; $('lkCode').focus();
    }
  };
  $('lkGo').onclick=go;
  $('lkCode').onkeydown=function(e){if(e.key==='Enter')go()};
  $('lkCancel').onclick=function(){d.close()};
  setTimeout(function(){$('lkCode').focus()},60);
}
/* Only the owner or the admin may change the codes. */
function askSetCodes(){
  if(hasLocks()&&!seesLog()){toast('Only the owner or admin code can change the lock codes.',4000);return}
  var l=getLocks()||{};
  var d=lockSheet(
    '<div class="sheet-head"><h3>Lock codes</h3><div class="who">One code each for the owner, the admin and the chef. Leave a box empty to keep that code as it is.</div></div>'+
    '<div class="sheet-body"><div id="lkErr"></div>'+
    '<div><label class="lbl" for="lkOwner">Owner code</label><input class="f pin" id="lkOwner" type="text" autocomplete="off" style="width:100%" placeholder="'+(l.owner?'unchanged':'not set')+'"></div>'+
    '<div><label class="lbl" for="lkAdmin">Admin code</label><input class="f pin" id="lkAdmin" type="text" autocomplete="off" style="width:100%" placeholder="'+(l.admin?'unchanged':'not set')+'"></div>'+
    '<div><label class="lbl" for="lkChef">Chef code</label><input class="f pin" id="lkChef" type="text" autocomplete="off" style="width:100%" placeholder="'+(l.chef?'unchanged':'not set')+'"></div>'+
    '<div class="note">At least 6 characters each, and they must be different from one another. Write them down - nobody can recover them for you.</div>'+
    '</div><div class="sheet-foot">'+
    '<button class="btn" id="lkCancel">Cancel</button><button class="btn primary" id="lkGo">Save codes</button></div>');
  function fail(m){$('lkErr').innerHTML='<div class="note" style="border-left-color:var(--critical);margin-bottom:10px">'+esc(m)+'</div>'}
  $('lkGo').onclick=async function(){
    var o=$('lkOwner').value.trim(), a=$('lkAdmin').value.trim(), c=$('lkChef').value.trim();
    if(!a&&!c){fail('Enter at least one code.');return}
    if(o&&o.length<6){fail('The owner code needs at least 6 characters.');return}
    if(a&&a.length<6){fail('The admin code needs at least 6 characters.');return}
    if(c&&c.length<6){fail('The chef code needs at least 6 characters.');return}
    if(a&&c&&a===c){fail('The two codes must be different.');return}
    var next={owner:l.owner||null, admin:l.admin||null, chef:l.chef||null};
    if(o){var so=randSalt();next.owner={salt:so,hash:await codeHash(o,so)}}
    if(a){var sa=randSalt();next.admin={salt:sa,hash:await codeHash(a,sa)}}
    if(c){var sc=randSalt();next.chef={salt:sc,hash:await codeHash(c,sc)}}
    S.locks=next; S.lock=null;
    if(!role)role='admin';
    d.close(); logChange('Lock codes changed'); touch(); armIdleLock(); refreshMode();
    toast('Codes saved. Publish to make them apply for everyone.',5000);
  };
  $('lkCancel').onclick=function(){d.close()};
  setTimeout(function(){$('lkAdmin').focus()},60);
}
/* There is no way to ask the platform "is there a newer version?" - the
   only honest answer is to load the page again and see. If this view is
   holding unpublished work, publish it first: publishing reloads every
   open view anyway, so one action covers both. */
async function refreshClicked(){
  var b=$('refreshBtn'); if(b){b.disabled=true;b.classList.add('busy')}
  if(canEdit()&&dirty){ if(await publish())return; }   /* publish reloads the view itself */
  location.reload();
}
/* Staff should not have to press anything. When the roster is published
   the platform reloads every open view by itself; this covers the other
   case - a page left open on a phone all afternoon, or one the browser
   served from its cache. Only ever while nobody is editing and nothing is
   unpublished, so a reload can never eat someone's work. */
var AUTO_REFRESH_MS=900000, AWAY_MS=300000, hiddenAt=0;
function idleView(){return !canEdit()&&!dirty}
setInterval(function(){
  if(idleView()&&document.visibilityState==='visible')location.reload();
},AUTO_REFRESH_MS);
document.addEventListener('visibilitychange',function(){
  if(document.visibilityState==='hidden'){hiddenAt=Date.now();return}
  var away=hiddenAt?Date.now()-hiddenAt:0; hiddenAt=0;
  if(away>AWAY_MS&&idleView())location.reload();
});

async function lockButtonClicked(){
  if(!hasLocks())return askSetCodes();
  if(!canEdit())return askUnlock();
  /* Locking is the moment the work is finished, so it publishes on the way
     out. If publishing fails the page stays unlocked - otherwise the edits
     would sit in the draft with no visible way back to them. */
  if(dirty&&!(await publish()))return;
  lockNow();
}

/* --------------------------- draft + publish ------------------------- */
/* A draft is unpublished work sitting on top of one exact version of this
   page. S.built changes whenever a new build of the page is put out, so a
   draft from an older build is stale by definition: restoring it would put
   yesterday's roster back on screen and hide everything published since.
   Both marks must match or the draft is thrown away. */
function saveDraft(){
  if(readOnly)return;
  try{localStorage.setItem('sv-draft',JSON.stringify({base:S.rev||0,built:S.built||'',state:S}))}catch(e){}
}
function clearDraft(){try{localStorage.removeItem('sv-draft')}catch(e){}}
function loadDraft(){
  try{
    var raw=localStorage.getItem('sv-draft'); if(!raw)return false;
    var d=JSON.parse(raw);
    if(!d||typeof d!=='object'||!d.state)return false;
    if((d.base||0)!==(S.rev||0)||(d.built||'')!==(S.built||'')){clearDraft();return false}
    S=d.state; return true;
  }catch(e){return false}
}
function touch(){ if(readOnly)return; dirty=true; saveDraft(); renderPublish(); renderHistory(); }

function countChanges(){ return dirty?1:0 }

function renderPublish(){
  var btn=$('pubBtn'), stamp=$('pubStamp');
  if(!btn)return;
  stamp.innerHTML = !canEdit()
    ? '<strong>Updated '+esc(stampText(S.pub))+'</strong>Live roster - '+TZ_LABEL
    : '<strong>'+esc(stampText(S.pub))+'</strong>'+(dirty?'You have unpublished changes':'Published - '+TZ_LABEL);
  /* Staff never see a Publish button. It appears only once someone has
     unlocked with a code. */
  if(!canEdit()){ btn.hidden=true; return }
  btn.hidden=false;
  if(publishing){ btn.className='btn-pub busy'; btn.disabled=true; btn.innerHTML='Publishing…'; return }
  btn.disabled=!dirty;
  btn.className='btn-pub'+(dirty?'':' clean');
  btn.innerHTML = dirty ? 'Publish roster' : 'Published';
  btn.title = dirty ? 'Publishes now. Locking publishes too.' : 'Everything is published.';
}

function goReadOnly(reason){
  role=null; dirty=false; pending=[];
  try{sessionStorage.removeItem('sv-role')}catch(e){}
  refreshMode();
  if(reason){var b=$('roReason'); if(b)b.textContent=reason}
}

async function publish(){
  if(!canEdit()||publishing||!dirty)return false;
  if(!api){goReadOnly('Saving is not available in this view.');return false}
  publishing=true; renderPublish();
  var prevPub=S.pub, prevRev=S.rev||0, prevLog=S.log?S.log.slice():null;
  S.pub=new Date().toISOString(); S.rev=prevRev+1;
  if(pending.length){
    if(!S.log)S.log=[];
    S.log.push({t:S.pub,who:role,items:pending.slice(0,60),more:Math.max(0,pending.length-60)});
    if(S.log.length>300)S.log=S.log.slice(-300);
  }
  try{ localStorage.setItem('sv-week',week); localStorage.setItem('sv-tab',tab) }catch(e){}
  try{
    await api.publish(buildDocument());
    dirty=false; pending=[]; clearDraft(); publishing=false; renderPublish(); renderLog();
    toast('Roster published. Everyone with the link sees it now.');
    return true;
  }catch(err){
    S.pub=prevPub; S.rev=prevRev; if(prevLog)S.log=prevLog;
    publishing=false;
    var code=(err&&err.code)||'upstream_error';
    if(code==='not_writer'||code==='not_granted'||code==='not_declared'||code==='consent_required'||code==='capability_disabled'){
      goReadOnly('This link is view-only. Ask the restaurant office to make changes.');
      toast('This link cannot save changes. Your edits were not published.',6000);
    }else if(code==='conflict'){
      toast('Someone else published first — loading their version.',5000);
    }else if(code==='rate_limited'){
      renderPublish(); toast('Publishing too quickly. Wait a moment and press Publish again.',4000);
    }else if(code==='too_large'){
      renderPublish(); toast('The roster is too large to publish.',5000);
    }else{
      renderPublish(); toast('Could not publish. Check your connection and try again.',5000);
    }
    return false;
  }
}
window.addEventListener('beforeunload',function(e){
  if(dirty&&!readOnly){e.preventDefault();e.returnValue=''}
});

/* --------------------- rebuild the whole document -------------------- */
/* Built from this page's own authored source, never from the live DOM. */
function buildDocument(){
  var css=document.getElementById('appStyle').textContent;
  var app=document.getElementById('app').textContent;
  var json=JSON.stringify(S).replace(/</g,'\\u003c');
  return '<!doctype html><html lang="en"><head><meta charset="utf-8">'
    +'<meta name="viewport" content="width=device-width,initial-scale=1">'
    +'<title>Shan Village Duty Roster<\/title>'
    +'<link rel="preconnect" href="https://fonts.googleapis.com">'
    +'<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
    +'<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap">'
    +'<style id="appStyle">'+css+'<\/style></head><body><div id="root"></div>'
    +'<script id="state" type="application/json">'+json+'<\/script>'
    +'<script id="app">'+app+'<\/script></body></html>';
}

/* -------------------------------- logo -------------------------------
   The Shan Village badge, redrawn as vector: the artifact sandbox blocks
   remote images, so the mark has to live in the page.
   --------------------------------------------------------------------- */
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

/* ------------------------------- shell ------------------------------- */
var SHELL = [
'<header class="app-header">',
LOGO,
'  <div><h1>Shan Village — Duty Roster</h1><div class="sub">Staff and weekly timetable</div></div>',
'  <div class="right">',
'    <div class="themer" role="group" aria-label="Appearance">',
'      <button data-mode="auto" title="Match my device" aria-label="Match my device">A</button>',
'      <button data-mode="light" title="Light" aria-label="Light">',
'        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true">',
'          <circle cx="12" cy="12" r="4.2"/><path d="M12 2.4v2.2M12 19.4v2.2M4.2 4.2l1.6 1.6M18.2 18.2l1.6 1.6M2.4 12h2.2M19.4 12h2.2M4.2 19.8l1.6-1.6M18.2 5.8l1.6-1.6"/>',
'        </svg></button>',
'      <button data-mode="dark" title="Dark" aria-label="Dark">',
'        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">',
'          <path d="M20.4 14.6A8.6 8.6 0 0 1 9.4 3.6a8.6 8.6 0 1 0 11 11Z"/>',
'        </svg></button>',
'    </div>',
'    <button class="btn-refresh" id="refreshBtn" title="Fetch the newest published roster">'+
'      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 5v6h-6"/></svg>Refresh</button>',
'    <button class="btn-lock" id="lockBtn" hidden></button>',
'    <div class="stamp" id="pubStamp"></div>',
'    <button class="btn-pub" id="pubBtn">Publish roster</button>',
'  </div>',
'</header>',
'<nav class="tabs" role="tablist" aria-label="Sections">',
'  <button role="tab" id="tab-timetable" aria-controls="panel-timetable" aria-selected="true">Timetable</button>',
'  <button role="tab" id="tab-month" aria-controls="panel-month" aria-selected="false" class="editor-only">Monthly &amp; Overtime</button>',
'  <button role="tab" id="tab-staff" aria-controls="panel-staff" aria-selected="false" class="editor-only">Staff</button>',
'  <button role="tab" id="tab-shifts" aria-controls="panel-shifts" aria-selected="false" class="editor-only">Shift Times</button>',
'  <button role="tab" id="tab-history" aria-controls="panel-history" aria-selected="false" class="editor-only">History</button>',
'  <button role="tab" id="tab-log" aria-controls="panel-log" aria-selected="false" class="admin-only">Change Log</button>',
'  <button role="tab" id="tab-share" aria-controls="panel-share" aria-selected="false" class="editor-only">Share</button>',
'</nav>',
'<main>',
'  <div class="note live ro-only" style="margin-bottom:16px"><strong>Live roster.</strong> <span id="roReason">This link is view-only.</span> It updates by itself whenever the office publishes a change.</div>',
'  <section class="panel stack" id="panel-timetable" role="tabpanel" aria-labelledby="tab-timetable">',
'    <div class="card card-pad row" id="weekBar">',
'      <button class="btn icon" id="prevWeek" aria-label="Previous week">‹</button>',
'      <div><div style="font-family:var(--font-display);font-size:17px;font-weight:600" id="weekLabel">—</div>',
'      <div class="faint" style="font-size:11.5px" id="weekSub">—</div></div>',
'      <button class="btn icon" id="nextWeek" aria-label="Next week">›</button>',
'      <select class="f actions" id="weekJump" aria-label="Jump to a saved week" style="max-width:210px"></select>',
'      <div class="spacer actions"></div>',
'      <button class="btn actions" id="thisWeek">This week</button>',
'      <button class="btn actions editor-only" id="copyPrev">Copy last week</button>',
'      <button class="btn actions primary" id="pdfBtn">Export PDF</button>',
'    </div>',
'    <div class="tiles" id="tiles"></div>',
'    <div class="print-head"><div class="ph-title">SHAN VILLAGE — Duty Roster</div>',
'      <div class="ph-week" id="phWeek"></div><div class="ph-meta" id="phMeta"></div></div>',
'    <div class="wrap"><table class="grid" id="grid"></table></div>',
'    <div class="legend">',
'      <span><span class="sw" style="background:var(--accent-soft);border:1px solid var(--accent)"></span>Working</span>',
'      <span><span class="sw" style="background:var(--missing-soft)"></span>OFF</span>',
'      <span><span class="sw" style="background:var(--good-soft);border:1px solid var(--good)"></span>Public holiday</span>',
'      <span><span class="sw" style="background:var(--warn-soft);border:1px solid var(--warn)"></span>Leave</span>',
'      <span class="editor-only faint">Tap any box to set the shift</span>',
'    </div>',
'    <div class="note">Hours are worked out for you, including shifts finishing after midnight and split shifts. <strong>No break is deducted</strong> — every figure is the full time from start to finish.</div>',
'  </section>',
'  <section class="panel stack" id="panel-month" role="tabpanel" aria-labelledby="tab-month" hidden>',
'    <div class="card card-pad row" id="monthBar">',
'      <button class="btn icon" id="prevMonth" aria-label="Previous month">&lsaquo;</button>',
'      <div style="font-family:var(--font-display);font-size:17px;font-weight:600;min-width:150px" id="monthLabel">-</div>',
'      <button class="btn icon" id="nextMonth" aria-label="Next month">&rsaquo;</button>',
'      <div class="spacer actions"></div>',
'      <div class="row editor-only" style="gap:7px">',
'        <label class="lbl" for="otLimit" style="margin:0">Overtime after</label>',
'        <input class="f" id="otLimit" type="number" min="1" max="24" step="0.5" style="width:78px">',
'        <span class="faint" style="font-size:12px">hours a day</span>',
'      </div>',
'      <div class="row editor-only" style="gap:7px">',
'        <label class="lbl" for="monthCut" style="margin:0">Month starts on the</label>',
'        <input class="f" id="monthCut" type="number" min="1" max="28" step="1" style="width:66px">',
'        <span class="faint" style="font-size:12px">of the month before</span>',
'      </div>',
'      <button class="btn actions" id="monthPrint">Print</button>',
'    </div>',
'    <div class="tiles" id="monthTiles"></div>',
'    <div class="print-head"><div class="ph-title">SHAN VILLAGE - Monthly Hours</div>',
'      <div class="ph-week" id="phMonth"></div><div class="ph-meta" id="phMonthMeta"></div></div>',
'    <div class="wrap"><table class="grid" id="monthGrid"></table></div>',
'    <div class="note accent"><strong>The month here runs to the payroll cut-off, not to the calendar.</strong> A month named above runs from the cut-off day in the month before up to the day before it: August 2026 is 26 July to 25 August 2026. Every figure on this page - hours, normal, overtime - is counted over that run, so it matches what payroll counts. Set the cut-off to 1 and you get a plain calendar month back.</div>',
'    <div class="note accent"><strong>How overtime is counted here.</strong> Any hours above the daily limit count as overtime for that day; the rest count as normal time. A 12 hour day at a 10 hour limit is 10 normal and 2 overtime. Whether that overtime is paid is your decision - this page only shows the hours it would apply to. Remember no break is deducted anywhere.</div>',
'  </section>',
'  <section class="panel stack" id="panel-log" role="tabpanel" aria-labelledby="tab-log" hidden>',
'    <div><h2 class="sec">Change log</h2><p class="sec">Every publish, who did it, and what changed. Only the owner and admin codes see this.</p></div>',
'    <div class="tiles" id="logTiles"></div>',
'    <div class="wrap"><table class="plain" id="logTable"></table></div>',
'    <div class="note">Entries are written when the roster is published, not while you are typing. The name shown is the lock code that was used - Owner, Admin or Chef.</div>',
'  </section>',
'  <section class="panel stack" id="panel-staff" role="tabpanel" aria-labelledby="tab-staff" hidden>',
'    <div><h2 class="sec">Staff</h2><p class="sec">Add someone and they appear on every week’s timetable.</p></div>',
'    <div class="card card-pad editor-only">',
'      <div class="row" style="align-items:flex-end">',
'        <div style="flex:1 1 190px"><label class="lbl" for="newName">Name</label><input class="f" id="newName" style="width:100%" placeholder="e.g. Win Paing" autocomplete="off"></div>',
'        <div style="flex:0 1 185px"><label class="lbl" for="newPos">Position</label><select class="f" id="newPos" style="width:100%"></select></div>',
'        <button class="btn primary" id="addStaff">Add to team</button>',
'      </div>',
'    </div>',
'    <div class="wrap"><table class="plain" id="staffTable"></table></div>',
'    <div><h2 class="sec">Positions</h2><p class="sec">The job titles you can give someone.</p></div>',
'    <div class="card card-pad editor-only">',
'      <div class="row" style="align-items:flex-end">',
'        <div style="flex:1 1 190px"><label class="lbl" for="newPosName">New position</label><input class="f" id="newPosName" style="width:100%" placeholder="e.g. Barista" autocomplete="off"></div>',
'        <button class="btn primary" id="addPos">Add position</button>',
'      </div>',
'    </div>',
'    <div class="wrap"><table class="plain" id="posTable"></table></div>',
'  </section>',
'  <section class="panel stack" id="panel-shifts" role="tabpanel" aria-labelledby="tab-shifts" hidden>',
'    <div><h2 class="sec">Shift times</h2><p class="sec">Your regular shifts, so filling the timetable is one tap.</p></div>',
'    <div class="card card-pad editor-only">',
'      <div class="row" style="align-items:flex-end">',
'        <div><label class="lbl" for="shStart">Start</label><input class="f" id="shStart" type="time" value="13:00"></div>',
'        <div><label class="lbl" for="shEnd">Finish</label><input class="f" id="shEnd" type="time" value="23:00"></div>',
'        <label class="row" style="gap:6px;font-size:12.5px;color:var(--text-muted)"><input type="checkbox" id="shCross"> Finishes next day</label>',
'        <label class="row" style="gap:6px;font-size:12.5px;color:var(--text-muted)"><input type="checkbox" id="shSplit"> Split shift</label>',
'        <div id="shSeg2" hidden class="row" style="gap:10px">',
'          <div><label class="lbl" for="sh2Start">2nd start</label><input class="f" id="sh2Start" type="time" value="19:00"></div>',
'          <div><label class="lbl" for="sh2End">2nd finish</label><input class="f" id="sh2End" type="time" value="00:00"></div>',
'        </div>',
'        <button class="btn primary" id="addShift">Add shift</button>',
'      </div>',
'    </div>',
'    <div class="wrap"><table class="plain" id="shiftTable"></table></div>',
'    <div class="note">A split shift is two periods in one day, like <span class="num">09:00–14:00</span> then <span class="num">19:00–24:00</span>. Tick <strong>finishes next day</strong> for anything ending at midnight or later.</div>',
'  </section>',
'  <section class="panel stack" id="panel-history" role="tabpanel" aria-labelledby="tab-history" hidden>',
'    <div><h2 class="sec">Every week you have saved</h2><p class="sec">Nothing is ever thrown away. Open any past week to correct it, then publish again.</p></div>',
'    <div class="tiles" id="histTiles"></div>',
'    <div class="wrap"><table class="plain" id="histTable"></table></div>',
'    <div class="note">Past weeks stay editable. If you fix a mistake in an old week and press <strong>Publish roster</strong>, the correction goes out with everything else.</div>',
'  </section>',
'  <section class="panel stack" id="panel-share" role="tabpanel" aria-labelledby="tab-share" hidden>',
'    <div><h2 class="sec">Who can see and change this roster</h2><p class="sec">Access is controlled by the share menu on this page, not by passwords.</p></div>',
'    <div class="wrap"><table class="plain">',
'      <thead><tr><th>Level</th><th>How you give it</th><th>What they can do</th></tr></thead><tbody>',
'      <tr><td><strong>Admin</strong><div class="faint" style="font-size:11px">You, and anyone you add as an editor</div></td>',
'      <td>Share menu &rarr; <strong>Can edit</strong></td>',
'      <td>Add and remove staff and positions, set shift times, build the timetable. Locking publishes the work.</td></tr>',
'      <tr><td><strong>Staff</strong><div class="faint" style="font-size:11px">Everyone you send the link to</div></td>',
'      <td>Share menu &rarr; General access &rarr; <strong>Anyone with the link</strong></td>',
'      <td>See the published roster. Every editing control is hidden, and the page refuses to save for them.</td></tr>',
'      </tbody></table></div>',
'    <div class="note accent"><strong>These are the only two levels here.</strong> This page cannot give one person different rights from another - for example letting a supervisor edit the timetable but not remove staff. If you need named users with individual rights, that needs the full system with its own login.</div>',
'    <div><h2 class="sec">Lock code</h2><p class="sec">An extra step before anyone can change the roster, including you.</p></div>',
'    <div class="card card-pad stack editor-only">',
'      <div class="row"><button class="btn primary" id="lockSet">Set or change the lock codes</button><span class="pill" id="lockState"></span></div>',
'      <p class="sec">There are three codes: <strong>Owner</strong>, <strong>Admin</strong> and <strong>Chef</strong>. All three can edit the roster; whichever one was used is recorded against every change in the Change Log. Owner and Admin can read that log and change the codes - the Chef cannot. The roster opens locked for everyone, and locks itself again after 15 minutes without use.</p>',
'    </div>',
'    <div class="note accent"><strong>What the code is for.</strong> It stops accidental changes - a phone left on the pass, a wrong tap while you are looking something up. It is not a security wall: the code is checked inside the page. The real protection is the share setting above, because a view-only viewer is refused by the platform when the page tries to save, so their changes could never reach anybody.</div>',
'    <div><h2 class="sec">Sending it out</h2></div>',
'    <div class="card card-pad stack">',
'      <div><strong>1. Give the team the link</strong><p class="sec" style="margin-top:3px">Share menu &rarr; set <strong>General access</strong> to <strong>Anyone with the link</strong> &rarr; <strong>Copy link</strong>. Post that link in the staff WhatsApp group. Nobody needs an account to open it.</p></div>',
'      <div><strong>2. They always see the current roster</strong><p class="sec" style="margin-top:3px">Press <strong>Publish roster</strong>, or simply lock the page when you are finished - locking publishes for you. Every open copy updates by itself, and one left sitting on a phone catches up when it is picked up again. The time at the top says how fresh what you are looking at is, and <strong>Refresh</strong> fetches it again at any moment.</p></div>',
'      <div><strong>3. For the group chat</strong><p class="sec" style="margin-top:3px"><strong>Export PDF</strong> opens your print window; choose <em>Save as PDF</em>, then attach the file to the group chat.</p></div>',
'    </div>',
'    <div class="row"><button class="btn primary" id="pdfBtn2">Export this week as PDF</button></div>',
'    <div class="note">Anyone holding the link can open the roster, so share it inside your staff group rather than publicly.</div>',
'  </section>',
'</main>',
'<dialog class="sheet" id="cellSheet"></dialog>',
'<dialog class="sheet" id="lockSheet"></dialog>',
'<div id="toast" hidden></div>'
].join('');

/* ------------------------------- render ------------------------------ */
function render(){renderWeek();renderMonth();renderStaff();renderShifts();renderHistory();renderLog();renderPublish()}

/* ---------------------- month view and overtime ----------------------
   Overtime is counted per DAY: anything above the threshold on a single
   day is overtime, the rest is normal time. The threshold is yours to set.
   Whether overtime is actually paid is a management decision - this only
   shows the hours it would apply to.
   --------------------------------------------------------------------- */
function otLimit(){var n=Number(S.ot);return (isFinite(n)&&n>0)?n:10}
function cellOnDate(pid,d){
  var wk=S.roster[mondayOf(parseISO(d))]; if(!wk)return null;
  var row=wk[pid]; if(!row)return null;
  return row[Math.round((parseISO(d)-parseISO(mondayOf(parseISO(d))))/86400000)]||null;
}
/* The payroll month does not start on the 1st. Shan Village counts a month
   from the 26th of the month before to the 25th of the month named, so
   August 2026 is 26 July to 25 August. The cut-off day is a setting, and
   setting it to 1 gives back a plain calendar month. */
function monthCut(){var n=Number(S.mcut);return (isFinite(n)&&n>=1&&n<=28)?Math.round(n):26}
function monthStart(ym){
  var c=monthCut();
  if(c===1)return ym+'-01';
  var d=new Date(+ym.slice(0,4),+ym.slice(5,7)-2,c);
  return iso(d);
}
function monthEnd(ym){
  var c=monthCut();
  if(c===1)return ym+'-'+pad(new Date(+ym.slice(0,4),+ym.slice(5,7),0).getDate());
  return ym+'-'+pad(c-1);
}
function monthList(ym){
  var a=[], d=monthStart(ym), end=monthEnd(ym);
  while(d<=end){a.push(d);d=addDays(d,1)}
  return a;
}
function monthTitle(ym){
  return new Date(+ym.slice(0,4),+ym.slice(5,7)-1,1)
    .toLocaleDateString(undefined,{month:'long',year:'numeric'});
}
/* '26 Jul - 25 Aug 2026', or the plain month when the cut-off is the 1st. */
function monthRange(ym){
  if(monthCut()===1)return monthTitle(ym);
  return dshort(monthStart(ym))+' - '+dshort(monthEnd(ym))+' '+monthEnd(ym).slice(0,4);
}
/* Which payroll month a date falls in: on or after the cut-off it belongs
   to the month that comes next. */
function monthOf(d){
  var y=+d.slice(0,4), m=+d.slice(5,7), day=+d.slice(8);
  if(day>=monthCut()){m++; if(m>12){m=1;y++}}
  return y+'-'+pad(m);
}
function shiftMonth(ym,n){
  var d=new Date(+ym.slice(0,4),+ym.slice(5,7)-1+n,1);
  return d.getFullYear()+'-'+pad(d.getMonth()+1);
}
var monthCur=null;

function renderMonth(){
  if(!$('monthGrid'))return;
  if(!monthCur)monthCur=monthOf(iso(new Date()));
  var days=monthList(monthCur), lim=otLimit(), today=iso(new Date());
  $('monthLabel').innerHTML=esc(monthTitle(monthCur))+
    (monthCut()===1?'':
      '<div class="faint" style="font-family:var(--font-body);font-size:11.5px;font-weight:400">'+
      esc(monthRange(monthCur))+'</div>');
  var cutIn=$('monthCut'); if(cutIn&&document.activeElement!==cutIn)cutIn.value=monthCut();
  var otIn=$('otLimit'); if(otIn&&document.activeElement!==otIn)otIn.value=lim;

  var rows=S.staff.map(function(p){
    var normal=0,over=0,total=0,daysWorked=0,perDay=[];
    days.forEach(function(d){
      var c=cellOnDate(p.id,d), h=hoursOf(c);
      perDay.push({h:h,c:c});
      if(h>0){daysWorked++;total+=h;normal+=Math.min(h,lim);over+=Math.max(0,h-lim)}
    });
    return {p:p,perDay:perDay,normal:normal,over:over,total:total,daysWorked:daysWorked};
  }).filter(function(r){return !r.p.x||r.total>0});

  var tN=0,tO=0,tT=0,people=0;
  rows.forEach(function(r){tN+=r.normal;tO+=r.over;tT+=r.total;if(r.total>0)people++});
  $('monthTiles').innerHTML=
    tile('Staff with hours',people,'in '+monthTitle(monthCur)+' payroll month')+
    tile('Total hours',hl(Math.round(tT*100)/100),'everyone, '+monthRange(monthCur))+
    tile('Normal hours',hl(Math.round(tN*100)/100),'up to '+lim+' h a day')+
    tile('Overtime hours',hl(Math.round(tO*100)/100),'above '+lim+' h a day')+
    tile('Days over '+lim+' h',rows.reduce(function(n,r){return n+r.perDay.filter(function(d){return d.h>lim}).length},0),'across the team');

  var h='<thead><tr><th class="col-person">Employee</th>';
  days.forEach(function(d,i){
    var wd=new Date(parseISO(d)).getDay();
    /* the run crosses a month boundary, so the number alone is ambiguous:
       name the month on the first column and again where it turns over */
    var turn=(i===0)||(d.slice(8)==='01');
    h+='<th class="day mday'+(d===today?' today':'')+(wd===0||wd===6?' we':'')+(turn?' mturn':'')+'">'+
       (+d.slice(8))+(turn?'<div class="mmon">'+MONTHS[+d.slice(5,7)-1]+'</div>':'')+'</th>';
  });
  h+='<th class="hcol">Normal</th><th class="hcol">Overtime</th><th class="hcol">Total</th></tr></thead><tbody>';

  rows.forEach(function(r){
    h+='<tr><td class="col-person"><div class="pname">'+esc(r.p.name)+'</div>'+
       '<div class="prole">'+esc(r.p.pos||'-')+'</div></td>';
    r.perDay.forEach(function(d,i){
      var cls=d.h>lim?'mcell ot':(d.h>0?'mcell':'mcell zero');
      if(i===0||days[i].slice(8)==='01')cls+=' mturn';
      h+='<td class="'+cls+'"'+(d.h?' title="'+esc(cellLabel(d.c)+' - '+hl(d.h)+' h')+'"':'')+'>'+
         (d.h?hl(d.h):(d.c?'-':''))+'</td>';
    });
    h+='<td class="hcol">'+hl(Math.round(r.normal*100)/100)+'</td>'+
       '<td class="hcol'+(r.over>0?' otsum':'')+'">'+(r.over>0?hl(Math.round(r.over*100)/100):'-')+'</td>'+
       '<td class="hcol"><strong>'+hl(Math.round(r.total*100)/100)+'</strong></td></tr>';
  });
  h+='</tbody><tfoot><tr><td class="col-person">Team total</td>';
  days.forEach(function(d,i){
    var dayTotal=rows.reduce(function(n,r){var x=r.perDay[i];return n+(x?x.h:0)},0);
    h+='<td class="mcell'+((i===0||d.slice(8)==='01')?' mturn':'')+'">'+
       (dayTotal?hl(Math.round(dayTotal*10)/10):'')+'</td>';
  });
  h+='<td class="hcol"><strong>'+hl(Math.round(tN*100)/100)+'</strong></td>'+
     '<td class="hcol otsum"><strong>'+hl(Math.round(tO*100)/100)+'</strong></td>'+
     '<td class="hcol"><strong>'+hl(Math.round(tT*100)/100)+'</strong></td></tr></tfoot>';
  $('monthGrid').innerHTML=h;
}

/* ------------------------------ change log --------------------------- */
function renderLog(){
  if(!$('logTable'))return;
  var log=(S.log||[]).slice().reverse();
  $('logTiles').innerHTML=
    tile('Entries',log.length,'publishes recorded')+
    tile('By owner',log.filter(function(e){return e.who==='owner'}).length,'')+
    tile('By admin',log.filter(function(e){return e.who==='admin'}).length,'')+
    tile('By chef',log.filter(function(e){return e.who==='chef'}).length,'')+
    tile('Last change',log.length?stampText(log[0].t).split(',')[0]:'-','');

  var h='<thead><tr><th style="width:150px">When ('+TZ_LABEL.replace(' time','')+')</th><th style="width:90px">Who</th><th>What changed</th></tr></thead><tbody>';
  if(!log.length)h+='<tr><td colspan="3" style="color:var(--text-muted);padding:24px;text-align:center">Nothing recorded yet. Every publish from now on is listed here.</td></tr>';
  log.forEach(function(e){
    var items=(e.items||[]).map(function(t){return '<li>'+esc(t)+'</li>'}).join('');
    if(e.more)items+='<li class="faint">and '+e.more+' more</li>';
    h+='<tr><td class="num" style="font-size:11.5px">'+esc(stampText(e.t))+'</td>'+
       '<td><span class="pill'+(e.who==='admin'||e.who==='owner'?' gold':'')+'">'+esc(roleName(e.who)||'-')+'</span></td>'+
       '<td><ul style="margin:0;padding-left:16px;font-size:12.5px">'+items+'</ul></td></tr>';
  });
  $('logTable').innerHTML=h+'</tbody>';
}

/* Weeks that have any roster saved, oldest first. */
function savedWeeks(){return Object.keys(S.roster).sort()}
function weekStats(w){
  var st={days:0,work:0,off:0,leave:0,ph:0,hours:0,people:0};
  var wk=S.roster[w]; if(!wk)return st;
  Object.keys(wk).forEach(function(pid){
    var row=wk[pid], any=false;
    for(var i=0;i<7;i++){
      var c=row[i]; if(!c)continue;
      any=true; st.days++; st.hours+=hoursOf(c);
      if(c.k==='WORK')st.work++; else if(c.k==='OFF')st.off++;
      else if(c.k==='LEAVE')st.leave++; else if(c.k==='PH')st.ph++;
    }
    if(any)st.people++;
  });
  st.hours=Math.round(st.hours*100)/100;
  return st;
}
function weekRelation(w){
  var now=mondayOf(new Date());
  if(w===now)return 'This week';
  return w<now?'Past week':'Upcoming week';
}
function renderWeekJump(){
  var sel=$('weekJump'); if(!sel)return;
  var list=savedWeeks(), now=mondayOf(new Date());
  if(list.indexOf(week)<0)list.push(week);
  if(list.indexOf(now)<0)list.push(now);
  list.sort();
  sel.innerHTML=list.map(function(w){
    var st=weekStats(w);
    return '<option value="'+w+'"'+(w===week?' selected':'')+'>'+esc(weekLabel(w))+
      (st.days?' ('+st.days+' set)':' (empty)')+'</option>';
  }).join('');
}
function renderHistory(){
  var list=savedWeeks().slice().reverse();
  var totalH=0,totalD=0;
  list.forEach(function(w){var st=weekStats(w);totalH+=st.hours;totalD+=st.days});
  $('histTiles').innerHTML=
    tile('Weeks saved',list.length,list.length?'kept and editable':'publish a week to start')+
    tile('Days set',totalD,'across every week')+
    tile('Hours',hl(Math.round(totalH*100)/100),'scheduled in total')+
    tile('Staff',activeStaff().length,'on the team now');

  var h='<thead><tr><th>Week</th><th></th><th class="n">Staff</th><th class="n">Working</th><th class="n">OFF</th><th class="n">Leave</th><th class="n">Hours</th><th style="width:150px"></th></tr></thead><tbody>';
  if(!list.length){
    h+='<tr><td colspan="8" style="color:var(--text-muted);padding:24px;text-align:center">No weeks saved yet. Build a week on the Timetable tab and press Publish.</td></tr>';
  }
  list.forEach(function(w){
    var st=weekStats(w);
    h+='<tr'+(w===week?' style="background:var(--accent-soft)"':'')+'>'+
      '<td><strong>'+esc(weekLabel(w))+'</strong></td>'+
      '<td><span class="pill'+(w===mondayOf(new Date())?' gold':'')+'">'+weekRelation(w)+'</span></td>'+
      '<td class="n">'+st.people+'</td><td class="n">'+st.work+'</td><td class="n">'+st.off+'</td>'+
      '<td class="n">'+(st.leave||'-')+'</td><td class="n"><strong>'+hl(st.hours)+'</strong></td>'+
      '<td><button class="btn" data-openweek="'+w+'">Open</button>'+
      (readOnly?'':' <button class="btn danger" data-delweek="'+w+'">Delete</button>')+'</td></tr>';
  });
  $('histTable').innerHTML=h+'</tbody>';

  bind('[data-openweek]','click',function(el){
    week=el.getAttribute('data-openweek'); persistWeek();
    selectTab('tab-timetable'); renderWeek(); renderWeekJump();
  });
  if(!readOnly)bind('[data-delweek]','click',function(el){
    var w=el.getAttribute('data-delweek');
    if(!confirm('Delete the whole roster for '+weekLabel(w)+'?\n\nThis cannot be undone once you publish.'))return;
    logChange('Deleted the whole roster for '+weekLabel(w));
    delete S.roster[w]; touch(); render();
  });
}

function renderWeek(){
  var dates=weekDates(week), today=iso(new Date()), team=teamFor(week);
  $('weekLabel').textContent=weekLabel(week);
  var st0=weekStats(week);
  $('weekSub').textContent = weekRelation(week)+(st0.days?'':' - nothing set yet');
  renderWeekJump();
  $('phWeek').textContent='Week '+weekLabel(week);
  $('phMeta').textContent=(S.pub?'Published '+stampText(S.pub)+' '+TZ_LABEL:'Draft - not published yet')
    +'  ·  hours are start to finish, no break deducted';

  var work=0,off=0,leave=0,total=0,unset=0;
  team.forEach(function(p){
    for(var i=0;i<7;i++){
      var c=cellOf(week,p.id,i);
      if(!c){unset++;continue}
      total+=hoursOf(c);
      if(c.k==='WORK')work++; else if(c.k==='OFF')off++; else if(c.k==='LEAVE')leave++;
    }
  });
  $('tiles').innerHTML=
    tile('Staff',team.length,team.length?'on the team':'add someone to start')+
    tile('Shifts set',work,'working days this week')+
    tile('OFF days',off,'rest days given')+
    tile('Hours',hl(total),'scheduled this week')+
    tile('Not set yet',unset,unset?'empty boxes':'week is complete');

  if(!team.length){
    $('grid').innerHTML='<tbody><tr><td style="padding:34px;text-align:center;color:var(--text-muted)">No staff yet. Open the <strong>Staff</strong> tab and add your team.</td></tr></tbody>';
    return;
  }

  var h='<thead><tr><th class="col-person">Employee</th>';
  dates.forEach(function(d,i){h+='<th class="day'+(d===today?' today':'')+'">'+DAYS[i]+'<span class="dn">'+dshort(d)+'</span></th>'});
  h+='<th class="hcol" style="text-align:right">Hours</th></tr></thead><tbody>';

  team.forEach(function(p){
    var sum=0;
    h+='<tr><td class="col-person"><div class="pname">'+esc(p.name)+'</div><div class="prole'+(p.pos?'':' unset')+'">'+esc(p.pos||'Set a position')+'</div></td>';
    for(var i=0;i<7;i++){
      var c=cellOf(week,p.id,i); sum+=hoursOf(c);
      var sub=c&&c.k==='WORK'&&hoursOf(c)?'<small>'+hl(hoursOf(c))+' h</small>':'';
      h+='<td class="cell"><button class="slot'+(c?' set '+c.k.toLowerCase():' blank')+'" data-p="'+p.id+'" data-i="'+i+'"'+
         (readOnly?' disabled':'')+' aria-label="'+esc(p.name+', '+DAYS[i])+'">'+esc(c?cellLabel(c):'+')+sub+'</button></td>';
    }
    h+='<td class="hcol">'+hl(sum)+'</td></tr>';
  });
  h+='</tbody><tfoot><tr><td class="col-person">Working / OFF</td>';
  for(var i=0;i<7;i++){
    var w=0,o=0,hr=0;
    team.forEach(function(p){var c=cellOf(week,p.id,i);if(!c)return;hr+=hoursOf(c);if(c.k==='WORK')w++;if(c.k==='OFF')o++});
    h+='<td><span class="fn">'+w+' / '+o+'</span>'+hl(hr)+' h</td>';
  }
  h+='<td class="hcol" style="color:var(--text)"><strong>'+hl(total)+'</strong></td></tr></tfoot>';
  $('grid').innerHTML=h;
  bind('.slot','click',function(b){openCell(b.getAttribute('data-p'),+b.getAttribute('data-i'))});
}
function tile(l,v,f){return '<div class="tile"><div class="label">'+esc(l)+'</div><div class="value">'+esc(v)+'</div><div class="foot">'+esc(f)+'</div></div>'}

function renderStaff(){
  $('newPos').innerHTML='<option value="">No position yet</option>'+S.positions.map(function(p){return '<option value="'+esc(p)+'">'+esc(p)+'</option>'}).join('');

  var h='<thead><tr><th>Name</th><th>Position</th>'+(readOnly?'':'<th style="width:92px"></th>')+'</tr></thead><tbody>';
  if(!activeStaff().length)h+='<tr><td colspan="3" style="color:var(--text-muted);padding:22px;text-align:center">No staff yet.</td></tr>';
  activeStaff().forEach(function(p){
    h+='<tr><td>'+(readOnly?'<strong>'+esc(p.name)+'</strong>':'<input class="f" style="width:100%;max-width:230px" value="'+esc(p.name)+'" data-rename="'+p.id+'">')+'</td>'+
      '<td>'+(readOnly?esc(p.pos||'—'):'<select class="f" data-repos="'+p.id+'"><option value="">No position yet</option>'+
        S.positions.map(function(o){return '<option value="'+esc(o)+'"'+(o===p.pos?' selected':'')+'>'+esc(o)+'</option>'}).join('')+'</select>')+'</td>'+
      (readOnly?'':'<td><button class="btn danger" data-del="'+p.id+'">Remove</button></td>')+'</tr>';
  });
  var gone=pastStaff();
  if(gone.length){
    h+='<tr><td colspan="3" class="past-head">No longer on the roster - kept so their old weeks still read correctly</td></tr>';
    gone.forEach(function(p){
      h+='<tr class="past"><td>'+esc(p.name)+'</td><td>'+esc(p.pos||'-')+'</td>'+
        (readOnly?'':'<td><button class="btn" data-back="'+p.id+'">Bring back</button></td>')+'</tr>';
    });
  }
  $('staffTable').innerHTML=h+'</tbody>';

  var ph='<thead><tr><th>Position</th><th class="n">People</th>'+(readOnly?'':'<th style="width:92px"></th>')+'</tr></thead><tbody>';
  if(!S.positions.length)ph+='<tr><td colspan="3" style="color:var(--text-muted);padding:18px;text-align:center">No positions yet.</td></tr>';
  S.positions.forEach(function(p){
    var n=activeStaff().filter(function(s){return s.pos===p}).length;
    ph+='<tr><td>'+esc(p)+'</td><td class="n">'+(n||'—')+'</td>'+
      (readOnly?'':'<td><button class="btn danger" data-delpos="'+esc(p)+'">Remove</button></td>')+'</tr>';
  });
  $('posTable').innerHTML=ph+'</tbody>';

  if(readOnly)return;
  bind('[data-rename]','change',function(el){
    var p=find(el.getAttribute('data-rename')); if(!p)return;
    var v=el.value.trim(); if(!v){el.value=p.name;return}
    logChange('Renamed '+p.name+' to '+v);
    p.name=v; touch(); renderWeek();
  });
  bind('[data-repos]','change',function(el){
    var p=find(el.getAttribute('data-repos')); if(!p)return;
    logChange(p.name+' position set to '+(el.value||'none'));
    p.pos=el.value; touch(); renderWeek();
  });
  bind('[data-back]','click',function(el){
    var p=find(el.getAttribute('data-back')); if(!p)return;
    logChange('Brought '+p.name+' back onto the roster');
    delete p.x; touch(); render();
  });
  bind('[data-del]','click',function(el){
    var p=find(el.getAttribute('data-del')); if(!p)return;
    var had=Object.keys(S.roster).filter(function(w){return workedIn(p.id,w)}).length;
    if(had){
      if(!confirm('Take '+p.name+' off the roster?\n\nThey worked '+had+' week'+(had>1?'s':'')+
                  '. Those weeks are kept as they are, so the history and the hours stay correct. '+
                  'They just will not appear on new weeks.'))return;
      logChange('Took '+p.name+' off the roster (history kept)');
      p.x=1;
    }else{
      if(!confirm('Remove '+p.name+' from the team?'))return;
      logChange('Removed staff: '+p.name);
      S.staff=S.staff.filter(function(s){return s.id!==p.id});
    }
    touch(); render();
  });
  bind('[data-delpos]','click',function(el){
    var name=el.getAttribute('data-delpos');
    var n=S.staff.filter(function(s){return s.pos===name}).length;
    if(n&&!confirm(name+' is used by '+n+' person(s). Remove it and clear their position?'))return;
    logChange('Removed position: '+name);
    S.positions=S.positions.filter(function(p){return p!==name});
    S.staff.forEach(function(s){if(s.pos===name)s.pos=''});
    touch(); render();
  });
}

function renderShifts(){
  var h='<thead><tr><th>Shift</th><th class="n">Hours</th><th>Type</th>'+(readOnly?'':'<th style="width:92px"></th>')+'</tr></thead><tbody>';
  if(!S.shifts.length)h+='<tr><td colspan="4" style="color:var(--text-muted);padding:22px;text-align:center">No shift times yet.</td></tr>';
  S.shifts.forEach(function(sh){
    var hrs=hoursOf({k:'WORK',s:sh.s,e:sh.e,x:sh.x,sp:sh.sp,s2:sh.s2,e2:sh.e2});
    h+='<tr><td class="num">'+esc(shiftLabel(sh))+'</td><td class="n">'+hl(hrs)+'</td>'+
      '<td>'+(sh.sp?'<span class="pill gold">Split</span> ':'')+(sh.x?'<span class="pill">Overnight</span>':(sh.sp?'':'<span class="pill">Day</span>'))+'</td>'+
      (readOnly?'':'<td><button class="btn danger" data-delshift="'+sh.id+'">Remove</button></td>')+'</tr>';
  });
  $('shiftTable').innerHTML=h+'</tbody>';
  if(!readOnly)bind('[data-delshift]','click',function(el){
    var gone=S.shifts.filter(function(s){return s.id===el.getAttribute('data-delshift')})[0];
    S.shifts=S.shifts.filter(function(s){return s.id!==el.getAttribute('data-delshift')});
    if(gone)logChange('Removed shift time: '+shiftLabel(gone));
    touch(); renderShifts();
  });
}

/* ---------------------------- cell editor ---------------------------- */
function openCell(pid,i){
  if(readOnly)return;
  var p=find(pid); if(!p)return;
  var cur=cellOf(week,pid,i), d=$('cellSheet'), dates=weekDates(week);

  var opts=S.shifts.map(function(sh){
    var on=cur&&cur.k==='WORK'&&cur.s===sh.s&&cur.e===sh.e&&!!cur.sp===!!sh.sp;
    var hrs=hoursOf({k:'WORK',s:sh.s,e:sh.e,x:sh.x,sp:sh.sp,s2:sh.s2,e2:sh.e2});
    return '<button class="opt'+(on?' sel':'')+'" data-shift="'+sh.id+'">'+esc(shiftLabel(sh))+'<small>'+hl(hrs)+' h</small></button>';
  }).join('');

  d.innerHTML=
    '<div class="sheet-head"><h3>'+esc(p.name)+'</h3><div class="who">'+DAYS[i]+' '+dshort(dates[i])+(p.pos?' · '+esc(p.pos):'')+'</div></div>'+
    '<div class="sheet-body">'+
      (S.shifts.length?'<div><label class="lbl">Shift</label><div class="opts">'+opts+'</div></div>':
        '<div class="note">No shift times saved yet. Add some on the <strong>Shift Times</strong> tab, or set the times below.</div>')+
      '<div><label class="lbl">Or a different kind of day</label><div class="opts">'+
        '<button class="opt st-off'+(cur&&cur.k==='OFF'?' sel':'')+'" data-kind="OFF">OFF</button>'+
        '<button class="opt st-ph'+(cur&&cur.k==='PH'?' sel':'')+'" data-kind="PH">Public holiday</button>'+
        '<button class="opt st-leave'+(cur&&cur.k==='LEAVE'?' sel':'')+'" data-kind="LEAVE">Leave</button>'+
      '</div></div>'+
      '<details><summary style="cursor:pointer;font-size:12.5px;color:var(--text-muted)">Set exact times just for this day</summary>'+
        '<div class="row" style="margin-top:10px;align-items:flex-end">'+
          '<div><label class="lbl" for="cStart">Start</label><input class="f" id="cStart" type="time" value="'+((cur&&cur.s)||'13:00')+'"></div>'+
          '<div><label class="lbl" for="cEnd">Finish</label><input class="f" id="cEnd" type="time" value="'+((cur&&cur.e)||'23:00')+'"></div>'+
          '<label class="row" style="gap:6px;font-size:12.5px;color:var(--text-muted)"><input type="checkbox" id="cCross"'+(cur&&cur.x?' checked':'')+'> Next day</label>'+
          '<button class="btn" id="cUse">Use these times</button>'+
        '</div></details>'+
    '</div>'+
    '<div class="sheet-foot">'+(cur?'<button class="btn danger" id="cClear">Clear this day</button>':'')+
      '<button class="btn" id="cClose">Close</button></div>';

  function put(c){
    logChange(p.name+', '+DAYS[i]+' '+dshort(dates[i])+': '+(cur?cellLabel(cur):'empty')+' -> '+(c?cellLabel(c):'cleared'));
    setCell(week,pid,i,c);touch();renderWeek();d.close();
  }
  bind('[data-shift]','click',function(el){
    var sh=S.shifts.filter(function(s){return s.id===el.getAttribute('data-shift')})[0];
    if(sh)put({k:'WORK',s:sh.s,e:sh.e,x:!!sh.x,sp:!!sh.sp,s2:sh.s2||'',e2:sh.e2||''});
  });
  bind('[data-kind]','click',function(el){put({k:el.getAttribute('data-kind')})});
  $('cUse').onclick=function(){
    var s=$('cStart').value,e=$('cEnd').value;
    if(!s||!e){alert('Enter a start and finish time.');return}
    put({k:'WORK',s:s,e:e,x:$('cCross').checked,sp:false,s2:'',e2:''});
  };
  if($('cClear'))$('cClear').onclick=function(){put(null)};
  $('cClose').onclick=function(){d.close()};
  d.showModal();
}

/* ------------------------------ actions ------------------------------ */
function addStaff(){
  var name=$('newName').value.trim();
  if(!name){$('newName').focus();return}
  logChange('Added staff: '+name+($('newPos').value?' ('+$('newPos').value+')':''));
  S.staff.push({id:uid(),name:name,pos:$('newPos').value});
  $('newName').value=''; touch(); render(); $('newName').focus();
}
function addPosition(){
  var v=$('newPosName').value.trim(); if(!v)return;
  if(S.positions.indexOf(v)<0){S.positions.push(v);logChange('Added position: '+v)}
  $('newPosName').value=''; touch(); renderStaff();
}
function addShift(){
  var s=$('shStart').value,e=$('shEnd').value,sp=$('shSplit').checked;
  if(!s||!e){alert('Enter a start and finish time.');return}
  var sh={id:uid(),s:s,e:e,x:$('shCross').checked,sp:sp,s2:sp?$('sh2Start').value:'',e2:sp?$('sh2End').value:''};
  if(sp&&(!sh.s2||!sh.e2)){alert('Enter both times for the second part of the split shift.');return}
  S.shifts.push(sh); logChange('Added shift time: '+shiftLabel(sh)); touch(); renderShifts();
}
function copyPreviousWeek(){
  var src=S.roster[addDays(week,-7)];
  if(!src){toast('There is no roster for the week before this one.');return}
  var n=0;
  activeStaff().forEach(function(p){
    var row=src[p.id]; if(!row)return;
    for(var i=0;i<7;i++){
      var c=row[i];
      /* the working pattern carries over; leave and holidays belong to their own week */
      if(!c||(c.k!=='WORK'&&c.k!=='OFF'))continue;
      if(cellOf(week,p.id,i))continue;
      setCell(week,p.id,i,JSON.parse(JSON.stringify(c))); n++;
    }
  });
  if(!n){toast('Nothing to copy — this week is already filled in.');return}
  logChange('Copied '+n+' shifts from the previous week into '+weekLabel(week));
  touch(); renderWeek(); toast('Copied '+n+' shifts from last week. Leave and holidays were not copied.',4000);
}

/* -------------------------------- PDF -------------------------------- */
/* A small PDF writer. No library: the file is assembled by hand so the
   page stays self-contained inside the artifact sandbox. */
function pdfText(s){
  return String(s).replace(/[–—]/g,'-').replace(/[‘’]/g,"'")
    .replace(/[“”]/g,'"').replace(/·/g,'-')
    .replace(/[^\x20-\x7E]/g,'')
    .replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)');
}
function textWidth(s,size){
  var w=0;
  for(var i=0;i<s.length;i++){
    var ch=s[i];
    if(ch===' ')w+=0.28; else if(':/.,-'.indexOf(ch)>=0)w+=0.30;
    else if('ilj'.indexOf(ch)>=0)w+=0.24;
    else if(ch>='A'&&ch<='Z')w+=0.68; else w+=0.53;
  }
  return w*size;
}
function T(x,y,size,font,str){return 'BT /'+font+' '+size+' Tf 1 0 0 1 '+x.toFixed(2)+' '+y.toFixed(2)+' Tm ('+pdfText(str)+') Tj ET\n'}
function Tc(cx,y,size,font,str){return T(cx-textWidth(String(str),size)/2,y,size,font,str)}
function box(x,y,w,h,rgb){return rgb+' rg '+x.toFixed(2)+' '+y.toFixed(2)+' '+w.toFixed(2)+' '+h.toFixed(2)+' re f\n'}
function ln(x1,y1,x2,y2,wd,rgb){return rgb+' RG '+wd+' w '+x1.toFixed(2)+' '+y1.toFixed(2)+' m '+x2.toFixed(2)+' '+y2.toFixed(2)+' l S\n'}

function buildWeekPdf(){
  var W=842,H=595,M=30;
  var dates=weekDates(week), team=teamFor(week);
  var nameW=132, hourW=48;
  var dayW=(W-2*M-nameW-hourW)/7;
  var headTop=H-M-46;      /* table header top */
  var rowH=team.length>14?24:(team.length>10?28:32);
  var pages=[], perPage=Math.max(1,Math.floor((headTop-M-40)/rowH));

  for(var start=0;start<Math.max(team.length,1);start+=perPage){
    var slice=team.slice(start,start+perPage);
    var c='';
    /* masthead */
    c+=box(0,H-M-30,W,30,'0.09 0.075 0.062');
    c+=box(0,H-M-33,W,3,'0.757 0.314 0.122');
    c+='1 1 1 rg '+T(M,H-M-21,15,'F2','SHAN VILLAGE');
    c+='0.85 0.78 0.62 rg '+T(M+128,H-M-21,10,'F1','Duty Roster');
    var wl='Week '+weekLabel(week);
    c+='1 1 1 rg '+T(W-M-textWidth(wl,11),H-M-21,11,'F2',wl);

    /* column headings */
    var y=headTop, x=M;
    c+=box(M,y-20,W-2*M,20,'0.953 0.925 0.863');
    c+='0.35 0.31 0.27 rg '+T(x+6,y-14,8,'F2','EMPLOYEE');
    x+=nameW;
    for(var i=0;i<7;i++){
      c+='0.35 0.31 0.27 rg '+Tc(x+dayW/2,y-13.5,8.5,'F2',DAYS[i].toUpperCase()+'  '+dshort(dates[i]));
      x+=dayW;
    }
    c+='0.35 0.31 0.27 rg '+Tc(x+hourW/2,y-14,8,'F2','HOURS');
    c+=ln(M,y-20,W-M,y-20,0.8,'0.82 0.76 0.65');

    /* rows */
    var ry=y-20;
    slice.forEach(function(p,idx){
      var top=ry, bot=ry-rowH, sum=0;
      if(idx%2===1)c+=box(M,bot,W-2*M,rowH,'0.988 0.976 0.949');
      c+='0.14 0.11 0.08 rg '+T(M+6,bot+rowH/2+1,9.5,'F2',p.name);
      if(p.pos)c+='0.55 0.5 0.42 rg '+T(M+6,bot+rowH/2-8.5,7,'F1',p.pos);
      var cx=M+nameW;
      for(var i2=0;i2<7;i2++){
        var cell=cellOf(week,p.id,i2); sum+=hoursOf(cell);
        c+=ln(cx,top,cx,bot,0.4,'0.89 0.85 0.77');
        if(cell){
          var lbl=cellLabel(cell);
          if(cell.k==='OFF'){
            c+=box(cx+4,bot+rowH/2-7,dayW-8,14,'0.925 0.898 0.835');
            c+='0.46 0.42 0.35 rg '+Tc(cx+dayW/2,bot+rowH/2-2.5,8.5,'F2','OFF');
          }else if(cell.k==='PH'||cell.k==='LEAVE'){
            var tone=cell.k==='PH'?'0.882 0.941 0.894':'0.965 0.925 0.827';
            var ink =cell.k==='PH'?'0.184 0.49 0.31':'0.663 0.471 0.118';
            c+=box(cx+4,bot+rowH/2-7,dayW-8,14,tone);
            c+=ink+' rg '+Tc(cx+dayW/2,bot+rowH/2-2.5,8.5,'F2',cell.k==='PH'?'PUBLIC HOL':'LEAVE');
          }else if(cell.sp&&cell.s2&&cell.e2){
            c+='0.14 0.11 0.08 rg '+Tc(cx+dayW/2,bot+rowH/2+1.5,8,'F1',cell.s+'-'+cell.e);
            c+='0.14 0.11 0.08 rg '+Tc(cx+dayW/2,bot+rowH/2-7.5,8,'F1',cell.s2+'-'+endLabel(cell.e2,cell.x));
          }else{
            c+='0.14 0.11 0.08 rg '+Tc(cx+dayW/2,bot+rowH/2-2.5,9,'F1',lbl);
          }
        }else{
          c+='0.72 0.68 0.6 rg '+Tc(cx+dayW/2,bot+rowH/2-2.5,9,'F1','-');
        }
        cx+=dayW;
      }
      c+=ln(cx,top,cx,bot,0.4,'0.89 0.85 0.77');
      c+='0.14 0.11 0.08 rg '+Tc(cx+hourW/2,bot+rowH/2-2.5,9,'F2',sum?hl(sum):'-');
      c+=ln(M,bot,W-M,bot,0.4,'0.89 0.85 0.77');
      ry=bot;
    });

    /* frame + footer */
    c+=ln(M,headTop,W-M,headTop,0.8,'0.82 0.76 0.65');
    c+=ln(M,headTop,M,ry,0.8,'0.82 0.76 0.65');
    c+=ln(W-M,headTop,W-M,ry,0.8,'0.82 0.76 0.65');
    c+=ln(M,ry,W-M,ry,0.8,'0.82 0.76 0.65');
    var foot='Published '+stampText(S.pub)+' '+TZ_LABEL+'   |   Hours shown are start to finish, no break deducted';
    c+='0.55 0.5 0.42 rg '+T(M,M-4,7.5,'F1',foot);
    var pg='Page '+(pages.length+1);
    c+='0.55 0.5 0.42 rg '+T(W-M-textWidth(pg,7.5),M-4,7.5,'F1',pg);
    pages.push(c);
    if(!team.length)break;
  }
  return assemblePdf(pages,W,H);
}

function assemblePdf(streams,W,H){
  var n=streams.length;
  var objs=[], out='%PDF-1.4\n';
  /* 1 catalog, 2 pages, 3..2+n pages, then contents, then 2 fonts */
  var kids=[]; for(var i=0;i<n;i++)kids.push((3+i)+' 0 R');
  var fontA=3+2*n, fontB=fontA+1;
  objs.push('<< /Type /Catalog /Pages 2 0 R >>');
  objs.push('<< /Type /Pages /Kids ['+kids.join(' ')+'] /Count '+n+' >>');
  for(i=0;i<n;i++){
    objs.push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 '+W+' '+H+'] '
      +'/Resources << /Font << /F1 '+fontA+' 0 R /F2 '+fontB+' 0 R >> >> '
      +'/Contents '+(3+n+i)+' 0 R >>');
  }
  for(i=0;i<n;i++){
    objs.push('<< /Length '+streams[i].length+' >>\nstream\n'+streams[i]+'endstream');
  }
  objs.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  objs.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');

  var offsets=[];
  objs.forEach(function(o,idx){
    offsets.push(out.length);
    out+=(idx+1)+' 0 obj\n'+o+'\nendobj\n';
  });
  var xref=out.length;
  out+='xref\n0 '+(objs.length+1)+'\n0000000000 65535 f \n';
  offsets.forEach(function(o){out+=('0000000000'+o).slice(-10)+' 00000 n \n'});
  out+='trailer\n<< /Size '+(objs.length+1)+' /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF';

  var bytes=new Uint8Array(out.length);
  for(i=0;i<out.length;i++)bytes[i]=out.charCodeAt(i)&0xFF;
  return bytes;
}

async function exportPdf(){
  var name='Shan-Village-Roster-'+week+'.pdf';
  var bytes;
  try{ bytes=buildWeekPdf() }
  catch(e){ toast('Could not build the PDF. Use Print instead.',4000); return }

  if(dl){
    try{
      await dl.save({filename:name,data:bytes});
      toast('PDF saved. Attach it to your WhatsApp group.',4000);
      return;
    }catch(err){
      var code=(err&&err.code)||'unavailable';
      if(code==='declined')return;
      if(code==='extension_not_enabled'||code==='rejected_extension'){
        fallbackPrint('Opening the print window — choose "Save as PDF" to get the file.');
        return;
      }
      if(code==='rate_limited'){ toast('One download at a time. Try again in a moment.',3500); return }
    }
  }
  fallbackPrint('Opening the print window — choose "Save as PDF", then attach it to WhatsApp.');
}
function fallbackPrint(msg){
  toast(msg,4500);
  setTimeout(function(){window.print()},900);
}

/* -------------------------------- start ------------------------------ */
var OPEN_TABS=['timetable'];          /* what a locked viewer may see */
function selectTab(id){
  tab=id.replace('tab-','');
  if(readOnly&&OPEN_TABS.indexOf(tab)<0){ id='tab-timetable'; tab='timetable' }
  if(tab==='log'&&!seesLog()){ id='tab-timetable'; tab='timetable' }
  Array.prototype.forEach.call(document.querySelectorAll('nav.tabs button'),function(t){
    var on=t.id===id;
    t.setAttribute('aria-selected',on?'true':'false');
    $(t.getAttribute('aria-controls')).hidden=!on;
  });
  try{localStorage.setItem('sv-tab',tab)}catch(e){}
}
function persistWeek(){try{localStorage.setItem('sv-week',week)}catch(e){}}

/* Appearance is a personal setting: stored in this browser only, never
   written into the roster, so it is not published to anyone else. */
function applyMode(m){
  if(m==='light'||m==='dark')document.body.setAttribute('data-mode',m);
  else document.body.removeAttribute('data-mode');
  Array.prototype.forEach.call(document.querySelectorAll('.themer button'),function(b){
    b.setAttribute('aria-pressed', b.getAttribute('data-mode')===m ? 'true' : 'false');
  });
  try{localStorage.setItem('sv-mode',m)}catch(e){}
}
function initMode(){
  var m='auto';
  try{ var v=localStorage.getItem('sv-mode'); if(v==='light'||v==='dark'||v==='auto')m=v }catch(e){}
  applyMode(m);
  Array.prototype.forEach.call(document.querySelectorAll('.themer button'),function(b){
    b.onclick=function(){applyMode(b.getAttribute('data-mode'))};
  });
}

function wire(){
  $('prevWeek').onclick=function(){week=addDays(week,-7);persistWeek();renderWeek()};
  $('nextWeek').onclick=function(){week=addDays(week,7);persistWeek();renderWeek()};
  $('thisWeek').onclick=function(){week=mondayOf(new Date());persistWeek();renderWeek()};
  $('weekJump').onchange=function(){week=$('weekJump').value;persistWeek();renderWeek()};
  $('copyPrev').onclick=copyPreviousWeek;
  $('pdfBtn').onclick=exportPdf;
  $('pdfBtn2').onclick=exportPdf;
  $('pubBtn').onclick=publish;
  $('lockBtn').onclick=lockButtonClicked;
  $('refreshBtn').onclick=refreshClicked;
  $('lockSet').onclick=askSetCodes;
  $('prevMonth').onclick=function(){monthCur=shiftMonth(monthCur,-1);renderMonth()};
  $('nextMonth').onclick=function(){monthCur=shiftMonth(monthCur,1);renderMonth()};
  $('monthPrint').onclick=function(){
    $('phMonth').textContent=monthTitle(monthCur)+'  -  '+monthRange(monthCur);
    $('phMonthMeta').textContent='Overtime counted above '+otLimit()+' hours a day  -  '+
      (S.pub?'published '+stampText(S.pub):'draft');
    window.print();
  };
  $('monthCut').onchange=function(){
    var v=Number($('monthCut').value);
    if(!isFinite(v)||v<1||v>28){$('monthCut').value=monthCut();return}
    v=Math.round(v);
    if(v===monthCut())return;
    logChange('Payroll month now starts on the '+v+' of the month before');
    S.mcut=v; touch();
    monthCur=monthOf(iso(new Date()));
    renderMonth();
  };
  $('otLimit').onchange=function(){
    var v=Number($('otLimit').value);
    if(!isFinite(v)||v<1||v>24){$('otLimit').value=otLimit();return}
    if(v===otLimit())return;
    logChange('Overtime limit changed to '+v+' hours a day');
    S.ot=v; touch(); renderMonth();
  };
  $('addStaff').onclick=addStaff;
  $('newName').onkeydown=function(e){if(e.key==='Enter')addStaff()};
  $('addPos').onclick=addPosition;
  $('newPosName').onkeydown=function(e){if(e.key==='Enter')addPosition()};
  $('addShift').onclick=addShift;
  $('shSplit').onchange=function(){$('shSeg2').hidden=!$('shSplit').checked};
  Array.prototype.forEach.call(document.querySelectorAll('nav.tabs button'),function(t){
    t.onclick=function(){selectTab(t.id)};
  });
}

var restored=loadDraft();

/* A roster that has a code opens locked. An unlock survives the reload that
   publishing causes, but not a new tab or a new day. */
role=null;
if(!hasLocks()) role='admin';                 /* fresh page: allow first setup */
else { try{ var r0=sessionStorage.getItem('sv-role'); if(r0==='owner'||r0==='admin'||r0==='chef')role=r0 }catch(e){} }

document.getElementById('root').innerHTML=SHELL;
initMode();
wire();
selectTab('tab-'+tab);
if(restored)dirty=true;
readOnly=true;               /* until we know whether this viewer can write */
render();

(async function(){
  try{ api = (window.claude&&window.claude.use) ? await window.claude.use('artifact') : null }catch(e){ api=null }
  try{ dl  = (window.claude&&window.claude.use) ? await window.claude.use('downloads') : null }catch(e){ dl=null }
  apiReady = !!api;
  refreshMode();
  armIdleLock();
  if(restored) toast('Restored changes you had not published yet.',4000);
})();
})();
