/* =====================================================================
   Shan Village - Inventory Control & Stock Take
   ---------------------------------------------------------------------
   Same shape as the duty roster and the wastage report: one page, no
   server, state saved by publishing a new version of the page.

   The one design decision everything else follows from: stock is never
   stored as a number that somebody typed. It is the sum of movements -
   opening, receipt, transfer, usage, wastage, adjustment, count. So any
   figure on screen can be traced back to the document that caused it,
   and an approved stock take corrects the book by writing a movement
   rather than by overwriting history.
   ===================================================================== */
var S = JSON.parse(document.getElementById('state').textContent);

var TZ='Asia/Dubai', TZ_LABEL='Abu Dhabi time';
var PHOTO_EDGE=680, PHOTO_MAX=150000, STATE_BUDGET=8500000;
var PENDING='sv-i-pending';

var api=null, role=null, readOnly=false, busy=false, tab='dash';
var loc='ALL', idleTimer=null, session=null, photoFor=null;
/* True while the camera or gallery is in front of the browser, so the
   page cannot decide it is idle and reload itself under a picture. */
var picking=false;

/* ------------------------------ time -------------------------------- */
function partsNow(){
  var f=new Intl.DateTimeFormat('en-GB',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit',
    hour:'2-digit',minute:'2-digit',hour12:false});
  var o={}; f.formatToParts(new Date()).forEach(function(p){o[p.type]=p.value});
  return o;
}
function todayISO(){var p=partsNow();return p.year+'-'+p.month+'-'+p.day}
function nowHM(){var p=partsNow();return p.hour+':'+p.minute}
function fmtDay(d){
  if(!d)return '';
  var x=new Date(d+'T12:00:00Z'); if(isNaN(x))return d;
  return x.toLocaleDateString('en-GB',{timeZone:'UTC',weekday:'short',day:'numeric',month:'short',year:'numeric'});
}
function stampText(iso){
  if(!iso)return 'Nothing saved yet';
  var d=new Date(iso); if(isNaN(d))return 'Nothing saved yet';
  var o={timeZone:TZ,day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false};
  try{return d.toLocaleString('en-GB',o)}catch(e){delete o.timeZone;return d.toLocaleString('en-GB',o)}
}

/* ----------------------------- helpers ------------------------------ */
function $(id){return document.getElementById(id)}
function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(m){
  return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]})}
function uid(p){return (p||'x')+Date.now().toString(36)+Math.random().toString(36).slice(2,6)}
function cur(){return S.cur||'AED'}
function money(n){var v=Number(n);return isFinite(v)?cur()+' '+v.toLocaleString('en-GB',{minimumFractionDigits:2,maximumFractionDigits:2}):'-'}
function n2(v){return Math.round(Number(v)*100)/100}
function n3(v){return Math.round(Number(v)*1000)/1000}
function toast(m,ms){var t=document.createElement('div');t.className='toast';t.textContent=m;
  document.body.appendChild(t);setTimeout(function(){t.remove()},ms||2600)}

function locName(id){
  if(id==='ALL')return 'All locations';
  var l=S.locations.filter(function(x){return x.id===id})[0];
  return l?l.name:id;
}
function locList(){return S.locations.filter(function(l){return l.active!==false})}
function item(id){return S.items.filter(function(i){return i.id===id})[0]}
function activeItems(){return S.items.filter(function(i){return i.active!==false})}

/* --------------------------- stock ledger --------------------------- */
/* Rebuilt from movements on every render. With a few thousand movements
   this is far cheaper than keeping a second copy correct. */
var _stock=null, _stockRev=-1;
function stock(){
  if(_stock&&_stockRev===S.moves.length)return _stock;
  var m={};
  S.moves.forEach(function(mv){
    var byLoc=m[mv.i]||(m[mv.i]={});
    byLoc[mv.l]=(byLoc[mv.l]||0)+Number(mv.q||0);
  });
  _stock=m; _stockRev=S.moves.length;
  return m;
}
function qtyOf(itemId,locId){
  var m=stock()[itemId]; if(!m)return 0;
  if(locId&&locId!=='ALL')return n3(m[locId]||0);
  var t=0; for(var k in m)t+=m[k]; return n3(t);
}
function valueOf(itemId,locId){
  var it=item(itemId); if(!it)return 0;
  return n2(qtyOf(itemId,locId)*Number(it.cost||0));
}
function levelFor(it,locId){
  /* A location may set its own levels; otherwise the item's own apply. */
  var per=(S.levels||{})[it.id];
  if(per&&locId&&locId!=='ALL'&&per[locId])return per[locId];
  return {min:it.min,reorder:it.reorder,max:it.max};
}
function statusOf(it,locId){
  var q=qtyOf(it.id,locId), lv=levelFor(it,locId);
  var min=Number(lv.min), reo=Number(lv.reorder), max=Number(lv.max);
  if(q<=0)return 'out';
  if(isFinite(min)&&min>0&&q<=min)return 'crit';
  if(isFinite(reo)&&reo>0&&q<=reo)return 'low';
  if(isFinite(max)&&max>0&&q>max)return 'over';
  return 'ok';
}
var STATUS_TEXT={out:'Out of stock',crit:'Critical',low:'Low stock',ok:'Healthy',over:'Overstock'};
var STATUS_CLASS={out:'out',crit:'crit',low:'low',ok:'ok',over:'over'};

/* ---------------------------- tolerances ---------------------------- */
function setg(k,d){var v=(S.settings||{})[k];return (v===undefined||v===''||v===null)?d:v}
function varianceStatus(vq,sys,vv){
  var pct = sys>0 ? Math.abs(vq)/sys*100 : (vq===0?0:100);
  var tolPct=Number(setg('tolPct',2)), tolQty=Number(setg('tolQty',1)), revPct=Number(setg('reviewPct',10));
  var revVal=Number(setg('reviewValue',0));
  if(vq===0)return 'matched';
  if(revVal>0&&Math.abs(vv)>=revVal)return 'review';
  if(pct>=revPct)return 'review';
  if(pct<=tolPct||Math.abs(vq)<=tolQty)return 'minor';
  return vq<0?'shortage':'excess';
}
var VAR_TEXT={matched:'Matched',minor:'Minor variance',shortage:'Shortage',excess:'Excess',review:'Review required'};
var VAR_CLASS={matched:'ok',minor:'grey',shortage:'out',excess:'over',review:'crit'};

/* ---------------------------- audit trail --------------------------- */
function logIt(action,detail,extra){
  if(!S.audit)S.audit=[];
  S.audit.unshift(Object.assign({
    id:uid('a'), at:new Date().toISOString(), who:role||'-', action:action, detail:detail
  },extra||{}));
  if(S.audit.length>600)S.audit.length=600;
}
