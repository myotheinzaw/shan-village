
/* ------------------------------- locks ------------------------------ */

/* The code itself is never stored. Only a salted SHA-256 of it, so a
   viewer reading the page source still cannot work out the code. */
function cryptoOk(){ return !!(window.crypto&&crypto.subtle&&crypto.subtle.digest&&crypto.getRandomValues) }
function hex(u8){ return Array.prototype.map.call(u8,function(b){return ('0'+b.toString(16)).slice(-2)}).join('') }
function randSalt(){ var a=new Uint8Array(8); crypto.getRandomValues(a); return hex(a) }
async function codeHash(code,salt){
  var d=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(salt+LOCK_SALT_NS+String(code)));
  return hex(new Uint8Array(d));
}
/* Three codes, the same three the duty roster uses. Owner and Admin can
   do everything and read the change log; Chef counts stock. */
var ROLE_LABEL={owner:'Owner',admin:'Admin',chef:'Chef'};
function getLocks(){
  var l=S.locks;
  if(!l)return null;
  /* An early version of this page called the counting code "counter". */
  if(l.counter&&!l.chef){ l=Object.assign({},l); l.chef=l.counter; delete l.counter }
  return l;
}
function hasLocks(){
  var l=getLocks(); if(!l)return false;
  for(var i=0;i<ROLES.length;i++)if(l[ROLES[i]])return true;
  return false;
}
function canEdit(){ return role!==null }
function isOffice(){ return role==='owner'||role==='admin' }
function roleName(r){ return ROLE_LABEL[r]||'' }

function refreshMode(){
  readOnly=!canEdit();
  document.body.classList.toggle('readonly',readOnly);
  document.body.classList.toggle('is-office',isOffice());
  var n=$('roNote');
  if(n)n.innerHTML = hasLocks()
    ? '<strong>Read only.</strong> This is the live count. To add or change an item, press the lock and enter your code — the same one you use for the duty roster.'
    : '<strong>Read only.</strong> No lock code has been set yet — ask the office to set one before the count starts.';
  renderLockButton();
  if(tab==='setup'&&!isOffice())selectTab('tab-stock');
  else render();
}

function renderLockButton(){
  var b=$('lockBtn'); if(!b)return;
  if(!cryptoOk()){b.hidden=true;return}
  b.hidden=false;
  var shut='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><rect x="4" y="10.5" width="16" height="10.5" rx="2"/><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5"/></svg>';
  var open='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><rect x="4" y="10.5" width="16" height="10.5" rx="2"/><path d="M8 10.5V7a4 4 0 0 1 7.7-1.6"/></svg>';
  if(canEdit()){ b.className='btn-lock open'; b.innerHTML=open+roleName(role)+' — lock' }
  else{ b.className='btn-lock'; b.innerHTML=shut+(hasLocks()?'Unlock':'Set lock code') }
}
function lockButtonClicked(){ if(canEdit())lockNow(); else if(hasLocks())askUnlock(); else askSetCodes() }
function lockNow(quiet){
  role=null; clearTimeout(idleTimer);
  try{sessionStorage.removeItem('sv-inv-role')}catch(e){}
  refreshMode(); if(!quiet)toast('Locked.');
}
function unlockAs(r){
  role=r;
  try{sessionStorage.setItem('sv-inv-role',r)}catch(e){}
  armIdleLock(); refreshMode();
  toast('Unlocked as '+roleName(r)+'. Publish when the count is done.',4000);
}
function goReadOnly(reason){
  role=null; dirty=false; pending=[];
  try{sessionStorage.removeItem('sv-inv-role')}catch(e){}
  refreshMode();
  if(reason)toast(reason,5000);
}
/* A phone put down on the pass should not stay editable. */
function armIdleLock(){
  clearTimeout(idleTimer);
  if(!canEdit()||!hasLocks())return;
  idleTimer=setTimeout(function(){
    if(canEdit()){lockNow(true);toast('Locked again after 20 minutes without use.',4500)}
  },1200000);
}
['pointerdown','keydown'].forEach(function(ev){
  document.addEventListener(ev,function(){ if(canEdit()&&hasLocks())armIdleLock() },{passive:true});
});

