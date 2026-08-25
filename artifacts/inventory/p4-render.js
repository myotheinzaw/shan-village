
/* ------------------------------ render ------------------------------ */
function tile(k,v,n,cls){
  return '<div class="tile'+(cls?' '+cls:'')+'"><div class="k">'+esc(k)+'</div>'+
    '<div class="v">'+esc(v)+'</div><div class="n">'+esc(n||'')+'</div></div>';
}
function statusPill(st){return '<span class="pill '+STATUS_CLASS[st]+'">'+STATUS_TEXT[st]+'</span>'}
function takePill(s){
  var m={draft:['draft','Draft'],in_progress:['prog','In progress'],submitted:['subm','Submitted'],
         reviewed:['subm','Reviewed'],approved:['appr','Approved'],locked:['lock','Locked']};
  var x=m[s]||['grey',s];
  return '<span class="pill '+x[0]+'">'+x[1]+'</span>';
}
function fillSelect(el,opts,keep){
  var v=keep?el.value:null;
  el.innerHTML=opts.map(function(o){return '<option value="'+esc(o[0])+'">'+esc(o[1])+'</option>'}).join('');
  if(v!==null)el.value=v;
}
function catOptions(all){
  var o=all?[['','All categories']]:[['','No category']];
  (S.categories||[]).forEach(function(c){o.push([c,c])});
  return o;
}

function renderChrome(){
  fillSelect($('locPick'),[['ALL','All locations']].concat(locList().map(function(l){return [l.id,l.name]})));
  $('locPick').value=loc;
  $('stamp').innerHTML='<strong>'+esc(stampText(S.pub))+'</strong>'+(readOnly?'View only':'Live - '+TZ_LABEL);
}

/* ------------------------------ dashboard --------------------------- */
function renderDash(){
  var items=activeItems();
  var byStatus={out:0,crit:0,low:0,ok:0,over:0};
  var totalVal=0, attn=[];
  items.forEach(function(it){
    var st=statusOf(it,loc); byStatus[st]++;
    totalVal+=valueOf(it.id,loc);
    if(st==='out'||st==='crit'||st==='low')attn.push({it:it,st:st});
  });
  var order={out:0,crit:1,low:2};
  attn.sort(function(a,b){return order[a.st]-order[b.st]||a.it.name.localeCompare(b.it.name)});

  var takes=S.takes||[];
  var pending=takes.filter(function(t){return t.status!=='approved'&&t.status!=='locked'}).length;
  var lastApproved=takes.filter(function(t){return t.status==='locked'||t.status==='approved'})
    .sort(function(a,b){return a.date<b.date?1:-1})[0];
  var varVal=lastApproved?n2(lastApproved.varValue||0):null;

  /* A stock taker sees what is on the shelves; money, pending approvals and
     the count history are the office's business. */
  $('dashTiles').innerHTML=
    (canSeeCost()?tile('Inventory value',money(totalVal),locName(loc)):'')+
    tile('Active items',items.length,canSeeCost()?'in the master':'at '+locName(loc))+
    tile('Out of stock',byStatus.out,'need ordering now',byStatus.out?'bad':'')+
    tile('Low or critical',byStatus.crit+byStatus.low,'below reorder level',(byStatus.crit+byStatus.low)?'warn':'')+
    (canManage()?tile('Pending stock takes',pending,pending?'awaiting approval':'none open',pending?'warn':''):'')+
    (canSeeCost()?tile('Last count variance',varVal===null?'-':money(varVal),
        lastApproved?fmtDay(lastApproved.date):'no approved count',
        (varVal!==null&&varVal<0)?'bad':''):'');
  $('cardLocValue').hidden=!canManage();
  $('cardRecentTakes').hidden=!canManage();

  $('attnCount').textContent=attn.length+' item'+(attn.length===1?'':'s');
  var h='<thead><tr><th>Item</th><th>Status</th><th class="n">On hand</th><th class="n">Reorder at</th>'+
        (loc==='ALL'?'<th>Where</th>':'')+'</tr></thead><tbody>';
  if(!attn.length)h+='<tr><td colspan="5" class="empty">Nothing needs attention. Every item is above its reorder level.</td></tr>';
  attn.slice(0,60).forEach(function(a){
    var lv=levelFor(a.it,loc);
    h+='<tr><td class="name">'+esc(a.it.name)+'<span class="sku">'+esc(a.it.sku||'')+'</span></td>'+
       '<td>'+statusPill(a.st)+'</td>'+
       '<td class="n">'+n3(qtyOf(a.it.id,loc))+' '+esc(a.it.unit||'')+'</td>'+
       '<td class="n">'+(lv.reorder||'-')+'</td>'+
       (loc==='ALL'?'<td class="faint" style="font-size:12px">'+esc(whereLow(a.it))+'</td>':'')+'</tr>';
  });
  $('attnTable').innerHTML=h+'</tbody>';

  var lh='<thead><tr><th>Location</th><th class="n">Items held</th>'+(canSeeCost()?'<th class="n">Value</th>':'')+'</tr></thead><tbody>';
  var grand=0;
  locList().forEach(function(l){
    var held=0,val=0;
    items.forEach(function(it){var q=qtyOf(it.id,l.id); if(q>0){held++;val+=valueOf(it.id,l.id)}});
    grand+=val;
    lh+='<tr><td class="name">'+esc(l.name)+'</td><td class="n">'+held+'</td>'+
        (canSeeCost()?'<td class="n">'+money(val)+'</td>':'')+'</tr>';
  });
  if(canSeeCost())lh+='<tr><td class="name">Total</td><td class="n"></td><td class="n"><strong>'+money(grand)+'</strong></td></tr>';
  $('locTable').innerHTML=lh+'</tbody>';

  var rh='<thead><tr><th>Reference</th><th>Location</th><th>Date</th><th>Status</th><th class="n">Counted</th>'+
         (canSeeCost()?'<th class="n">Variance</th>':'')+'</tr></thead><tbody>';
  var recent=takes.slice().sort(function(a,b){return a.date<b.date?1:-1}).slice(0,8);
  if(!recent.length)rh+='<tr><td colspan="6" class="empty">No stock take yet.</td></tr>';
  recent.forEach(function(t){
    rh+='<tr><td class="name">'+esc(t.ref)+'</td><td>'+esc(locName(t.loc))+'</td><td>'+esc(fmtDay(t.date))+'</td>'+
        '<td>'+takePill(t.status)+'</td><td class="n">'+countedOf(t)+' / '+Object.keys(t.lines||{}).length+'</td>'+
        (canSeeCost()?'<td class="n">'+(t.varValue==null?'-':money(t.varValue))+'</td>':'')+'</tr>';
  });
  $('recentTakes').innerHTML=rh+'</tbody>';
}
function whereLow(it){
  var out=[];
  locList().forEach(function(l){
    var st=statusOf(it,l.id);
    if(st==='out'||st==='crit'||st==='low')out.push(l.name.replace('Al ',''));
  });
  return out.join(', ');
}
function countedOf(t){
  var n=0; Object.keys(t.lines||{}).forEach(function(k){if(t.lines[k].q!=null&&t.lines[k].q!=='')n++});
  return n;
}

