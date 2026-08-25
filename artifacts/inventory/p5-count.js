
/* ---------------------------- stock take ----------------------------
   A count is a document. It freezes the system quantity when it starts,
   so a delivery arriving mid-count cannot invent a variance; it records
   blank and zero as different things; and it changes stock only when it
   is approved, by writing count movements - never by overwriting.
   -------------------------------------------------------------------- */
function nextRef(dateISO){
  var base='ST-'+dateISO.replace(/-/g,'')+'-';
  var n=1;
  (S.takes||[]).forEach(function(t){
    if(t.ref&&t.ref.indexOf(base)===0){var k=parseInt(t.ref.slice(base.length),10);if(k>=n)n=k+1}
  });
  return base+('00'+n).slice(-3);
}
function takeById(id){return (S.takes||[]).filter(function(t){return t.id===id})[0]}
function openTakeFor(locId,date){
  return (S.takes||[]).filter(function(t){
    return t.loc===locId&&t.date===date&&t.status!=='cancelled';})[0];
}

function renderTakeHome(){
  fillSelect($('ctLoc'),locList().map(function(l){return [l.id,l.name]}),true);
  fillSelect($('ctCat'),catOptions(true),true);
  if(!$('ctDate').value)$('ctDate').value=todayISO();
  checkDuplicate();
  var h='<thead><tr><th>Reference</th><th>Location</th><th>Date</th><th>Status</th><th>Counted by</th><th class="n">Counted</th>'+
        (canSeeCost()?'<th class="n">Variance</th>':'')+'<th></th></tr></thead><tbody>';
  var rows=(S.takes||[]).slice().sort(function(a,b){return a.date<b.date?1:(a.ref<b.ref?1:-1)});
  if(!rows.length)h+='<tr><td colspan="7" class="empty">No stock take yet.</td></tr>';
  rows.slice(0,canManage()?40:10).forEach(function(t){
    var lines=Object.keys(t.lines||{}).length;
    h+='<tr><td class="name">'+esc(t.ref)+'</td><td>'+esc(locName(t.loc))+'</td><td>'+esc(fmtDay(t.date))+'</td>'+
       '<td>'+takePill(t.status)+'</td>'+
       '<td>'+esc((t.byNames||[]).join(', ')||roleName(t.by)||'-')+'</td>'+
       '<td class="n">'+countedOf(t)+' / '+lines+'</td>'+
       (canSeeCost()?'<td class="n">'+(t.varValue==null?'-':money(t.varValue))+'</td>':'')+
       '<td class="no-print"><button class="btn" data-open="'+t.id+'" style="padding:5px 10px;font-size:12px">'+
       (t.status==='locked'?'View':'Open')+'</button></td></tr>';
  });
  $('takesTable').innerHTML=h+'</tbody>';
}
function checkDuplicate(){
  var l=$('ctLoc').value, d=$('ctDate').value;
  var ex=l&&d?openTakeFor(l,d):null;
  var box=$('ctWarn');
  if(!ex){box.innerHTML='';$('ctStart').textContent='Start counting';return}
  box.innerHTML='<div class="note-box warn">'+esc(ex.ref)+' already exists for '+esc(locName(l))+
    ' on '+esc(fmtDay(d))+' ('+esc(ex.status.replace('_',' '))+'). Starting again would count the same stock twice.</div>';
  $('ctStart').textContent='Continue '+ex.ref;
}

