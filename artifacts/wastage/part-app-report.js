/* ----------------------------- reports ------------------------------
   The office side of the page: the same entries read a day, a week or a
   month at a time, broken down by item, reason and person, and taken out
   as a file. Everything here is derived from the entries themselves -
   nothing is stored twice, so a corrected entry corrects every figure.
   Weeks run Monday to Sunday, which is the working week in the UAE.
   -------------------------------------------------------------------- */
var rep={mode:'day',anchor:null};

function isoAdd(iso,n){
  var d=new Date(iso+'T12:00:00Z'); d.setUTCDate(d.getUTCDate()+n);
  return d.toISOString().slice(0,10);
}
function isoAddMonths(iso,n){
  var d=new Date(iso.slice(0,8)+'01T12:00:00Z'); d.setUTCMonth(d.getUTCMonth()+n);
  return d.toISOString().slice(0,10);
}
function weekStartISO(iso){
  var d=new Date(iso+'T12:00:00Z');
  return isoAdd(iso,-((d.getUTCDay()+6)%7));          /* Monday */
}
function monthFirst(iso){return iso.slice(0,8)+'01'}
function monthLast(iso){
  var d=new Date(iso.slice(0,8)+'01T12:00:00Z'); d.setUTCMonth(d.getUTCMonth()+1); d.setUTCDate(0);
  return d.toISOString().slice(0,10);
}
function monthName(iso){
  var d=new Date(iso.slice(0,8)+'01T12:00:00Z');
  return d.toLocaleDateString('en-GB',{timeZone:'UTC',month:'long',year:'numeric'});
}
function repRange(){
  var a=rep.anchor||todayISO();
  if(rep.mode==='day')  return {from:a,to:a,label:dayName(a)+' - '+fmtDay(a)};
  if(rep.mode==='week'){var f=weekStartISO(a),t=isoAdd(f,6);
    return {from:f,to:t,label:'Week of '+fmtDay(f)+' to '+fmtDay(t)}}
  if(rep.mode==='month')return {from:monthFirst(a),to:monthLast(a),label:monthName(a)};
  return {from:$('histFrom').value||'',to:$('histTo').value||'',label:'Chosen dates'};
}
function histRange(){
  var r=repRange(), all=allEntries().slice();
  if(r.from)all=all.filter(function(e){return e.d>=r.from});
  if(r.to)  all=all.filter(function(e){return e.d<=r.to});
  return sortEntries(all);
}
function repStep(n){
  var a=rep.anchor||todayISO();
  if(rep.mode==='day')rep.anchor=isoAdd(a,n);
  else if(rep.mode==='week')rep.anchor=isoAdd(weekStartISO(a),7*n);
  else if(rep.mode==='month')rep.anchor=isoAddMonths(a,n);
  renderHistory();
}

