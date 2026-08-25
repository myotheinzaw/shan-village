
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
  $('sendState').innerHTML='<div class="note-box bad">'+
    '<strong>Nothing can be sent from this phone yet.</strong><br>'+
    'The page has opened in view-only mode. That happens when this phone is '+
    'signed out of Claude - use the <strong>Sign in</strong> button at the very top of the screen - '+
    'or when the account you signed in with was given the link to view but not to edit; '+
    'the office has to share it again with editing allowed.'+
    '<div style="margin-top:9px"><button class="btn" id="roReload">Reload and try again</button></div></div>';
  var rb=$('roReload'); if(rb)rb.onclick=function(){location.reload()};
  var sb=$('sendBtn');
  if(sb){sb.disabled=true; sb.textContent='Sending is off - view only'}
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
  if(await pushEntry(e,1)){ clearForm(); render(); selectTab('tab-today') }
}