function countMode(){
  var b=document.querySelector('#ctMode .chip[aria-pressed="true"]');
  return b?b.getAttribute('data-mode'):'manual';
}
function startTake(){
  var locId=$('ctLoc').value, date=$('ctDate').value||todayISO(), cat=$('ctCat').value;
  if(!locId){toast('Pick a location.');return}
  var ex=openTakeFor(locId,date);
  if(ex){session=ex.id;showRun();return}
  var mode=countMode(), lines={};
  if(mode==='list'){
    activeItems().filter(function(it){return !cat||it.cat===cat}).forEach(function(it){
      lines[it.id]={q:null,sys:qtyOf(it.id,locId),cost:Number(it.cost||0),unit:it.unit||''};
    });
    if(!Object.keys(lines).length){toast('No active items to count. Use "one by one" instead.',4500);return}
  }
  var t={id:uid('t'),ref:nextRef(date),loc:locId,date:date,status:'in_progress',mode:mode,
         startedAt:new Date().toISOString(),by:role,lines:lines};
  if(!S.takes)S.takes=[];
  S.takes.unshift(t);
  logIt('Stock take started',t.ref+' - '+locName(locId)+' - '+Object.keys(lines).length+' items');
  session=t.id;
  saveState('Stock take '+t.ref+' started.');
  showRun();
}
function showRun(){ $('countHome').hidden=true; $('countRun').hidden=false; renderRun() }
function hideRun(){ session=null; $('countRun').hidden=true; $('countHome').hidden=false; renderTakeHome() }

/* An item counted for the very first time has no book figure to differ
   from - the count IS the opening stock. Calling that a variance would
   demand a photo and a written reason for every line of a kitchen's first
   count, and would report the whole opening stock as a discrepancy. */