function askUnlock(){
  var d=sheet('lockSheet',
    '<div class="sheet-head"><div><h3>Unlock to count</h3><div class="who">Your owner, admin or chef code — the same one as the duty roster.</div></div></div>'+
    '<div class="sheet-body"><div id="lkErr"></div>'+
    '<div><label class="lbl" for="lkCode">Lock code</label>'+
    '<input class="f pin" id="lkCode" type="password" autocomplete="off"></div>'+
    '<div class="note">Without a code the count can be read but not changed.</div>'+
    '</div><div class="sheet-foot"><button type="button" class="btn" id="lkCancel">Cancel</button>'+
    '<button type="button" class="btn primary" id="lkGo">Unlock</button></div>');
  var go=async function(){
    var v=$('lkCode').value.trim(); if(!v)return;
    var l=getLocks()||{}, matched=null;
    for(var i=0;i<ROLES.length&&!matched;i++){
      var r=ROLES[i];
      if(l[r]&&await codeHash(v,l[r].salt)===l[r].hash)matched=r;
    }
    if(!matched){
      $('lkErr').innerHTML='<div class="note bad">That code does not match. Check with the office.</div>';
      $('lkCode').value=''; $('lkCode').focus(); return;
    }
    closeSheet(d); unlockAs(matched);
  };
  $('lkCancel').onclick=function(){closeSheet(d)};
  $('lkGo').onclick=go;
  $('lkCode').onkeydown=function(e){if(e.key==='Enter')go()};
  setTimeout(function(){try{$('lkCode').focus()}catch(e){}},60);
}

function askSetCodes(){
  if(hasLocks()&&!isOffice()){toast('Only the owner or admin code can change the lock codes.',4500);return}
  var l=getLocks()||{};
  var box=function(r,hint){
    return '<div><label class="lbl" for="lk-'+r+'">'+ROLE_LABEL[r]+' code'+
      ' <span class="faint" style="text-transform:none;letter-spacing:0;font-weight:400">— '+hint+'</span></label>'+
      '<input class="f pin" id="lk-'+r+'" type="text" autocomplete="off" placeholder="'+(l[r]?'unchanged':'not set')+'"></div>';
  };
  var d=sheet('lockSheet',
    '<div class="sheet-head"><div><h3>Lock codes</h3><div class="who">Keep these the same as the duty roster so nobody has to remember two. Leave a box empty to keep that code as it is.</div></div></div>'+
    '<div class="sheet-body"><div id="lkErr"></div>'+
    box('owner','everything, and reads the change log')+
    box('admin','everything, and reads the change log')+
    box('chef','counts stock: add and edit items')+
    '<div class="note">At least 6 characters each, and all three different from one another. Write them down somewhere safe — nobody can read them back out of this page.</div>'+
    '</div><div class="sheet-foot"><button type="button" class="btn" id="lkCancel">Cancel</button>'+
    '<button type="button" class="btn primary" id="lkGo">Save codes</button></div>');
  $('lkCancel').onclick=function(){closeSheet(d)};
  $('lkGo').onclick=async function(){
    var err=function(m){$('lkErr').innerHTML='<div class="note bad">'+esc(m)+'</div>'};
    var typed={}, any=false;
    for(var i=0;i<ROLES.length;i++){
      var r=ROLES[i], v=$('lk-'+r).value.trim();
      if(!v)continue;
      if(v.length<6){err('The '+ROLE_LABEL[r].toLowerCase()+' code needs at least 6 characters.');return}
      typed[r]=v; any=true;
    }
    if(!any){err('Type at least one code.');return}
    var seen={};
    for(var k in typed){
      if(seen[typed[k]]){err('All three codes must be different from one another.');return}
      seen[typed[k]]=1;
    }
    var next=Object.assign({},l);
    for(var r2 in typed){ var salt=randSalt(); next[r2]={salt:salt,hash:await codeHash(typed[r2],salt)} }
    if(!next.owner&&!next.admin){err('Set an owner or admin code as well — without one nobody can change these settings later.');return}
    S.locks=next;
    if(!isOffice())role=next.owner?'owner':'admin';
    try{sessionStorage.setItem('sv-inv-role',role)}catch(e){}
    closeSheet(d);
    mark('Changed the lock codes');
    refreshMode();
    toast('Codes saved. Publish now so they take effect for everyone.',5500);
  };
  setTimeout(function(){try{$('lk-owner').focus()}catch(e){}},60);
}

/* ------------------------------ publish ----------------------------- */

function buildDocument(){
  var css=document.getElementById('appStyle').textContent;
  var app=document.getElementById('app').textContent;
  var json=JSON.stringify(S).replace(/</g,'\\u003c');
  return '<!doctype html><html lang="en"><head><meta charset="utf-8">'
    +'<meta name="viewport" content="width=device-width,initial-scale=1">'
    +'<title>Shan Village Stock Count<\/title>'
    +'<link rel="preconnect" href="https://fonts.googleapis.com">'
    +'<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
    +'<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap">'
    +'<style id="appStyle">'+css+'<\/style></head><body><div id="root"></div>'
    +'<script id="state" type="application/json">'+json+'<\/script>'
    +'<script id="app">'+app+'<\/script></body></html>';
}