/* --------------------------- current stock -------------------------- */
function renderStock(){
  fillSelect($('stCat'),catOptions(true),true);
  var q=($('stSearch').value||'').toLowerCase().trim();
  var cat=$('stCat').value, st=$('stStatus').value;
  var rows=activeItems().filter(function(it){
    if(cat&&it.cat!==cat)return false;
    if(st&&statusOf(it,loc)!==st)return false;
    if(q&&(it.name+' '+(it.sku||'')).toLowerCase().indexOf(q)<0)return false;
    return true;
  }).sort(function(a,b){return a.name.localeCompare(b.name)});
  $('stCount').textContent=rows.length+' item'+(rows.length===1?'':'s')+' - '+locName(loc);

  var showAll=(loc==='ALL');
  var h='<thead><tr><th>Item</th><th>Category</th>';
  if(showAll)locList().forEach(function(l){h+='<th class="n">'+esc(l.name.replace('Al Ghurair ','AG ').replace('Al Quoz ','AQ '))+'</th>'});
  h+='<th class="n">'+(showAll?'Total':'On hand')+'</th><th>Status</th>';
  if(canSeeCost())h+='<th class="n">Value</th>';
  h+='</tr></thead><tbody>';
  if(!rows.length)h+='<tr><td colspan="9" class="empty">No item matches.</td></tr>';
  rows.forEach(function(it){
    h+='<tr><td class="name">'+esc(it.name)+'<span class="sku">'+esc(it.sku||'')+'</span></td>'+
       '<td class="faint" style="font-size:12.5px">'+esc(it.cat||'-')+'</td>';
    if(showAll)locList().forEach(function(l){h+='<td class="n">'+n3(qtyOf(it.id,l.id))+'</td>'});
    h+='<td class="n"><strong>'+n3(qtyOf(it.id,loc))+'</strong> '+esc(it.unit||'')+'</td>'+
       '<td>'+statusPill(statusOf(it,loc))+'</td>';
    if(canSeeCost())h+='<td class="n">'+money(valueOf(it.id,loc))+'</td>';
    h+='</tr>';
  });
  $('stockTable').innerHTML=h+'</tbody>';
}