function isOpening(id,L){
  var it=item(id);
  return !!(it&&it.createdIn&&L&&!Number(L.sys||0));
}
function lineVariance(L,id){
  if(L.q==null||L.q==='')return null;
  if(id&&isOpening(id,L))return {vq:0, vv:0, opening:true};
  var vq=n3(Number(L.q)-Number(L.sys||0));
  return {vq:vq, vv:n2(vq*Number(L.cost||0))};
}
function renderRun(){
  var t=takeById(session); if(!t){hideRun();return}
  var ids=Object.keys(t.lines), done=countedOf(t), locked=(t.status==='locked'||t.status==='approved');
  $('runTitle').textContent=t.ref+' - '+locName(t.loc)+' - '+fmtDay(t.date);
  $('runBar').style.width=(ids.length?Math.round(done/ids.length*100):0)+'%';
  var varN=0, varV=0;
  ids.forEach(function(k){var v=lineVariance(t.lines[k],k); if(v&&v.vq!==0){varN++;varV+=v.vv}});
  $('runText').innerHTML='<span><strong>'+done+' / '+ids.length+'</strong> counted</span>'+
    '<span>'+varN+' with a variance</span>'+
    (canSeeCost()?'<span>'+money(varV)+' value difference</span>':'')+
    '<span>'+takePill(t.status)+'</span>';

  var q=($('runSearch').value||'').toLowerCase().trim(), show=$('runShow').value;
  var rows=ids.map(function(k){return {id:k,it:item(k),L:t.lines[k]}})
    .filter(function(r){
      if(!r.it)return false;
      if(q&&(r.it.name+' '+(r.it.sku||'')).toLowerCase().indexOf(q)<0)return false;
      var counted=(r.L.q!=null&&r.L.q!=='');
      if(show==='todo'&&counted)return false;
      if(show==='done'&&!counted)return false;
      if(show==='var'){var v=lineVariance(r.L,r.id); if(!v||v.vq===0)return false}
      return true;
    }).sort(function(a,b){return a.it.name.localeCompare(b.it.name)});

  var h='';
  if(!rows.length)h='<div class="card empty">Nothing to show here.</div>';
  rows.slice(0,400).forEach(function(r){
    var L=r.L, counted=(L.q!=null&&L.q!==''), v=lineVariance(L,r.id);
    var cls='countrow'+(counted?(Number(L.q)===0?' zero':' done'):'');
    h+='<div class="'+cls+'" data-line="'+r.id+'">'+
       '<div class="crhead"><span class="nm">'+esc(r.it.name)+'</span>'+
         '<span class="faint" style="font-size:11.5px;font-family:var(--font-mono)">'+esc(r.it.sku||'')+'</span>'+
         (L.by||L.hm?'<span class="faint" style="font-size:11.5px">'+
            [L.hm,L.byName||roleName(L.by)].filter(Boolean).map(esc).join(' &middot; ')+'</span>':'')+
         (canSeeCost()?'<span class="sys">book '+n3(L.sys)+' '+esc(L.unit||'')+'</span>':'')+'</div>'+
       '<div class="qtyrow">'+
         (locked?'':'<button class="qbtn" data-minus="'+r.id+'" aria-label="Less">&minus;</button>')+
         '<input class="qty'+(counted?'':' blank')+'" data-qty="'+r.id+'" type="number" inputmode="decimal" '+
            'step="any" min="0" value="'+(counted?esc(L.q):'')+'" placeholder="not counted"'+(locked?' disabled':'')+'>'+
         '<span class="qunit">'+esc(L.unit||'')+'</span>'+
         (locked?'':'<button class="qbtn" data-plus="'+r.id+'" aria-label="More">+</button>')+
       '</div>'+
       '<div class="crfoot">'+
         (!v ? '<span class="faint" style="font-size:12px">blank means not counted yet</span>'
             : v.opening ? '<span class="pill grey">First count - opening stock</span>'
             : v.vq===0 ? '<span class="pill ok">Matches the book</span>'
             : '<span class="vardot '+(v.vq<0?'neg':'pos')+'">'+(v.vq>0?'+':'')+v.vq+' '+esc(L.unit||'')+'</span>')+
         (v&&v.vq!==0?' <span class="pill '+VAR_CLASS[varianceStatus(v.vq,L.sys,v.vv)]+'">'+
            VAR_TEXT[varianceStatus(v.vq,L.sys,v.vv)]+'</span>':'')+
         '<div class="spacer"></div>'+
         (L.photo?'<img class="thumb" src="'+L.photo+'" alt="" data-zoom="'+r.id+'">':
           (L.hadPhoto?'<span class="pill grey">photo released</span>':''))+
         (locked?'':'<button class="btn" data-photo="'+r.id+'">'+(L.photo?'Retake':'Photo')+'</button>')+
         (locked?'':'<button class="btn" data-zero="'+r.id+'">Zero</button>')+
         (locked?'':'<button class="btn" data-note="'+r.id+'">'+(L.note||L.vcom?'Note &check;':'Note')+'</button>')+
       '</div>'+
       (L.vcom?'<div class="note-box" style="margin:0">'+esc(L.vcom)+'</div>':'')+
       (L.note?'<div class="note-box" style="margin:0">'+esc(L.note)+'</div>':'')+
       '</div>';
  });
  $('runList').innerHTML=h;

  var f='';
  if(t.status==='in_progress'||t.status==='draft'){
    f='<div class="row"><span class="faint">Everything is saved as you go.</span><div class="spacer"></div>'+
      '<button class="btn primary" id="runSubmit">Submit for review</button></div>';
  }else if(t.status==='submitted'||t.status==='reviewed'){
    f=canManage()
      ? '<div class="row"><span class="faint">Approving writes the corrections into stock and locks this count.</span>'+
        '<div class="spacer"></div><button class="btn" id="runReopen">Send back</button>'+
        '<button class="btn primary" id="runApprove">Approve and lock</button></div>'
      : '<div class="note-box good">Submitted. An inventory admin reviews and approves it.</div>';
  }else{
    f='<div class="row"><span class="faint">Approved '+esc(stampText(t.approvedAt))+
      ' - locked.</span><div class="spacer"></div>'+
      (canManage()?'<button class="btn danger" id="runUnlock">Reopen with a reason</button>':'')+'</div>';
  }
  $('runFoot').innerHTML=f;
  wireRunFoot();
}

/* Counting one shelf at a time, the way the wastage page works: name it,
   count it, photograph it, next. Nothing has to exist in the item master
   first - an item typed here is created as it is counted, so a kitchen can
   start on day one with an empty master. */
