/* =====================================================================
   Shan Village - Daily Wastage Report
   ---------------------------------------------------------------------
   One page, no server. Everything anyone submits lives in the page's own
   state and is written back by publishing a new version of the page, the
   same way the duty roster works.

   Two things follow from that and shape most of the code below:

   * A submit is a publish, and a publish is compare-and-set. When two
     cooks send at the same moment one of them loses with 'conflict' and
     the view is reloaded to the winner. Nothing may be lost that way, so
     an entry is stashed before the call and re-sent after the reload.
   * Photos live inside the page. A page has a size limit, so pictures are
     shrunk hard on the phone before they are ever stored, and old ones are
     let go while their entry - item, quantity, price, note - is kept.
   ===================================================================== */
var S = JSON.parse(document.getElementById('state').textContent);

var TZ='Asia/Dubai', TZ_LABEL='Abu Dhabi time';
var PHOTO_EDGE=720;              /* longest side kept, in pixels          */
var PHOTO_MAX=170000;            /* characters of data URI per photo      */
var STATE_BUDGET=8500000;        /* characters of state before we shed    */
var PENDING='sv-w-pending';      /* an entry in flight, across a reload   */

var api=null, role=null, readOnly=false, sending=false, tab='add';
var photo=null, idleTimer=null;

/* ------------------------------ time -------------------------------- */
/* Every date and time in this page is Abu Dhabi's, never the phone's:
   a cook whose handset is still on Yangon time must not file today's
   wastage under tomorrow. */
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
  var x=new Date(d+'T12:00:00Z');
  if(isNaN(x))return d;
  return x.toLocaleDateString('en-GB',{timeZone:'UTC',weekday:'short',day:'numeric',month:'short',year:'numeric'});
}
function dayName(d){
  var t=todayISO();
  if(d===t)return 'Today';
  var y=new Date(t+'T12:00:00Z'); y.setUTCDate(y.getUTCDate()-1);
  if(d===y.toISOString().slice(0,10))return 'Yesterday';
  return fmtDay(d);
}
function stampText(isoStr){
  if(!isoStr)return 'Nothing sent yet';
  var d=new Date(isoStr); if(isNaN(d))return 'Nothing sent yet';
  var o={timeZone:TZ,day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false};
  try{return d.toLocaleString('en-GB',o)}catch(e){delete o.timeZone;return d.toLocaleString('en-GB',o)}
}

/* ----------------------------- helpers ------------------------------ */
function $(id){return document.getElementById(id)}
function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(m){
  return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]})}
function uid(){return 'w'+Date.now().toString(36)+Math.random().toString(36).slice(2,7)}
function cur(){return S.cur||'AED'}
function money(n){
  if(n==null||n==='')return '';
  var v=Number(n); if(!isFinite(v))return '';
  return cur()+' '+v.toFixed(2);
}
function qtyText(e){
  if(e.qty==null||e.qty==='')return '';
  return (Math.round(Number(e.qty)*1000)/1000)+(e.unit?' '+e.unit:'');
}
function entriesOn(d){return S.entries.filter(function(e){return e.d===d})}
function sumCost(list){
  return list.reduce(function(n,e){var v=Number(e.price);return n+(isFinite(v)?v:0)},0);
}
function withCost(list){return list.filter(function(e){return isFinite(Number(e.price))&&e.price!==''&&e.price!=null})}
function days(){
  var seen={};
  S.entries.forEach(function(e){seen[e.d]=1});
  return Object.keys(seen).sort().reverse();
}
function toast(msg,ms){
  var t=document.createElement('div'); t.className='toast'; t.textContent=msg;
  document.body.appendChild(t);
  setTimeout(function(){t.remove()},ms||2600);
}
