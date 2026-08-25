
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
/* Saving republishes this page, and only a signed-in Claude account with
   edit access to the link may do that. Say which half is missing. */
function goReadOnly(){
  readOnly=true;
  $('banner').innerHTML='<div class="note-box bad" style="margin-bottom:13px">'+
    '<strong>Nothing can be saved from this phone yet.</strong><br>'+
    'The page has opened in view-only mode. That happens when this phone is signed out of Claude '+
    '- use the <strong>Sign in</strong> button at the very top of the screen - or when the account '+
    'you signed in with was given the link to view but not to edit; the office has to share it '+
    'again with editing allowed.'+
    '<div style="margin-top:9px"><button class="btn" id="roReload">Reload and try again</button></div></div>';
  var rb=$('roReload'); if(rb)rb.onclick=function(){location.reload()};
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