function addCountSheet(){
  var t=takeById(session); if(!t)return;
  if(t.status==='locked'||t.status==='approved'){toast('This count is locked.');return}
  var names={}; activeItems().forEach(function(i){names[i.name]=i});
  var units={}; S.items.forEach(function(i){if(i.unit)units[i.unit]=1});
  ['kg','g','L','ml','pcs','bottle','box','tray','tin','packet','bag'].forEach(function(u){units[u]=1});
  var lastBy=''; try{lastBy=localStorage.getItem('sv-i-by')||''}catch(e){}

  sheet('<div class="sheet"><div class="sheet-head"><h3>Count an item</h3>'+
    '<div class="who">'+esc(locName(t.loc))+' &middot; '+esc(fmtDay(t.date))+'</div></div>'+
    '<div class="sheet-body">'+
    '<div><span class="lbl">Picture</span>'+
      '<div class="shot">'+
        '<button type="button" class="shot-btn" id="acShot">'+
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8.5A2.5 2.5 0 0 1 5.5 6h1.7l1.2-2h6.2l1.2 2h1.7A2.5 2.5 0 0 1 20 8.5v9A2.5 2.5 0 0 1 17.5 20h-11A2.5 2.5 0 0 1 4 17.5Z"/><circle cx="11.9" cy="13" r="3.6"/></svg>'+
          'Take a picture</button>'+
        '<div class="shot-prev" id="acPrev" hidden><img id="acImg" alt="">'+
          '<button type="button" class="shot-drop" id="acDrop" aria-label="Remove">&times;</button></div>'+
      '</div><div class="hint" id="acHint">Optional, but it settles most questions later.</div></div>'+
    '<div class="field"><label class="lbl" for="acItem">What did you count?</label>'+
      '<input class="f" id="acItem" list="acItemList" autocomplete="off" placeholder="Cooking oil, chicken thigh, rice&hellip;">'+
      '<datalist id="acItemList">'+Object.keys(names).sort().map(function(x){
        return '<option value="'+esc(x)+'">'}).join('')+'</datalist>'+
      '<div class="hint">If it is not on the list yet it will be added.</div></div>'+
    '<div class="grid2">'+
      '<div class="field"><label class="lbl" for="acQty">How many</label>'+
        '<input class="f num" id="acQty" type="number" inputmode="decimal" step="any" min="0" placeholder="0"></div>'+
      '<div class="field"><label class="lbl" for="acUnit">Unit</label>'+
        '<input class="f" id="acUnit" list="acUnitList" autocomplete="off" placeholder="bottle, kg&hellip;">'+
        '<datalist id="acUnitList">'+Object.keys(units).sort().map(function(u){
          return '<option value="'+esc(u)+'">'}).join('')+'</datalist></div>'+
    '</div>'+
    '<div class="field"><label class="lbl" for="acNote">Note</label>'+
      '<textarea class="f" id="acNote" placeholder="Anything the office should know"></textarea></div>'+
    '<div class="field"><label class="lbl" for="acBy">Your name</label>'+
      '<input class="f" id="acBy" autocomplete="off" value="'+esc(lastBy)+'" placeholder="Who counted this"></div>'+
    '<div id="acErr"></div>'+
    '</div><div class="sheet-foot"><button class="btn" id="acCancel">Cancel</button>'+
    '<button class="btn primary" id="acSave">Save and count another</button></div></div>');

  var shot=null;
  $('acShot').onclick=function(){ photoFor='__add'; $('photoFile').click() };
  window.__acPhoto=function(dataUrl){
    shot=dataUrl; $('acImg').src=dataUrl; $('acPrev').hidden=false;
    $('acHint').textContent='Picture ready ('+Math.round(dataUrl.length/1024)+' KB).';
  };
  $('acDrop').onclick=function(){shot=null;$('acPrev').hidden=true;$('acImg').removeAttribute('src');
    $('acHint').textContent='Optional, but it settles most questions later.'};
  $('acCancel').onclick=function(){window.__acPhoto=null;closeSheet()};
  $('acSave').onclick=function(){
    var name=$('acItem').value.trim();
    var qtyRaw=$('acQty').value.trim();
    if(!name){$('acErr').innerHTML='<div class="note-box bad">Say what you counted.</div>';return}
    if(qtyRaw===''){$('acErr').innerHTML='<div class="note-box bad">Put a number. If the shelf is empty write 0 - that is different from leaving it blank.</div>';return}
    var qty=Number(qtyRaw);
    if(!isFinite(qty)||qty<0){$('acErr').innerHTML='<div class="note-box bad">That quantity is not a number.</div>';return}
    var unit=$('acUnit').value.trim();
    var it=names[name];
    if(!it){
      it={id:uid('i'),name:name,unit:unit,active:true,cat:'',createdIn:t.ref};
      S.items.push(it);
      logIt('Item created while counting',name+(unit?' ('+unit+')':''));
    }else if(unit&&!it.unit){ it.unit=unit }
    var L=t.lines[it.id];
    if(!L){ L=t.lines[it.id]={sys:qtyOf(it.id,t.loc),cost:Number(it.cost||0),unit:it.unit||unit||''} }
    L.q=n3(qty);
    L.unit=it.unit||unit||L.unit||'';
    L.note=$('acNote').value.trim();
    L.by=role; L.byName=$('acBy').value.trim(); L.at=new Date().toISOString(); L.hm=nowHM();
    /* The count as a whole records who counted. A second name is added
       rather than replacing the first: two people often split the shelves. */
    if(L.byName){
      t.byNames=t.byNames||[];
      if(t.byNames.indexOf(L.byName)<0)t.byNames.push(L.byName);
    }
    if(shot)L.photo=shot;
    try{localStorage.setItem('sv-i-by',L.byName||'')}catch(e){}
    window.__acPhoto=null;
    closeSheet();
    saveState('Counted '+name+'.');
    render();
    setTimeout(addCountSheet,120);          /* straight on to the next one */
  };
  setTimeout(function(){$('acItem').focus()},60);
}

