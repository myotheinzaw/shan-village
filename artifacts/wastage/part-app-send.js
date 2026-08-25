
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

/* Sending a wastage entry republishes this page, and only a signed-in
   Claude account with edit access to the link may do that. A phone that
   is signed out, or signed in to an account the link was shared with
   view-only, lands here - so say which it is and what to do about it. */
function goReadOnly(){
  readOnly=true;
  $('sendState').innerHTML='<div class="note-box warn">'+
    '<strong>This phone cannot reach the office yet.</strong><br>'+
    'The page has opened in view-only mode - that happens when the phone is signed out of Claude '+
    '(use <strong>Sign in</strong> at the very top of the screen), or when the account it is signed '+
    'in to was given the link to read but not to edit. '+
    '<strong>Keep recording anyway:</strong> what you enter is saved on this phone, shown in Today, '+
    'and sent the moment the page can be written to.'+
    '<div class="row no-print" style="margin-top:9px;gap:7px">'+
      '<button class="btn" id="roReload">Reload and try again</button></div></div>';
  var rb=$('roReload'); if(rb)rb.onclick=function(){location.reload()};
  syncSendBtn();
  renderStamp();
}
/* The button says what pressing it will actually do. */
function syncSendBtn(){
  var b=$('sendBtn'); if(!b||sending)return;
  b.disabled=false;
  b.textContent=(apiKnown&&(readOnly||!api))?'Save on this phone':'Send wastage';
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

var lastSendCode='';
async function pushEntry(entry,tries){
  if(sending)return false;
  if(!api){lastSendCode='not_writer';goReadOnly();return false}
  sending=true; $('sendBtn').disabled=true; $('sendBtn').textContent='Sending…';
  stash(entry,tries||1);
  S.entries.unshift(entry);
  var dropped=shedPhotos();
  var prevPub=S.pub, prevRev=S.rev||0;
  S.pub=new Date().toISOString(); S.rev=prevRev+1;
  try{
    await api.publish(buildDocument());
    clearStash();
    sending=false; lastSendCode='';
    toast('Sent. Thank you.'+(dropped?' Older pictures were cleared to make room.':''),3200);
    return true;
  }catch(err){
    S.entries=S.entries.filter(function(x){return x.id!==entry.id});
    S.pub=prevPub; S.rev=prevRev;
    sending=false; syncSendBtn();
    var code=(err&&err.code)||'upstream_error';
    lastSendCode=code;
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

/* Nothing a cook types is thrown away because the link happens to be
   read-only. It goes into this phone's own store, appears in Today at
   once, and waits there to be sent. */
function keepOnPhone(e){
  e.local=true; e.savedAt=new Date().toISOString();
  LOCAL.unshift(e);
  var kept=saveLocal();
  clearForm(); render(); selectTab('tab-today');
  toast(kept
    ? 'Saved on this phone. It is in Today, but the office has not received it yet.'
    : 'Saved for now, but this phone has no room to keep it after a reload. Forward it as text.',5200);
}
async function flushLocal(quiet){
  if(!api||readOnly||!LOCAL.length)return 0;
  var sent=0;
  while(LOCAL.length){
    var e=LOCAL[LOCAL.length-1];              /* oldest first */
    var copy={}; for(var k in e){ if(k!=='local'&&k!=='savedAt')copy[k]=e[k] }
    var ok=await pushEntry(copy,1);
    if(!ok)break;
    LOCAL.pop(); saveLocal(); sent++;
  }
  render();
  if(sent&&!quiet)toast(sent+(sent===1?' entry has':' entries have')+' now reached the office.',4000);
  else if(!sent&&!quiet)toast('Still not able to send from this phone.',4000);
  return sent;
}
function localAsText(){
  var out=['Shan Village - wastage held on this phone'];
  LOCAL.slice().reverse().forEach(function(e){
    out.push('- '+fmtDay(e.d)+' '+(e.t||'')+'  '+(e.item||'(not named)')+
      (qtyText(e)?'  '+qtyText(e):'')+
      (e.price!=null&&e.price!==''?'  '+money(e.price):'')+
      (e.reason?'  ['+e.reason+']':'')+
      (e.by?'  by '+e.by:'')+
      (e.note?'  note: '+e.note:''));
  });
  out.push('('+LOCAL.length+(LOCAL.length===1?' entry':' entries')+'; pictures are not in this text)');
  return out.join('\n');
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
    by:$('fBy').value.trim(),
    role:role||''
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
  if(!api||readOnly){ keepOnPhone(e); return }
  if(await pushEntry(e,1)){ clearForm(); render(); selectTab('tab-today'); return }
  /* A conflict is already being retried from the stash after the reload;
     anything else leaves the entry with nowhere to go, so keep it here. */
  if(lastSendCode!=='conflict')keepOnPhone(e);
}
