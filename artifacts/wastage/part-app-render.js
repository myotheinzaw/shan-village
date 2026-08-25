
/* ------------------------------ render ------------------------------- */
function tile(k,v,n,cls){
  return '<div class="tile'+(cls?' '+cls:'')+'"><div class="k">'+esc(k)+'</div>'+
    '<div class="v">'+esc(v)+'</div><div class="n">'+esc(n||'')+'</div></div>';
}
function entryHtml(e){
  var img=e.photo?'<img src="'+e.photo+'" alt="'+esc(e.item||'Wastage')+'" data-zoom="'+e.id+'">'
        :(e.hadPhoto?'<div class="pill" style="width:62px;height:62px;display:flex;align-items:center;justify-content:center;text-align:center;line-height:1.2">photo<br>gone</div>':'');
  var m=money(e.price);
  return '<div class="entry" data-entry="'+e.id+'">'+img+
    '<div class="body">'+
      '<div class="top"><span class="item">'+esc(e.item||'(not named)')+'</span>'+
        (qtyText(e)?'<span class="qty">'+esc(qtyText(e))+'</span>':'')+
        (m?'<span class="money">'+esc(m)+'</span>':'')+
      '</div>'+
      '<div class="meta">'+esc(e.t||'')+' &middot; '+esc(e.by||'not named')+
        (e.reason?' &middot; <span class="pill">'+esc(e.reason)+'</span>':'')+'</div>'+
      (e.note?'<div class="note">'+esc(e.note)+'</div>':'')+
      (isOffice()?'<div class="row no-print" style="margin-top:8px;gap:7px">'+
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

function renderToday(){
  var d=todayISO(), rows=sortEntries(entriesOn(d)), priced=withCost(rows);
  $('todayHead').textContent='Today - '+fmtDay(d);
  var qtyBits={};
  rows.forEach(function(e){
    if(e.qty==null||e.qty===''||!e.unit)return;
    qtyBits[e.unit]=(qtyBits[e.unit]||0)+Number(e.qty);
  });
  var qtyText2=Object.keys(qtyBits).sort().map(function(u){
    return (Math.round(qtyBits[u]*1000)/1000)+' '+u}).join(' &middot; ');
  $('todayTiles').innerHTML=
    tile('Entries',rows.length,'sent today')+
    tile('Value',priced.length?money(sumCost(rows)):'-',
         priced.length?priced.length+' of '+rows.length+' priced':'no prices entered','money')+
    tile('With a picture',rows.filter(function(e){return e.photo}).length,'of '+rows.length)+
    '<div class="tile"><div class="k">Quantity</div><div class="v" style="font-size:15px;line-height:1.35">'+
      (qtyText2||'-')+'</div><div class="n">by unit</div></div>';
  $('todayList').innerHTML=listHtml(rows,false);
}

function histRange(){
  var f=$('histFrom').value, t=$('histTo').value;
  var all=S.entries.slice();
  if(f)all=all.filter(function(e){return e.d>=f});
  if(t)all=all.filter(function(e){return e.d<=t});
  return sortEntries(all);
}
function renderHistory(){
  if(!isOffice())return;
  var rows=histRange(), priced=withCost(rows);
  var dayCount={}; rows.forEach(function(e){dayCount[e.d]=1});
  var nDays=Object.keys(dayCount).length;
  $('histTiles').innerHTML=
    tile('Entries',rows.length,nDays+' day'+(nDays===1?'':'s'))+
    tile('Value',priced.length?money(sumCost(rows)):'-',
         priced.length?priced.length+' priced':'no prices','money')+
    tile('Busiest day',(function(){
      var by={}; rows.forEach(function(e){by[e.d]=(by[e.d]||0)+1});
      var k=Object.keys(by).sort(function(a,b){return by[b]-by[a]})[0];
      return k?dayName(k):'-';
    })(),'most entries')+
    tile('Average a day',nDays?(Math.round(rows.length/nDays*10)/10):'-','entries');
  $('histList').innerHTML=listHtml(rows,true);
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
  S.entries.forEach(function(e){ if(e.item)items[e.item]=1; if(e.by)names[e.by]=1 });
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
  renderStamp(); renderForm(); renderToday();
  if(isOffice()){renderHistory();renderSettings()}
}
