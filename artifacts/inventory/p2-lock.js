
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