function setQty(id,val){
  var t=takeById(session); if(!t||t.status==='locked'||t.status==='approved')return;
  var L=t.lines[id]; if(!L)return;
  if(val===null||val===''){L.q=null}
  else{var n=Number(val); if(!isFinite(n)||n<0)return; L.q=n3(n)}
  L.by=role; L.at=new Date().toISOString();
  if(t.status==='draft')t.status='in_progress';
  scheduleSave();
  renderRun();
}
function bump(id,d){
  var t=takeById(session), L=t&&t.lines[id]; if(!L)return;
  var cur=(L.q==null||L.q==='')?0:Number(L.q);
  setQty(id,Math.max(0,n3(cur+d)));
}

/* Counting on a phone produces a lot of small changes. Saving each one
   would republish the page constantly, so they are batched. */
var saveTimer=null;
function scheduleSave(){
  clearTimeout(saveTimer);
  saveTimer=setTimeout(function(){ saveState(null,true) },2500);
}

function submitTake(){
  var t=takeById(session); if(!t)return;
  var ids=Object.keys(t.lines), missing=[], needPhoto=[], needComment=[];
  var photoRule=setg('photoRule','var'), commentRule=setg('commentRule','on');
  var manual=(t.mode==='manual');
  ids.forEach(function(k){
    var L=t.lines[k], it=item(k); if(!it)return;
    /* In list mode a blank line is an item nobody has been to yet. In
       one-by-one mode a line only exists because somebody counted it. */
    if(L.q==null||L.q===''){ if(!manual)missing.push(it.name); return }
    var v=lineVariance(L,k);
    if(photoRule==='all'&&!L.photo&&!L.hadPhoto)needPhoto.push(it.name);
    if(photoRule==='var'&&v&&v.vq!==0&&!L.photo&&!L.hadPhoto)needPhoto.push(it.name);
    if(commentRule==='on'&&v&&varianceStatus(v.vq,L.sys,v.vv)==='review'&&!L.vcom)needComment.push(it.name);
  });
  var problems=[];
  if(missing.length)problems.push({t:missing.length+' item'+(missing.length===1?'':'s')+' not counted',
    d:'Blank is not zero. Count them, or mark them Zero if the shelf is empty.',list:missing});
  if(needPhoto.length)problems.push({t:needPhoto.length+' need a photo',
    d:'Your settings require photographic evidence here.',list:needPhoto});
  if(needComment.length)problems.push({t:needComment.length+' need a comment',
    d:'The variance is above the review threshold.',list:needComment});

  if(manual&&!ids.length){
    toast('Nothing counted yet. Add an item first.',3500);
    return;
  }
  if(problems.length){
    sheet('<div class="sheet"><div class="sheet-head"><h3>Not ready to submit</h3>'+
      '<div class="who">'+esc(t.ref)+'</div></div><div class="sheet-body">'+
      problems.map(function(p){
        return '<div class="note-box bad" style="margin:0"><strong>'+esc(p.t)+'</strong><br>'+esc(p.d)+
          '<div style="margin-top:5px;font-size:12px">'+esc(p.list.slice(0,12).join(', '))+
          (p.list.length>12?' and '+(p.list.length-12)+' more':'')+'</div></div>';
      }).join('')+
      '</div><div class="sheet-foot"><button class="btn" id="pbClose">Back to counting</button></div></div>');
    $('pbClose').onclick=closeSheet;
    return;
  }
  var varQty=0,varVal=0,varN=0;
  ids.forEach(function(k){var v=lineVariance(t.lines[k],k); if(v){varQty+=v.vq;varVal+=v.vv;if(v.vq!==0)varN++}});
  t.status='submitted'; t.submittedAt=new Date().toISOString(); t.submittedBy=role;
  t.varQty=n3(varQty); t.varValue=n2(varVal); t.varLines=varN;
  logIt('Stock take submitted',t.ref+' - '+varN+' variances - '+money(varVal));
  saveState('Submitted for review.');
  renderRun();
}
function approveTake(){
  var t=takeById(session); if(!t||!canManage())return;
  var moves=0;
  Object.keys(t.lines).forEach(function(k){
    var L=t.lines[k], v=lineVariance(L,k);
    if(!v||(v.vq===0&&!v.opening))return;
    var opening=!!v.opening;
    S.moves.push({id:uid('m'),at:new Date().toISOString(),i:k,l:t.loc,
      q: opening ? n3(Number(L.q)) : v.vq,
      c: Number(L.cost||0), k2: opening?'opening':'count', src:t.ref, by:role,
      byName: L.byName||''});
    moves++;
  });
  _stockRev=-1;
  t.status='locked'; t.approvedAt=new Date().toISOString(); t.approvedBy=role;
  logIt('Stock take approved and locked',t.ref+' - '+moves+' corrections written - '+money(t.varValue||0));
  shedPhotos();
  saveState('Approved. Stock updated and the count is locked.');
  render();
}
function sendBack(){
  var t=takeById(session); if(!t||!canManage())return;
  t.status='in_progress';
  logIt('Stock take sent back',t.ref);
  saveState('Sent back for recounting.'); renderRun();
}
function reopenTake(){
  var t=takeById(session); if(!t||!canManage())return;
  var d=sheet('<div class="sheet"><div class="sheet-head"><h3>Reopen '+esc(t.ref)+'</h3>'+
    '<div class="who">The corrections already written into stock are reversed. Both the reason and the original figures stay in the audit log.</div></div>'+
    '<div class="sheet-body"><div class="field"><label class="lbl" for="roWhy">Reason</label>'+
    '<textarea class="f" id="roWhy" placeholder="Why is this being reopened?"></textarea></div></div>'+
    '<div class="sheet-foot"><button class="btn" id="roCancel">Cancel</button>'+
    '<button class="btn danger" id="roGo">Reopen</button></div></div>');
  $('roCancel').onclick=closeSheet;
  $('roGo').onclick=function(){
    var why=$('roWhy').value.trim();
    if(!why){toast('A reason is required.');return}
    S.moves=S.moves.filter(function(m){return m.src!==t.ref});
    _stockRev=-1;
    t.status='in_progress'; t.reopenReason=why; t.reopenedAt=new Date().toISOString();
    logIt('Stock take reopened',t.ref+' - '+why);
    closeSheet(); saveState('Reopened. The corrections it made have been reversed.'); render();
  };
}
function wireRunFoot(){
  var s=$('runSubmit'); if(s)s.onclick=submitTake;
  var a=$('runApprove'); if(a)a.onclick=approveTake;
  var b=$('runReopen'); if(b)b.onclick=sendBack;
  var u=$('runUnlock'); if(u)u.onclick=reopenTake;
}
