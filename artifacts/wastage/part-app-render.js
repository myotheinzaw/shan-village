
/* ------------------------------ render ------------------------------- */
function tile(k,v,n,cls){
  return '<div class="tile'+(cls?' '+cls:'')+'"><div class="k">'+esc(k)+'</div>'+
    '<div class="v">'+esc(v)+'</div><div class="n">'+esc(n||'')+'</div></div>';
}
function entryHtml(e){
  var img=e.photo?'<img src="'+e.photo+'" alt="'+esc(e.item||'Wastage')+'" data-zoom="'+e.id+'">'
        :(e.hadPhoto?'<div class="pill" style="width:62px;height:62px;display:flex;align-items:center;justify-content:center;text-align:center;line-height:1.2">photo<br>gone</div>':'');
  var m=money(e.price);
  return '<div class="entry'+(e.local?' local':'')+'" data-entry="'+e.id+'">'+img+
    '<div class="body">'+
      '<div class="top"><span class="item">'+esc(e.item||'(not named)')+'</span>'+
        (qtyText(e)?'<span class="qty">'+esc(qtyText(e))+'</span>':'')+
        (m?'<span class="money">'+esc(m)+'</span>':'')+
      '</div>'+
      '<div class="meta">'+esc(e.t||'')+' &middot; '+esc(e.by||'not named')+
        (e.reason?' &middot; <span class="pill">'+esc(e.reason)+'</span>':'')+
        (e.local?' &middot; <span class="pill warn">on this phone</span>':'')+'</div>'+
      (e.note?'<div class="note">'+esc(e.note)+'</div>':'')+
      (e.local?'<div class="row no-print" style="margin-top:8px;gap:7px">'+
        '<button class="btn danger" data-drop="'+e.id+'" style="padding:5px 11px;font-size:12.5px">Delete</button></div>':'')+
      (!e.local&&isOffice()?'<div class="row no-print" style="margin-top:8px;gap:7px">'+
        '<button class="btn" data-edit="'+e.id+'" style="padding:5px 11px;font-size:12.5px">Correct</button>'+
        '<button class="btn danger" data-del="'+e.id+'" style="padding:5px 11px;font-size:12.5px">Remove</button></div>':'')+
    '</div></div>';
}
function listHtml(list,groupByDay){
  if(!list.length)return '<div class="card empty">Nothing recorded.</div>';
  if(!groupByDay)return '<div class="daygroup">'+list.map(entryHtml).join('')+'</div>';
  var byDay={};
  list.forEach(function(e){(byDay[e.d]=byDay[e.d]||[]).push(e)});
  return Object.keys(byDay).sort().reverse().map(function(d){
    var rows=byDay[d], c=sumCost(rows), priced=withCost(rows).length;
    return '<div class="daygroup" style="margin-bottom:18px">'+
      '<div class="dayhead"><h3>'+esc(dayName(d))+'</h3>'+
      '<span class="faint" style="font-size:12px">'+esc(fmtDay(d))+'</span>'+
      '<span class="n">'+rows.length+' item'+(rows.length>1?'s':'')+
        (priced?' &middot; '+esc(money(c)):'')+'</span></div>'+
      rows.map(entryHtml).join('')+'</div>';
  }).join('');
}
function sortEntries(list){
  return list.slice().sort(function(a,b){
    if(a.d!==b.d)return a.d<b.d?1:-1;
    return (a.t||'')<(b.t||'')?1:-1;
  });
}