async function publish(){
  if(!canEdit()||publishing||!dirty)return;
  if(!api){goReadOnly('Saving is not available in this view.');return}
  publishing=true; renderPublish();
  var prevPub=S.pub, prevRev=S.rev||0, prevLog=S.log?S.log.slice():null;
  S.pub=new Date().toISOString(); S.rev=prevRev+1;
  if(pending.length){
    if(!S.log)S.log=[];
    S.log.push({t:S.pub,who:role,items:pending.slice(0,60),more:Math.max(0,pending.length-60)});
    if(S.log.length>300)S.log=S.log.slice(-300);
  }
  try{
    await api.publish(buildDocument());
    dirty=false; pending=[]; clearDraft(); publishing=false;
    renderPublish();
    toast('Published. Everyone on the link sees this count now.',4000);
  }catch(err){
    S.pub=prevPub; S.rev=prevRev; if(prevLog)S.log=prevLog;
    publishing=false;
    var code=(err&&err.code)||'';
    if(code==='conflict'){
      toast('Someone else published first. This page is about to reload with their version.',6000);
      return;                      /* every view reloads to the winner */
    }
    if(code==='not_granted'||code==='not_writer'){
      goReadOnly('This link can read the count but not change it. Ask the office for an editing link.');
      return;
    }
    renderPublish();
    toast('Could not publish. Check the connection and press Publish again.',5000);
  }
}

/* ------------------------- theme, wiring, boot ---------------------- */

function applyMode(m){
  if(m==='light'||m==='dark')document.body.setAttribute('data-mode',m);
  else document.body.removeAttribute('data-mode');
  Array.prototype.forEach.call(document.querySelectorAll('.themer button'),function(b){
    b.setAttribute('aria-pressed',b.getAttribute('data-mode')===m?'true':'false');
  });
  try{localStorage.setItem('sv-inv-mode',m)}catch(e){}
}
function initMode(){
  var m='auto';
  try{var v=localStorage.getItem('sv-inv-mode'); if(v==='light'||v==='dark'||v==='auto')m=v}catch(e){}
  applyMode(m);
  Array.prototype.forEach.call(document.querySelectorAll('.themer button'),function(b){
    b.onclick=function(){applyMode(b.getAttribute('data-mode'))};
  });
}

function wire(){
  ['stock','overview','export','setup'].forEach(function(k){
    $('tab-'+k).onclick=function(){selectTab('tab-'+k)};
  });
  $('q').oninput=function(){f.q=this.value;renderStock()};
  $('sortBy').onchange=function(){f.sort=this.value;renderStock()};
  $('vCards').onclick=function(){view='cards';try{localStorage.setItem('sv-inv-view','cards')}catch(e){}renderStock()};
  $('vTable').onclick=function(){view='table';try{localStorage.setItem('sv-inv-view','table')}catch(e){}renderStock()};
  $('fabAdd').onclick=function(){openForm(null)};
  $('lockBtn').onclick=lockButtonClicked;
  $('pubBtn').onclick=publish;
  $('setCodes').onclick=askSetCodes;
  $('csvAll').onclick=function(){downloadCsv(items(),'Full')};
  $('csvAction').onclick=function(){downloadCsv(attentionList(),'Attention')};
  $('copyTsv').onclick=function(){copyTsv(items())};
  $('savePhotos').onclick=saveAllPhotos;
  document.addEventListener('keydown',function(e){
    if(e.key==='n'&&(e.metaKey||e.ctrlKey)&&canEdit()){e.preventDefault();openForm(null)}
  });
  window.addEventListener('beforeunload',function(e){
    if(dirty){e.preventDefault();e.returnValue=''}
  });
}

/* --------------------------------- go -------------------------------- */

var restored=loadDraft();
try{var t0=localStorage.getItem('sv-inv-tab'); if(['stock','overview','export','setup'].indexOf(t0)>=0)tab=t0}catch(e){}
try{var v0=localStorage.getItem('sv-inv-view'); if(v0==='cards'||v0==='table')view=v0}catch(e){}

role=null;
if(!hasLocks())role='owner';        /* a brand-new page: let the office set up */
else{ try{var r0=sessionStorage.getItem('sv-inv-role'); if(ROLES.indexOf(r0)>=0)role=r0}catch(e){} }

document.getElementById('root').innerHTML=SHELL;
initMode();
wire();
selectTab('tab-'+tab);
if(restored)dirty=true;
readOnly=true;
refreshMode();

(async function(){
  try{ api = (window.claude&&window.claude.use) ? await window.claude.use('artifact') : null }catch(e){ api=null }
  try{ dl  = (window.claude&&window.claude.use) ? await window.claude.use('downloads') : null }catch(e){ dl=null }
  apiReady=!!api;
  refreshMode();
  armIdleLock();
  if(restored)toast('Restored the count you had not published yet.',4500);
})();
})();