/* --------------------------- breakdowns ----------------------------- */
function qtyLine(bucket){
  return Object.keys(bucket).sort().map(function(u){
    return (Math.round(bucket[u]*1000)/1000)+(u?' '+u:'')}).join(', ');
}
function groupRows(rows,keyOf){
  var by={};
  rows.forEach(function(e){
    var k=keyOf(e)||'(not given)';
    var g=by[k]||(by[k]={k:k,n:0,val:0,priced:0,qty:{}});
    g.n++;
    var v=Number(e.price);
    if(isFinite(v)&&e.price!=null&&e.price!==''){g.val+=v;g.priced++}
    if(e.qty!=null&&e.qty!==''){var u=e.unit||'';g.qty[u]=(g.qty[u]||0)+Number(e.qty)}
  });
  return Object.keys(by).map(function(k){return by[k]}).sort(function(a,b){
    return (b.val-a.val)||(b.n-a.n)||a.k.localeCompare(b.k);
  });
}
function breakTable(title,rows,keyOf,head){
  var gs=groupRows(rows,keyOf);
  var top=gs.reduce(function(m,g){return Math.max(m,g.val||0)},0);
  var h='<div class="card card-pad" style="margin-top:13px"><h2 class="sec">'+esc(title)+'</h2>'+
    '<div class="wrap" style="margin-top:9px;border:0;box-shadow:none">'+
    '<table><thead><tr><th>'+esc(head)+'</th><th class="n">Entries</th><th>Quantity</th>'+
    '<th class="n">Value</th><th style="width:22%"></th></tr></thead><tbody>';
  if(!gs.length)h+='<tr><td colspan="5" class="empty">Nothing in this period.</td></tr>';
  gs.slice(0,40).forEach(function(g){
    h+='<tr><td class="name">'+esc(g.k)+'</td><td class="n">'+g.n+'</td>'+
       '<td>'+esc(qtyLine(g.qty)||'-')+'</td>'+
       '<td class="n">'+(g.priced?esc(money(g.val)):'-')+'</td>'+
       '<td><div class="bar" style="width:'+(top?Math.round(g.val/top*100):0)+'%"></div></td></tr>';
  });
  return h+'</tbody></table></div></div>';
}
function dayTable(rows,from,to){
  if(!from||!to)return '';
  var by={}; rows.forEach(function(e){
    var g=by[e.d]||(by[e.d]={n:0,val:0,priced:0});
    g.n++; var v=Number(e.price);
    if(isFinite(v)&&e.price!=null&&e.price!=='')  {g.val+=v;g.priced++}
  });
  var days=[], d=from, guard=0;
  while(d<=to&&guard++<400){days.push(d);d=isoAdd(d,1)}
  var top=days.reduce(function(m,x){return Math.max(m,(by[x]&&by[x].val)||0)},0);
  var h='<div class="card card-pad" style="margin-top:13px"><h2 class="sec">Day by day</h2>'+
    '<div class="wrap" style="margin-top:9px;border:0;box-shadow:none">'+
    '<table><thead><tr><th>Day</th><th class="n">Entries</th><th class="n">Value</th>'+
    '<th style="width:34%"></th></tr></thead><tbody>';
  days.forEach(function(x){
    var g=by[x]||{n:0,val:0,priced:0};
    h+='<tr><td class="name">'+esc(fmtDay(x))+'</td><td class="n">'+(g.n||'-')+'</td>'+
       '<td class="n">'+(g.priced?esc(money(g.val)):'-')+'</td>'+
       '<td><div class="bar" style="width:'+(top?Math.round(g.val/top*100):0)+'%"></div></td></tr>';
  });
  return h+'</tbody></table></div></div>';
}