/* ---------------------------- item master --------------------------- */
function renderItems(){
  if(!canManage())return;
  fillSelect($('imCat'),catOptions(true),true);
  var q=($('imSearch').value||'').toLowerCase().trim();
  var cat=$('imCat').value, onlyActive=$('imActive').value==='1';
  var rows=S.items.filter(function(it){
    if(onlyActive&&it.active===false)return false;
    if(cat&&it.cat!==cat)return false;
    if(q&&(it.name+' '+(it.sku||'')).toLowerCase().indexOf(q)<0)return false;
    return true;
  }).sort(function(a,b){return a.name.localeCompare(b.name)});
  var h='<thead><tr><th>Item</th><th>Category</th><th>Count unit</th><th class="n">Cost</th>'+
        '<th class="n">Min</th><th class="n">Reorder</th><th class="n">Max</th><th></th></tr></thead><tbody>';
  if(!rows.length)h+='<tr><td colspan="8" class="empty">No items yet. Add one, or import a CSV.</td></tr>';
  rows.forEach(function(it){
    h+='<tr'+(it.active===false?' style="opacity:.55"':'')+'>'+
       '<td class="name">'+esc(it.name)+(it.active===false?' <span class="pill grey">inactive</span>':'')+
         '<span class="sku">'+esc(it.sku||'')+'</span></td>'+
       '<td class="faint" style="font-size:12.5px">'+esc(it.cat||'-')+'</td>'+
       '<td>'+esc(it.unit||'-')+'</td><td class="n">'+(it.cost==null||it.cost===''?'-':n2(it.cost))+'</td>'+
       '<td class="n">'+(it.min||'-')+'</td><td class="n">'+(it.reorder||'-')+'</td><td class="n">'+(it.max||'-')+'</td>'+
       '<td class="no-print"><button class="btn" data-edit="'+it.id+'" style="padding:5px 10px;font-size:12px">Edit</button></td></tr>';
  });
  $('itemsTable').innerHTML=h+'</tbody>';
}

/* ------------------------------ settings ---------------------------- */
function renderSettings(){
  if(!canManage())return;
  var lh='<thead><tr><th>Location</th><th>Code</th><th class="n">Items held</th><th></th></tr></thead><tbody>';
  S.locations.forEach(function(l){
    var held=activeItems().filter(function(it){return qtyOf(it.id,l.id)>0}).length;
    lh+='<tr'+(l.active===false?' style="opacity:.55"':'')+'><td class="name">'+esc(l.name)+'</td>'+
        '<td class="faint" style="font-family:var(--font-mono);font-size:12px">'+esc(l.code||l.id)+'</td>'+
        '<td class="n">'+held+'</td>'+
        '<td class="no-print"><button class="btn" data-loctoggle="'+l.id+'" style="padding:5px 10px;font-size:12px">'+
        (l.active===false?'Reactivate':'Deactivate')+'</button></td></tr>';
  });
  $('locsTable').innerHTML=lh+'</tbody>';

  var ch='<thead><tr><th>Category</th><th class="n">Items</th><th></th></tr></thead><tbody>';
  (S.categories||[]).forEach(function(c){
    var n=S.items.filter(function(i){return i.cat===c}).length;
    ch+='<tr><td class="name">'+esc(c)+'</td><td class="n">'+n+'</td>'+
        '<td class="no-print"><button class="btn danger" data-delcat="'+esc(c)+'" style="padding:5px 10px;font-size:12px">Remove</button></td></tr>';
  });
  if(!(S.categories||[]).length)ch+='<tr><td colspan="3" class="empty">No categories yet.</td></tr>';
  $('catsTable').innerHTML=ch+'</tbody>';

  $('sTolPct').value=setg('tolPct',2); $('sTolQty').value=setg('tolQty',1);
  $('sRevPct').value=setg('reviewPct',10); $('sRevVal').value=setg('reviewValue',0);
  $('sCur').value=cur(); $('sKeep').value=keepDays();
  $('sPhoto').value=setg('photoRule','var'); $('sComment').value=setg('commentRule','on');
}

/* ------------------------------- audit ------------------------------ */
function renderAudit(){
  if(!canManage())return;
  var h='<thead><tr><th style="width:150px">When</th><th style="width:110px">Who</th><th>What</th></tr></thead><tbody>';
  var rows=(S.audit||[]);
  if(!rows.length)h+='<tr><td colspan="3" class="empty">Nothing recorded yet.</td></tr>';
  rows.slice(0,300).forEach(function(a){
    h+='<tr><td class="num" style="font-size:11.5px">'+esc(stampText(a.at))+'</td>'+
       '<td><span class="pill '+(a.who==='chef'?'grey':'subm')+'">'+esc(roleName(a.who)||a.who)+'</span></td>'+
       '<td><strong>'+esc(a.action)+'</strong>'+(a.detail?' &mdash; '+esc(a.detail):'')+'</td></tr>';
  });
  $('auditTable').innerHTML=h+'</tbody>';
}

function render(){
  renderChrome(); renderDash(); renderStock();
  if(canCount())renderTakeHome();
  if(canManage()){renderItems();renderSettings();renderAudit()}
  if(session)renderRun();
}
