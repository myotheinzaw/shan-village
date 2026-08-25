
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
/* The office roles - the three that may look back past today and change
   settings. Staff is deliberately not one of them. */
/* Reports, corrections and settings are the office's: owner and admin.
   A chef signs in like the kitchen does, to record wastage. */
function isOffice(){return role==='owner'||role==='admin'}
/* Sending needs a code only once a staff code exists. Until then the link
   behaves as it always has: open it and send. */
function needsCode(){var l=getLocks();return !!(l&&l.staff)}
function canSend(){return !needsCode()||role!==null}
function roleName(r){return r==='chef'?'Chef':(r==='admin'?'Admin':(r==='owner'?'Owner':(r==='staff'?'Staff':'')))}

function refreshMode(){
  document.body.classList.toggle('is-office',isOffice());
  var gate=$('sendGate'); if(gate)gate.hidden=canSend();
  var form=$('sendForm'); if(form)form.hidden=!canSend();
  ['tab-history','tab-settings'].forEach(function(id){
    var b=$(id); if(b)b.hidden=!isOffice();
  });
  if(!isOffice()&&(tab==='history'||tab==='settings'))selectTab('tab-add');
  var b=$('lockBtn');
  var shut='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><rect x="4" y="10.5" width="16" height="10.5" rx="2"/><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5"/></svg>';
  var open='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><rect x="4" y="10.5" width="16" height="10.5" rx="2"/><path d="M8 10.5V7a4 4 0 0 1 7.8-1.3"/></svg>';
  if(role===null){b.className='btn-lock';b.innerHTML=shut+(needsCode()?'Sign in':'Office')}
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
  if(role===null)return;
  /* Staff stay signed in across a shift; the office locks sooner. */
  var ms = role==='staff' ? 28800000 : 900000;
  idleTimer=setTimeout(function(){
    if(role!==null){lockNow(true);toast('Signed out after a while without use.',4000)}
  },ms);
}
['pointerdown','keydown'].forEach(function(ev){
  document.addEventListener(ev,function(){ if(role!==null)armIdle() },{passive:true});
});

function sheet(html){var d=$('sheet');d.innerHTML=html;d.showModal();return d}
function askUnlock(){
  if(!cryptoOk()){toast('This browser cannot check the code.',4000);return}
  var d=sheet('<div class="sheet"><div class="sheet-head"><h3>Sign in</h3>'+
    '<div class="who">Staff code to send wastage. Owner, admin or chef code for everything else.</div></div>'+
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
    else if(l.staff&&await codeHash(v,l.staff.salt)===l.staff.hash)m='staff';
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
function lockClicked(){ role!==null?lockNow():askUnlock() }

/* Changing the staff code is worth a line in the change log: it is the
   moment every phone that had the old one stops being able to send. */
function logStaffCodeChange(){
  if(!S.log)S.log=[];
  S.log.unshift({t:new Date().toISOString(),who:role,items:['Staff code changed'],more:0});
}
function staffCodeState(){
  var e=$('staffCodeState'); if(!e)return;
  var l=getLocks()||{};
  e.textContent = l.staff
    ? 'A staff code is set. Everyone sending wastage needs it. Type a new one here to replace it.'
    : 'No staff code yet - anyone with the link can send. Type one here to require it.';
}
