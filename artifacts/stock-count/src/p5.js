
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
function getLocks(){ return S.locks||null }
function hasLocks(){ var l=getLocks(); return !!(l&&(l.admin||l.counter)) }
function canEdit(){ return role!==null }
function roleName(r){ return r==='counter'?'Counter':(r==='admin'?'Admin':'') }

function refreshMode(){
  readOnly=!canEdit();
  document.body.classList.toggle('readonly',readOnly);
  document.body.classList.toggle('is-admin',role==='admin');
  var n=$('roNote');
  if(n)n.innerHTML = hasLocks()
    ? '<strong>Read only.</strong> This is the live count. To add or change an item, press the lock and enter your code.'
    : '<strong>Read only.</strong> No lock code has been set yet — ask the office to set one before the count starts.';
  renderLockButton();
  if(tab==='setup'&&role!=='admin')selectTab('tab-stock');
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
    '<div class="sheet-head"><div><h3>Unlock to count</h3><div class="who">Enter the counter or admin code.</div></div></div>'+
    '<div class="sheet-body"><div id="lkErr"></div>'+
    '<div><label class="lbl" for="lkCode">Lock code</label>'+
    '<input class="f pin" id="lkCode" type="password" autocomplete="off"></div>'+
    '<div class="note">Without a code the count can be read but not changed.</div>'+
    '</div><div class="sheet-foot"><button type="button" class="btn" id="lkCancel">Cancel</button>'+
    '<button type="button" class="btn primary" id="lkGo">Unlock</button></div>');
  var go=async function(){
    var v=$('lkCode').value; if(!v)return;
    var l=getLocks()||{}, matched=null;
    if(l.admin&&await codeHash(v,l.admin.salt)===l.admin.hash)matched='admin';
    else if(l.counter&&await codeHash(v,l.counter.salt)===l.counter.hash)matched='counter';
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
  if(hasLocks()&&role!=='admin'){toast('Only the admin code can change the lock codes.',4000);return}
  var l=getLocks()||{};
  var d=sheet('lockSheet',
    '<div class="sheet-head"><div><h3>Lock codes</h3><div class="who">One for the office, one for whoever walks the shelves. Leave a box empty to keep that code as it is.</div></div></div>'+
    '<div class="sheet-body"><div id="lkErr"></div>'+
    '<div><label class="lbl" for="lkAdmin">Admin code</label><input class="f pin" id="lkAdmin" type="text" autocomplete="off" placeholder="'+(l.admin?'unchanged':'not set')+'"></div>'+
    '<div><label class="lbl" for="lkCounter">Counter code</label><input class="f pin" id="lkCounter" type="text" autocomplete="off" placeholder="'+(l.counter?'unchanged':'not set')+'"></div>'+
    '<div class="note">At least 6 characters each, and different from one another. Write them down somewhere safe — nobody can read them back out of this page.</div>'+
    '</div><div class="sheet-foot"><button type="button" class="btn" id="lkCancel">Cancel</button>'+
    '<button type="button" class="btn primary" id="lkGo">Save codes</button></div>');
  $('lkCancel').onclick=function(){closeSheet(d)};
  $('lkGo').onclick=async function(){
    var a=$('lkAdmin').value.trim(), c=$('lkCounter').value.trim();
    var err=function(m){$('lkErr').innerHTML='<div class="note bad">'+esc(m)+'</div>'};
    if(!a&&!c){err('Type at least one code.');return}
    if(a&&a.length<6){err('The admin code needs at least 6 characters.');return}
    if(c&&c.length<6){err('The counter code needs at least 6 characters.');return}
    if(a&&c&&a===c){err('The two codes must be different.');return}
    var next=Object.assign({},l);
    if(a){var sa=randSalt();next.admin={salt:sa,hash:await codeHash(a,sa)}}
    if(c){var sc=randSalt();next.counter={salt:sc,hash:await codeHash(c,sc)}}
    if(!next.admin){err('Set an admin code as well — without one nobody can change these settings later.');return}
    S.locks=next;
    role='admin';
    try{sessionStorage.setItem('sv-inv-role','admin')}catch(e){}
    closeSheet(d);
    mark('Changed the lock codes');
    refreshMode();
    toast('Codes saved. Publish now so they take effect for everyone.',5500);
  };
  setTimeout(function(){try{$('lkAdmin').focus()}catch(e){}},60);
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
if(!hasLocks())role='admin';        /* a brand-new page: let the office set up */
else{ try{var r0=sessionStorage.getItem('sv-inv-role'); if(r0==='admin'||r0==='counter')role=r0}catch(e){} }

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