function renderLocalBox(){
  var box=$('localBox'); if(!box)return;
  if(!LOCAL.length){box.innerHTML='';return}
  var n=LOCAL.length;
  box.innerHTML='<div class="note-box warn" style="margin-bottom:13px">'+
    '<strong>'+n+(n===1?' entry is':' entries are')+' saved on this phone only.</strong><br>'+
    'They are in the list below, marked <em>on this phone</em>. The office cannot see them until this '+
    'page can be written to - open the link on a phone signed in to Claude with editing allowed and tap '+
    'Send now, or forward the text below.'+
    '<div class="row no-print" style="margin-top:9px;gap:7px">'+
      '<button class="btn" id="lqSend"'+((api&&!readOnly)?'':' disabled')+'>Send now</button>'+
      '<button class="btn" id="lqText">Show as text to forward</button>'+
    '</div><div id="lqTextBox" hidden style="margin-top:9px"></div></div>';
  $('lqSend').onclick=function(){flushLocal()};
  $('lqText').onclick=function(){
    var b=$('lqTextBox');
    if(!b.hidden){b.hidden=true;return}
    b.hidden=false;
    b.innerHTML='<textarea class="f" id="lqTextArea" rows="9" readonly></textarea>'+
      '<div class="hint">Press and hold inside the box to select it all and copy, then paste it into a message.</div>';
    $('lqTextArea').value=localAsText();
    $('lqTextArea').focus(); $('lqTextArea').select();
  };
}
function renderToday(){
  renderLocalBox();
  var d=todayISO(), rows=sortEntries(entriesOn(d)), priced=withCost(rows);
  $('todayHead').textContent='Today - '+fmtDay(d);
  var qtyBits={};
  rows.forEach(function(e){
    if(e.qty==null||e.qty===''||!e.unit)return;
    qtyBits[e.unit]=(qtyBits[e.unit]||0)+Number(e.qty);
  });
  var qtyText2=Object.keys(qtyBits).sort().map(function(u){
    return (Math.round(qtyBits[u]*1000)/1000)+' '+u}).join(' &middot; ');
  var held=rows.filter(function(e){return e.local}).length;
  $('todayTiles').innerHTML=
    tile('Entries',rows.length,held?held+' still on this phone':'sent today',held?'warn':'')+
    tile('Value',priced.length?money(sumCost(rows)):'-',
         priced.length?priced.length+' of '+rows.length+' priced':'no prices entered','money')+
    tile('With a picture',rows.filter(function(e){return e.photo}).length,'of '+rows.length)+
    '<div class="tile"><div class="k">Quantity</div><div class="v" style="font-size:15px;line-height:1.35">'+
      (qtyText2||'-')+'</div><div class="n">by unit</div></div>';
  $('todayList').innerHTML=listHtml(rows,false);
}

function renderStamp(){
  $('stamp').innerHTML='<strong>'+esc(stampText(S.pub))+'</strong>'+
    (readOnly?'View only':'Live - '+TZ_LABEL);
}
function renderForm(){
  var units=S.units||[];
  var sel=$('fUnit'), keep=sel.value;
  sel.innerHTML='<option value=""></option>'+units.map(function(u){
    return '<option value="'+esc(u)+'">'+esc(u)+'</option>'}).join('');
  if(keep)sel.value=keep;
  var chosen=$('reasonChips').getAttribute('data-value')||'';
  $('reasonChips').innerHTML=(S.reasons||[]).map(function(r){
    return '<button type="button" class="chip" data-reason="'+esc(r)+'" aria-pressed="'+(r===chosen?'true':'false')+'">'+esc(r)+'</button>';
  }).join('');
  var items={}, names={};
  allEntries().forEach(function(e){ if(e.item)items[e.item]=1; if(e.by)names[e.by]=1 });
  $('itemList').innerHTML=Object.keys(items).sort().map(function(i){return '<option value="'+esc(i)+'">'}).join('');
  $('byList').innerHTML=Object.keys(names).sort().map(function(i){return '<option value="'+esc(i)+'">'}).join('');
  $('whenHint').textContent='Date and time are today in '+TZ_LABEL+'. Change them if you are recording something from earlier.';
}
function renderSettings(){
  if(!isOffice())return;
  $('setCur').value=cur();
  $('setKeep').value=keepDays();
  $('setReasons').value=(S.reasons||[]).join('\n');
  $('setUnits').value=(S.units||[]).join(', ');
  staffCodeState();
}
function render(){
  renderStamp(); renderForm(); renderToday(); syncSendBtn();
  if(isOffice()){renderHistory();renderSettings()}
}