/* ------------------------------ export ------------------------------ */
function csvCell(v){
  v=String(v==null?'':v);
  return /[",\r\n]/.test(v) ? '"'+v.replace(/"/g,'""')+'"' : v;
}
function csvOf(rows){
  var head=['Date','Time','Item','Quantity','Unit','Value ('+cur()+')','Reason','Note',
            'Recorded by','Signed in as','Picture','Status','Entry id'];
  var out=[head];
  rows.forEach(function(e){
    out.push([e.d,e.t||'',e.item||'',e.qty==null?'':e.qty,e.unit||'',
      (e.price==null||e.price==='')?'':e.price,e.reason||'',e.note||'',e.by||'',e.role||'',
      e.photo?'yes':(e.hadPhoto?'released':'no'),
      e.local?'on this phone':'sent',e.id]);
  });
  return out.map(function(r){return r.map(csvCell).join(',')}).join('\r\n');
}
/* A page shared as "anyone with the link" is not allowed to hand a file
   to the browser, and a public link is the whole point here - so the
   export is shown as text to copy, and the file save is used only where
   the runtime allows it. */
async function exportCsv(rows,name){
  if(!rows.length){toast('Nothing to export in this period.',3000);return}
  /* Excel reads a comma file correctly only when it is told the encoding,
     which is what the byte order mark does. */
  var text='﻿'+csvOf(rows);
  var box=$('repExportBox'); box.innerHTML='';
  var dl=null;
  try{ dl=(window.claude&&typeof claude.use==='function')?await claude.use('downloads'):null }catch(e){dl=null}
  if(dl){
    try{
      await dl.save({filename:name+'.csv',data:text});
      toast(rows.length+' entries saved. Open the file in Excel.',4000);
      return;
    }catch(err){
      var code=(err&&err.code)||'unavailable';
      if(code==='declined'){toast('Export cancelled.',2500);return}
      if(code==='rate_limited'){toast('Wait a moment and export again.',3500);return}
      if(code==='too_large'){toast('That period is too large to export in one file. Try a shorter one.',5000);return}
      if(code==='extension_not_enabled'||code==='rejected_extension'){
        try{
          await dl.save({filename:name+'.txt',data:text});
          toast('Saved as a text file. In Excel open it and choose "comma separated".',5500);
          return;
        }catch(e2){}
      }
    }
  }
  box.innerHTML='<div class="note-box" style="margin-top:11px">'+
    '<strong>'+rows.length+(rows.length===1?' entry':' entries')+', ready to copy.</strong><br>'+
    'Select everything in the box below and copy it, then paste it into a blank Excel sheet and use '+
    'Data &rsaquo; Text to columns, separated by commas. On a phone, press and hold inside the box to select all.'+
    '<textarea class="f" id="repCsv" rows="9" readonly style="margin-top:8px"></textarea>'+
    '<div class="row no-print" style="margin-top:8px;gap:7px">'+
      '<button class="btn" id="repCsvAll">Select it all</button>'+
      '<button class="btn" id="repCsvHide">Close</button></div></div>';
  $('repCsv').value=text; $('repCsv').focus(); $('repCsv').select();
  $('repCsvAll').onclick=function(){$('repCsv').focus();$('repCsv').select()};
  $('repCsvHide').onclick=function(){box.innerHTML=''};
}

/* ------------------------------ render ------------------------------ */
function renderHistory(){
  if(!isOffice())return;
  var r=repRange(), rows=histRange(), priced=withCost(rows);
  $('repRangeRow').hidden=(rep.mode!=='range');
  Array.prototype.forEach.call($('repMode').querySelectorAll('.chip'),function(c){
    c.setAttribute('aria-pressed',c.getAttribute('data-mode')===rep.mode?'true':'false')});
  $('repLabel').textContent=r.label;
  var stepping=(rep.mode!=='range');
  $('repPrev').hidden=!stepping; $('repNext').hidden=!stepping; $('repNow').hidden=!stepping;
  $('repNow').textContent=rep.mode==='day'?'Today':(rep.mode==='week'?'This week':'This month');
  $('repNext').disabled=stepping&&r.to>=todayISO();

  var dayCount={}; rows.forEach(function(e){dayCount[e.d]=1});
  var nDays=Object.keys(dayCount).length;
  var held=rows.filter(function(e){return e.local}).length;
  $('histTiles').innerHTML=
    tile('Entries',rows.length,nDays+(nDays===1?' day':' days')+' with wastage')+
    tile('Value',priced.length?money(sumCost(rows)):'-',
         priced.length?priced.length+' of '+rows.length+' priced':'no prices','money')+
    tile('Busiest day',(function(){
      var by={}; rows.forEach(function(e){by[e.d]=(by[e.d]||0)+1});
      var k=Object.keys(by).sort(function(a,b){return by[b]-by[a]})[0];
      return k?dayName(k):'-';
    })(),'most entries')+
    tile('Average a day',nDays?(Math.round(rows.length/nDays*10)/10):'-','entries')+
    (held?tile('Not sent yet',held,'held on this phone','warn'):'');

  $('repBreak').innerHTML=
    breakTable('By item',rows,function(e){return e.item},'Item')+
    breakTable('By reason',rows,function(e){return e.reason},'Reason')+
    breakTable('By person',rows,function(e){return e.by},'Recorded by')+
    ((rep.mode==='week'||rep.mode==='month'||rep.mode==='range')?dayTable(rows,r.from,r.to):'');

  $('histList').innerHTML=listHtml(rows,true);
}
