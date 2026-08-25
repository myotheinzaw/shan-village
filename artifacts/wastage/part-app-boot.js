
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
  $('gateBtn').onclick=askUnlock;
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
    var newCode=$('setStaffCode').value.trim();
    if(newCode){
      if(newCode.length<4){toast('The staff code needs at least 4 characters.',3500);return}
      if(!cryptoOk()){toast('This browser cannot set a code.',3500);return}
      var salt=randSalt();
      if(!S.locks)S.locks={};
      S.locks.staff={salt:salt,hash:await codeHash(newCode,salt)};
      $('setStaffCode').value='';
      logStaffCodeChange();
    }
    shedPhotos();
    await saveState('Settings saved.'); render();
  };
}

/* ------------------------------- start ------------------------------- */
function boot(){
  document.getElementById('root').innerHTML=SHELL;
  try{applyTheme(localStorage.getItem('sv-w-theme')||'auto')}catch(e){applyTheme('auto')}
  try{var r0=sessionStorage.getItem('sv-w-role');
      if(r0==='owner'||r0==='admin'||r0==='chef'||r0==='staff')role=r0}catch(e){}
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
