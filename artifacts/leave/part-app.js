/* =====================================================================
   Shan Village - Leave
   ---------------------------------------------------------------------
   One page, no server, same shape as the duty roster and the wastage
   report: everything anyone does lives in this page's own state and is
   written back by publishing a new version of the page.

   Three things follow from that and shape the code below.

   * A submit is a publish, and a publish is compare-and-set. Two people
     applying at the same moment means one of them loses with 'conflict'
     and the view reloads to the winner - so a request is stashed before
     the call and re-sent after the reload.
   * Identity here is a personal PIN, not an account. It is honest about
     that on screen: it tells the office who typed, it does not prove it.
   * Balances are money. Nothing is guessed - a person with no joining
     date on file gets "joining date needed", never an invented figure.
   ===================================================================== */
var S = JSON.parse(document.getElementById('state').textContent);

var TZ='Asia/Dubai';
var CERT_EDGE=1100;            /* longest side kept for a certificate     */
var CERT_MAX=260000;           /* characters of data URI per certificate  */
var STATE_BUDGET=8500000;      /* characters of state before we shed      */
var PENDING='sv-lv-pending';   /* a request in flight, across a reload    */

var api=null, apiKnown=false, readOnly=false, sending=false, tab='me';
var me=null;                   /* staff id when a person is signed in     */
var role=null;                 /* 'owner' | 'admin' | 'chef' when office  */
var idleTimer=null, picking=false, cert=null, certName='';

/* ------------------------------- time -------------------------------- */
function partsNow(){
  var f=new Intl.DateTimeFormat('en-GB',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit',
    hour:'2-digit',minute:'2-digit',hour12:false});
  var o={}; f.formatToParts(new Date()).forEach(function(p){o[p.type]=p.value});
  return o;
}
function todayISO(){var p=partsNow();return p.year+'-'+p.month+'-'+p.day}
function fmtDay(d){
  if(!d)return '';
  var x=new Date(d+'T12:00:00Z'); if(isNaN(x))return d;
  return x.toLocaleDateString('en-GB',{timeZone:'UTC',day:'numeric',month:'short',year:'numeric'});
}
function fmtShort(d){
  if(!d)return '';
  var x=new Date(d+'T12:00:00Z'); if(isNaN(x))return d;
  return x.toLocaleDateString('en-GB',{timeZone:'UTC',day:'numeric',month:'short'});
}
function stampText(iso){
  if(!iso)return 'Nothing recorded yet';
  var d=new Date(iso); if(isNaN(d))return 'Nothing recorded yet';
  var o={timeZone:TZ,day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false};
  try{return d.toLocaleString('en-GB',o)}catch(e){delete o.timeZone;return d.toLocaleString('en-GB',o)}
}
function addDaysISO(d,n){
  var x=new Date(d+'T12:00:00Z'); x.setUTCDate(x.getUTCDate()+n);
  return x.toISOString().slice(0,10);
}
function dayList(from,to){
  var out=[], d=from, guard=0;
  if(!from||!to||to<from)return out;
  while(d<=to&&guard++<800){out.push(d);d=addDaysISO(d,1)}
  return out;
}
function monthsBetween(a,b){                 /* completed months a -> b */
  if(!a||!b||b<a)return 0;
  var ay=+a.slice(0,4), am=+a.slice(5,7), ad=+a.slice(8,10);
  var by=+b.slice(0,4), bm=+b.slice(5,7), bd=+b.slice(8,10);
  var m=(by-ay)*12+(bm-am);
  if(bd<ad)m--;
  return Math.max(0,m);
}

/* ----------------------------- helpers ------------------------------- */
function $(id){return document.getElementById(id)}
function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(m){
  return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]})}
function uid(){return 'l'+Date.now().toString(36)+Math.random().toString(36).slice(2,7)}
function num(n,dp){
  var v=Number(n); if(!isFinite(v))return '0';
  var f=v.toFixed(dp==null?1:dp);
  return f.replace(/\.0$/,'');
}
function toast(msg,ms){
  var t=document.createElement('div'); t.className='toast'; t.textContent=msg;
  document.body.appendChild(t);
  setTimeout(function(){t.remove()},ms||2800);
}
function P(){return S.policy}
function staffById(id){return S.staff.filter(function(s){return s.id===id})[0]||null}
function activeStaff(){return S.staff.filter(function(s){return s.active!==false})}
function nameOf(id){var s=staffById(id);return s?s.name:'(removed)'}
function reqsFor(id){return S.reqs.filter(function(r){return r.sid===id})}
function pendingReqs(){return S.reqs.filter(function(r){return r.status==='pending'})}
function typeLabel(k){
  var t=(P().types||[]).filter(function(x){return x.k===k})[0];
  return t?t.label:k;
}
function logIt(what){
  if(!S.log)S.log=[];
  S.log.unshift({t:new Date().toISOString(),who:whoLabel(),what:what});
  if(S.log.length>600)S.log.length=600;
}
function whoLabel(){
  if(role)return roleName(role);
  if(me)return nameOf(me);
  return 'Someone';
}

/* ------------------------- codes and PINs -----------------------------
   Two different things share one mechanism. The office codes are the same
   three the roster and the wastage page use, so nobody carries a second
   set. A personal PIN is per person and is what puts a name on a request.
   Only salted hashes are ever stored.
   -------------------------------------------------------------------- */
function cryptoOk(){return !!(window.crypto&&window.crypto.subtle&&window.crypto.getRandomValues)}
function hex(b){return Array.prototype.map.call(b,function(x){return ('0'+x.toString(16)).slice(-2)}).join('')}
function randSalt(){var a=new Uint8Array(8);crypto.getRandomValues(a);return hex(a)}
async function codeHash(code,salt){
  var d=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(salt+'|shan-village|'+String(code)));
  return hex(new Uint8Array(d));
}
function roleName(r){return r==='chef'?'Chef':(r==='admin'?'Admin':(r==='owner'?'Owner':''))}
function isOffice(){return role==='owner'||role==='admin'}
function canApprove(){return isOffice()}
function signedIn(){return !!(me||role)}

function armIdle(){
  clearTimeout(idleTimer);
  if(!signedIn())return;
  var ms = role ? 900000 : 14400000;      /* office 15 min, staff 4 hours */
  idleTimer=setTimeout(function(){
    if(signedIn()){signOut(true);toast('Signed out after a while without use.',4000)}
  },ms);
}
['pointerdown','keydown'].forEach(function(ev){
  document.addEventListener(ev,function(){ if(signedIn())armIdle() },{passive:true});
});
function signOut(quiet){
  me=null; role=null; clearTimeout(idleTimer);
  try{sessionStorage.removeItem('sv-lv-who')}catch(e){}
  refreshMode(); if(!quiet)toast('Signed out.');
}
function signInAs(kind,val){
  if(kind==='staff'){me=val;role=null}else{role=val;me=null}
  try{sessionStorage.setItem('sv-lv-who',JSON.stringify({kind:kind,val:val}))}catch(e){}
  armIdle(); refreshMode();
  toast(kind==='staff'?('Signed in as '+nameOf(val)+'.'):('Open as '+roleName(val)+'.'));
}

/* ------------------------------ policy -------------------------------
   Every number here comes from Settings. The defaults were seeded from
   the UAE statutory minimums, which is a starting point and not a claim
   about anybody's contract - the office confirms them once, in Settings,
   and from then on this is the house policy.
   -------------------------------------------------------------------- */
function isHoliday(d){return (S.holidays||[]).some(function(h){return h.d===d})}
function countLeaveDays(from,to,half){
  var list=dayList(from,to);
  if(P().skipHolidays)list=list.filter(function(d){return !isHoliday(d)});
  if(!list.length)return 0;
  if(half&&from===to)return 0.5;
  return list.length;
}
/* The window a given day belongs to: the person's own service year, or
   the calendar year, depending on the setting. */
function windowFor(st,d){
  if(P().yearBasis==='calendar'){
    var y=d.slice(0,4);
    return {start:y+'-01-01',end:y+'-12-31',label:y};
  }
  if(!st.joined)return null;
  var jm=st.joined.slice(5);                        /* MM-DD */
  var y2=+d.slice(0,4);
  var thisYear=y2+'-'+jm;
  var start=(d>=thisYear)?thisYear:((y2-1)+'-'+jm);
  var end=addDaysISO(start,-1);
  end=(+start.slice(0,4)+1)+'-'+jm; end=addDaysISO(end,-1);
  return {start:start,end:end,label:fmtShort(start)+' - '+fmtShort(end)};
}
function serviceMonths(st,asOf){
  if(!st.joined)return null;
  return monthsBetween(st.joined,asOf||todayISO());
}
/* Days per full year for this person. An override on the person wins. */
function yearlyEntitlement(st,asOf){
  if(st.entitle!=null&&st.entitle!=='')return Number(st.entitle);
  var m=serviceMonths(st,asOf);
  if(m==null)return null;
  return m>=12?Number(P().annualDays):0;
}
/* What has been earned so far inside the current window. */
function accruedIn(st,win,asOf){
  var m=serviceMonths(st,asOf);
  if(m==null)return null;
  if(m<Number(P().minServiceMonths)) return 0;
  if(m<12&&st.entitle==null){
    /* first year: earned per completed month at the partial rate */
    return Math.min(Number(P().annualDays), monthsBetween(st.joined,asOf)*Number(P().partialPerMonth));
  }
  var full=yearlyEntitlement(st,asOf);
  if(full==null)return null;
  if(P().accrual==='upfront')return full;
  var since=monthsBetween(win.start,asOf>win.end?win.end:asOf);
  return Math.min(full,Math.round((full/12)*since*100)/100);
}
/* Days of a request that fall inside a window, by day rather than by the
   request's start date - a request that straddles two years splits. */
function daysInWindow(r,win){
  var list=dayList(r.from,r.to);
  if(P().skipHolidays)list=list.filter(function(d){return !isHoliday(d)});
  var inside=list.filter(function(d){return d>=win.start&&d<=win.end});
  if(!inside.length)return 0;
  if(r.half&&r.from===r.to)return 0.5;
  return inside.length;
}
function sumDays(list,win,type,status){
  return list.filter(function(r){return r.type===type&&status.indexOf(r.status)>=0})
    .reduce(function(n,r){return n+daysInWindow(r,win)},0);
}
function adjSum(st,win){
  return (st.adj||[]).filter(function(a){return a.d>=win.start&&a.d<=win.end})
    .reduce(function(n,a){return n+Number(a.days||0)},0);
}
/* Everything the balance card needs, in one object, or a reason it
   cannot be worked out. */
function balance(st,asOf){
  asOf=asOf||todayISO();
  if(!st.joined)return {ok:false,why:'joining date needed'};
  var win=windowFor(st,asOf);
  if(!win)return {ok:false,why:'joining date needed'};
  var mine=reqsFor(st.id);
  var accrued=accruedIn(st,win,asOf);
  if(accrued==null)return {ok:false,why:'joining date needed'};
  var taken=sumDays(mine,win,'annual',['approved']);
  var pend=sumDays(mine,win,'annual',['pending']);
  var open=Number((st.opening&&st.opening.annualTaken)||0);
  var adj=adjSum(st,win);
  var carry=carryIn(st,win);
  var avail=Math.round((accrued+carry+adj-taken-pend-open)*100)/100;
  var sickUsed=sumDays(mine,win,'sick',['approved']);
  var sp=P().sick;
  var full=Math.min(sickUsed,Number(sp.full));
  var halfp=Math.min(Math.max(0,sickUsed-Number(sp.full)),Number(sp.half));
  var unp=Math.min(Math.max(0,sickUsed-Number(sp.full)-Number(sp.half)),Number(sp.unpaid));
  var over=Math.max(0,sickUsed-Number(sp.full)-Number(sp.half)-Number(sp.unpaid));
  return {ok:true,win:win,months:serviceMonths(st,asOf),
    entitle:yearlyEntitlement(st,asOf),accrued:accrued,carry:carry,adj:adj,
    taken:taken,pending:pend,opening:open,available:avail,
    sick:{used:sickUsed,full:full,half:halfp,unpaid:unp,over:over,
          left:Math.max(0,Number(sp.full)+Number(sp.half)+Number(sp.unpaid)-sickUsed)}};
}
/* Carry-over from the window immediately before this one, capped by the
   setting. Zero by default, which is the safe reading of the law. */
function carryIn(st,win){
  var cap=Number(P().carryOverMax||0);
  if(!cap)return 0;
  var prevEnd=addDaysISO(win.start,-1);
  if(!st.joined||prevEnd<st.joined)return 0;
  var prev=windowFor(st,prevEnd);
  if(!prev)return 0;
  var acc=accruedIn(st,prev,prev.end);
  if(acc==null)return 0;
  var mine=reqsFor(st.id);
  var used=sumDays(mine,prev,'annual',['approved'])+Number((st.opening&&st.opening.annualTaken)||0);
  return Math.max(0,Math.min(cap,Math.round((acc-used)*100)/100));
}
function certRequired(type,days){
  if(type!=='sick')return false;
  var from=Number(P().certFromDays);
  if(!isFinite(from)||from<=0)return false;
  return days>=from;
}
function overlaps(sid,from,to,skipId){
  return S.reqs.some(function(r){
    if(r.sid!==sid||r.id===skipId)return false;
    if(r.status==='rejected'||r.status==='cancelled')return false;
    return !(r.to<from||r.from>to);
  });
}

/* --------------------------- certificates ---------------------------- */
function shrink(file,cb){
  if(!file){cb(null,'No file chosen.');return}
  if(!/^image\//.test(file.type||'')){
    cb(null,'That file is not a picture. Photograph the certificate with the phone camera and attach that.');
    return;
  }
  var url=URL.createObjectURL(file), img=new Image();
  img.onload=function(){
    try{
      var w=img.naturalWidth||img.width, h=img.naturalHeight||img.height;
      var s=Math.min(1,CERT_EDGE/Math.max(w,h));
      var c=document.createElement('canvas');
      c.width=Math.max(1,Math.round(w*s)); c.height=Math.max(1,Math.round(h*s));
      var ctx=c.getContext('2d');
      ctx.fillStyle='#fff'; ctx.fillRect(0,0,c.width,c.height);
      ctx.drawImage(img,0,0,c.width,c.height);
      var q=0.66, out=c.toDataURL('image/jpeg',q);
      while(out.length>CERT_MAX&&q>0.3){q=Math.round((q-0.07)*100)/100;out=c.toDataURL('image/jpeg',q)}
      URL.revokeObjectURL(url);
      if(out.length>CERT_MAX){cb(null,'That picture is too large even after shrinking. Take it again with less detail.');return}
      cb(out,null);
    }catch(err){URL.revokeObjectURL(url);cb(null,'The picture could not be read.')}
  };
  img.onerror=function(){URL.revokeObjectURL(url);cb(null,'The picture could not be read.')};
  img.src=url;
}
function keepDays(){var n=Number(S.keepCert);return (isFinite(n)&&n>0)?n:365}
function shedCerts(){
  var cut=addDaysISO(todayISO(),-keepDays()), dropped=0;
  S.reqs.forEach(function(r){ if(r.cert&&r.to<cut){delete r.cert;r.hadCert=1;dropped++} });
  var older=S.reqs.filter(function(r){return r.cert}).sort(function(a,b){return a.at<b.at?-1:1});
  while(JSON.stringify(S).length>STATE_BUDGET&&older.length){
    var r=older.shift(); delete r.cert; r.hadCert=1; dropped++;
  }
  return dropped;
}

/* ------------------------------- shell -------------------------------- */
var CAMERA='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 8.5A1.5 1.5 0 0 1 4.5 7h2.2l1.2-2h8.2l1.2 2h2.2A1.5 1.5 0 0 1 21 8.5v9A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5z"/><circle cx="12" cy="13" r="3.4"/></svg>';
var LOGO='<svg class="mark" viewBox="0 0 200 200" role="img" aria-label="Shan Village">'+
'<circle cx="100" cy="100" r="99" fill="#F0873A"/><circle cx="100" cy="100" r="92" fill="#000"/>'+
'<clipPath id="hutClip"><path d="M100 33 L173 99 L154 99 L154 134 L46 134 L46 99 L27 99 Z"/></clipPath>'+
'<g clip-path="url(#hutClip)"><rect x="20" y="28" width="160" height="112" fill="#000"/>'+
'<rect x="20" y="38" width="160" height="8" fill="#F0873A"/><rect x="20" y="49" width="160" height="8" fill="#E63329"/>'+
'<rect x="20" y="60" width="160" height="8" fill="#F0873A"/><rect x="20" y="71" width="160" height="8" fill="#E63329"/>'+
'<rect x="20" y="82" width="160" height="8" fill="#F0873A"/><rect x="20" y="93" width="160" height="8" fill="#E63329"/>'+
'<rect x="20" y="104" width="160" height="8" fill="#F0873A"/><rect x="20" y="115" width="160" height="8" fill="#E63329"/>'+
'<rect x="20" y="126" width="160" height="8" fill="#F0873A"/></g>'+
'<path d="M100 33 L173 99 L154 99 L154 134 L46 134 L46 99 L27 99 Z" fill="none" stroke="#E63329" stroke-width="3.4" stroke-linejoin="round"/>'+
'<g><rect x="8" y="150" width="184" height="9" fill="#C79A38"/><rect x="8" y="163" width="184" height="9" fill="#C79A38"/>'+
'<rect x="8" y="176" width="184" height="9" fill="#C79A38"/></g></svg>';

function shell(){
  return ''+
  '<div class="page">'+
  '<header class="app-header">'+
    '<div class="hbar">'+
      LOGO+
      '<div class="ttl"><h1>Leave</h1><p class="sub">Shan Village &middot; Abu Dhabi</p></div>'+
      '<span class="spacer"></span>'+
      '<button class="btn-lock" id="whoBtn" type="button"></button>'+
    '</div>'+
    '<div class="stamp" id="stamp"></div>'+
  '</header>'+
  '<nav class="tabs" role="tablist" aria-label="Sections">'+
    '<button role="tab" id="tab-me" aria-controls="panel-me" aria-selected="true" type="button">My leave</button>'+
    '<button role="tab" id="tab-apply" aria-controls="panel-apply" aria-selected="false" type="button">Apply</button>'+
    '<button role="tab" id="tab-team" aria-controls="panel-team" aria-selected="false" type="button" hidden>Requests</button>'+
    '<button role="tab" id="tab-people" aria-controls="panel-people" aria-selected="false" type="button" hidden>People</button>'+
    '<button role="tab" id="tab-reports" aria-controls="panel-reports" aria-selected="false" type="button" hidden>Balances</button>'+
    '<button role="tab" id="tab-settings" aria-controls="panel-settings" aria-selected="false" type="button" hidden>Settings</button>'+
    '<button role="tab" id="tab-log" aria-controls="panel-log" aria-selected="false" type="button" hidden>Log</button>'+
  '</nav>'+
  '<main>'+
    '<section class="panel" id="panel-me" role="tabpanel" aria-labelledby="tab-me"></section>'+
    '<section class="panel" id="panel-apply" role="tabpanel" aria-labelledby="tab-apply" hidden></section>'+
    '<section class="panel" id="panel-team" role="tabpanel" aria-labelledby="tab-team" hidden></section>'+
    '<section class="panel" id="panel-people" role="tabpanel" aria-labelledby="tab-people" hidden></section>'+
    '<section class="panel" id="panel-reports" role="tabpanel" aria-labelledby="tab-reports" hidden></section>'+
    '<section class="panel" id="panel-settings" role="tabpanel" aria-labelledby="tab-settings" hidden></section>'+
    '<section class="panel" id="panel-log" role="tabpanel" aria-labelledby="tab-log" hidden></section>'+
  '</main>'+
  '</div>'+
  '<dialog id="sheet"></dialog>'+
  '<div class="lightbox" id="lightbox" hidden></div>';
}
function sheetOf(html){var d=$('sheet');d.innerHTML=html;d.showModal();return d}

/* ------------------------------ sign in ------------------------------- */
function askWho(){
  if(!cryptoOk()){toast('This browser cannot check a PIN.',4000);return}
  var opts=activeStaff().map(function(s){
    return '<option value="'+esc(s.id)+'">'+esc(s.name)+(s.pos?' - '+esc(s.pos):'')+'</option>';
  }).join('');
  var d=sheetOf('<div class="sheet"><div class="sheet-head"><h3>Sign in</h3>'+
    '<div class="who">Your name and your own PIN. The office uses a code instead.</div></div>'+
    '<div class="sheet-body"><div id="whoErr"></div>'+
      '<div class="field"><label class="lbl" for="whoSel">Your name</label>'+
        '<select class="f" id="whoSel">'+opts+'</select></div>'+
      '<div class="field" id="pinWrap"><label class="lbl" for="whoPin">Your PIN</label>'+
        '<input class="f pin" id="whoPin" type="password" inputmode="numeric" autocomplete="off"></div>'+
      '<div class="field" id="pin2Wrap" hidden><label class="lbl" for="whoPin2">Type it again</label>'+
        '<input class="f pin" id="whoPin2" type="password" inputmode="numeric" autocomplete="off"></div>'+
      '<div class="hint" id="pinHint"></div>'+
      '<div class="field" style="margin-top:12px"><label class="lbl" for="whoCode">Or an office code</label>'+
        '<input class="f pin" id="whoCode" type="password" autocomplete="off" placeholder="owner, admin or chef"></div>'+
    '</div>'+
    '<div class="sheet-foot"><button class="btn" id="whoCancel" type="button">Cancel</button>'+
    '<button class="btn" id="whoGo" type="button" style="border-color:var(--accent);color:var(--accent)">Sign in</button></div></div>');

  function syncPinMode(){
    var st=staffById($('whoSel').value);
    var fresh=!(st&&st.pin);
    $('pin2Wrap').hidden=!fresh;
    $('pinHint').textContent=fresh
      ? 'No PIN yet for this name. Choose one now - four to eight digits - and it is yours from then on.'
      : 'Forgotten it? The office can clear it in People, then you choose a new one.';
  }
  $('whoSel').onchange=syncPinMode; syncPinMode();

  var go=async function(){
    var codeV=$('whoCode').value;
    if(codeV){
      var l=S.locks||{}, m=null;
      if(l.owner&&await codeHash(codeV,l.owner.salt)===l.owner.hash)m='owner';
      else if(l.admin&&await codeHash(codeV,l.admin.salt)===l.admin.hash)m='admin';
      else if(l.chef&&await codeHash(codeV,l.chef.salt)===l.chef.hash)m='chef';
      if(m){d.close();signInAs('office',m);return}
      $('whoErr').innerHTML='<div class="note-box bad">That office code is not right.</div>';
      $('whoCode').value=''; return;
    }
    var st=staffById($('whoSel').value);
    if(!st){$('whoErr').innerHTML='<div class="note-box bad">Choose your name first.</div>';return}
    var pin=$('whoPin').value.trim();
    if(!/^\d{4,8}$/.test(pin)){
      $('whoErr').innerHTML='<div class="note-box bad">A PIN is four to eight digits.</div>';return;
    }
    if(!st.pin){
      if(pin!==$('whoPin2').value.trim()){
        $('whoErr').innerHTML='<div class="note-box bad">The two PINs are not the same.</div>';return;
      }
      var salt=randSalt();
      st.pin={salt:salt,hash:await codeHash(pin,salt)};
      d.close();
      me=st.id; role=null;
      logIt('PIN chosen for the first time');
      try{sessionStorage.setItem('sv-lv-who',JSON.stringify({kind:'staff',val:st.id}))}catch(e){}
      armIdle();
      var ok=await saveState('PIN saved. You are signed in.');
      if(!ok)toast('Signed in on this phone. The PIN could not be saved yet - the page is read-only here.',5000);
      refreshMode();
      return;
    }
    if(await codeHash(pin,st.pin.salt)===st.pin.hash){d.close();signInAs('staff',st.id)}
    else{
      $('whoErr').innerHTML='<div class="note-box bad">That PIN is not right.</div>';
      $('whoPin').value=''; $('whoPin').focus();
    }
  };
  $('whoGo').onclick=go;
  $('whoCancel').onclick=function(){d.close()};
  $('whoPin').onkeydown=function(e){if(e.key==='Enter'){e.preventDefault();go()}};
  $('whoCode').onkeydown=function(e){if(e.key==='Enter'){e.preventDefault();go()}};
  setTimeout(function(){$('whoPin').focus()},60);
}
function whoClicked(){ signedIn()?signOut():askWho() }

function refreshMode(){
  document.body.classList.toggle('is-office',isOffice());
  ['tab-team','tab-people','tab-reports','tab-settings'].forEach(function(id){
    var b=$(id); if(b)b.hidden=!isOffice();
  });
  var lg=$('tab-log'); if(lg)lg.hidden=!isOffice();
  var officeOnly=['team','people','reports','settings','log'];
  if(!isOffice()&&officeOnly.indexOf(tab)>=0)tab='me';
  var b=$('whoBtn');
  var shut='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><rect x="4" y="10.5" width="16" height="10.5" rx="2"/><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5"/></svg>';
  var open='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><rect x="4" y="10.5" width="16" height="10.5" rx="2"/><path d="M8 10.5V7a4 4 0 0 1 7.8-1.3"/></svg>';
  if(!signedIn()){b.className='btn-lock';b.innerHTML=shut+'Sign in'}
  else{b.className='btn-lock open';b.innerHTML=open+(role?roleName(role):nameOf(me))+' - out'}
  selectTab('tab-'+tab);
  render();
}

/* ------------------------------- render ------------------------------- */
function renderStamp(){
  var n=pendingReqs().length;
  var bits=[stampText(S.pub)];
  if(n)bits.push(n+(n===1?' request waiting':' requests waiting'));
  $('stamp').textContent='Last change '+bits.join('  ·  ');
}
function statusPill(r){
  var c=r.status==='approved'?'good':(r.status==='rejected'?'bad':(r.status==='cancelled'?'':'warn'));
  var t=r.status.charAt(0).toUpperCase()+r.status.slice(1);
  return '<span class="pill '+c+'">'+t+'</span>';
}
function reqCard(r,opts){
  opts=opts||{};
  var st=staffById(r.sid);
  var span=r.from===r.to?fmtDay(r.from):(fmtDay(r.from)+' to '+fmtDay(r.to));
  var d=r.days;
  var head=(opts.showName?('<strong>'+esc(nameOf(r.sid))+'</strong> &middot; '):'')+
    '<strong>'+esc(typeLabel(r.type))+'</strong>';
  var body='<div class="entry">'+
    '<div class="row" style="justify-content:space-between;align-items:flex-start;gap:8px">'+
      '<div>'+head+'<div class="faint">'+esc(span)+' &middot; '+num(d)+(d===1?' day':' days')+'</div></div>'+
      statusPill(r)+
    '</div>'+
    (r.reason?'<div class="faint" style="margin-top:6px">'+esc(r.reason)+'</div>':'')+
    (r.cert?'<div class="row" style="margin-top:8px"><button class="btn" type="button" data-cert="'+esc(r.id)+'">View certificate</button></div>'
      :(r.hadCert?'<div class="faint" style="margin-top:6px">Certificate was attached; the image has since been cleared.</div>':''))+
    (r.note?'<div class="note-box'+(r.status==='rejected'?' bad':'')+'" style="margin-top:8px">'+esc(r.note)+'</div>':'')+
    '<div class="faint" style="margin-top:6px">Applied '+esc(stampText(r.at))+
      (r.decidedAt?(' &middot; '+esc(r.status)+' '+esc(stampText(r.decidedAt))+' by '+esc(r.decidedBy||'office')):'')+'</div>'+
    (opts.actions||'')+
  '</div>';
  return body;
}
function balanceCards(st){
  var b=balance(st);
  if(!b.ok){
    return '<div class="note-box warn"><strong>'+esc(st.name)+' has no joining date on file.</strong><br>'+
      'Leave balances are worked out from the joining date, so nothing is shown rather than a number that could be wrong. '+
      (isOffice()?'Add it in People.':'Ask the office to add it.')+'</div>';
  }
  var lowAnnual=b.available<=0;
  return '<div class="tiles">'+
    '<div class="tile'+(lowAnnual?' warn':'')+'"><span class="k">Annual left</span><span class="v">'+num(b.available)+'</span>'+
      '<span class="u">days &middot; of '+num(b.accrued+b.carry+b.adj)+' earned</span></div>'+
    '<div class="tile"><span class="k">Used</span><span class="v">'+num(b.taken+b.opening)+'</span><span class="u">days approved this year</span></div>'+
    '<div class="tile'+(b.pending?' warn':'')+'"><span class="k">Waiting</span><span class="v">'+num(b.pending)+'</span><span class="u">days not decided</span></div>'+
    '<div class="tile"><span class="k">Sick used</span><span class="v">'+num(b.sick.used)+'</span>'+
      '<span class="u">days &middot; '+num(Math.max(0,Number(P().sick.full)-b.sick.used))+' left at full pay</span></div>'+
    '</div>'+
    '<div class="hint">Leave year '+esc(b.win.label)+' &middot; '+
      (b.entitle!=null?(num(b.entitle)+' days a year at '+(P().accrual==='monthly'?'monthly accrual':'full grant')):'first year, earned monthly')+
      (b.carry?(' &middot; '+num(b.carry)+' carried in'):'')+
      (b.adj?(' &middot; '+num(b.adj)+' adjusted'):'')+'</div>'+
    (b.sick.used?('<div class="hint">Sick pay tiers used: '+num(b.sick.full)+' full pay &middot; '+
      num(b.sick.half)+' half pay &middot; '+num(b.sick.unpaid)+' unpaid'+
      (b.sick.over?(' &middot; '+num(b.sick.over)+' beyond entitlement'):'')+'</div>'):'');
}

function renderMe(){
  var p=$('panel-me');
  if(!signedIn()){
    p.innerHTML='<div class="card card-pad">'+
      '<h2 class="sec">Sign in to see your leave</h2>'+
      '<p class="faint">Choose your name and type your own PIN. If you have never used this page, you choose the PIN the first time - nobody else sees it.</p>'+
      '<div class="row" style="margin-top:12px"><button class="btn btn-send" id="meSignIn" type="button">Sign in</button></div>'+
      '</div>'+
      '<div class="card card-pad" style="margin-top:14px">'+
        '<h2 class="sec">What this page is for</h2>'+
        '<p class="faint">Your annual leave balance, your sick leave, and applying for either. '+
        'The office sees the request the moment you send it, and you see the answer here.</p>'+
      '</div>';
    $('meSignIn').onclick=askWho;
    return;
  }
  if(role){
    var pend=pendingReqs();
    p.innerHTML='<div class="card card-pad"><h2 class="sec">Signed in as '+esc(roleName(role))+'</h2>'+
      '<p class="faint">'+(isOffice()
        ? (pend.length? (pend.length+' request'+(pend.length===1?'':'s')+' waiting for a decision. Open <strong>Requests</strong>.')
                      : 'Nothing is waiting for a decision.')
        : 'The chef code signs in to read. Approving leave is the owner and admin.')+'</p>'+
      (isOffice()&&pend.length?'<div class="row" style="margin-top:12px"><button class="btn btn-send" id="goTeam" type="button">Open requests</button></div>':'')+
      '</div>'+
      '<div class="card card-pad" style="margin-top:14px"><h2 class="sec">Applying for someone</h2>'+
      '<p class="faint">Use <strong>Apply</strong> and choose the person. It is recorded as entered by the office, not by them.</p></div>';
    var gt=$('goTeam'); if(gt)gt.onclick=function(){selectTab('tab-team')};
    return;
  }
  var st=staffById(me);
  var mine=reqsFor(me).slice().sort(function(a,b){return a.at<b.at?1:-1});
  var actions=function(r){
    if(r.status!=='pending')return '';
    return '<div class="row no-print" style="margin-top:9px"><button class="btn danger" type="button" data-cancel="'+esc(r.id)+'">Cancel this request</button></div>';
  };
  p.innerHTML='<div class="card card-pad">'+
      '<h2 class="sec">'+esc(st.name)+'</h2>'+
      balanceCards(st)+
      '<div class="row" style="margin-top:14px"><button class="btn btn-send" id="meApply" type="button">Apply for leave</button></div>'+
    '</div>'+
    '<div class="card card-pad" style="margin-top:14px">'+
      '<h2 class="sec">Your requests</h2>'+
      (mine.length?mine.map(function(r){return reqCard(r,{actions:actions(r)})}).join('')
        :'<div class="empty">Nothing yet. Your applications will appear here with their answer.</div>')+
    '</div>';
  $('meApply').onclick=function(){selectTab('tab-apply')};
  wireCancel(p); wireCert(p);
}

function renderApply(){
  var p=$('panel-apply');
  if(!signedIn()){
    p.innerHTML='<div class="card card-pad"><h2 class="sec">Sign in first</h2>'+
      '<p class="faint">A leave request has to carry a name, so this page asks who you are before it lets you apply.</p>'+
      '<div class="row" style="margin-top:12px"><button class="btn btn-send" id="apSignIn" type="button">Sign in</button></div></div>';
    $('apSignIn').onclick=askWho;
    return;
  }
  var forOffice=isOffice();
  var who=forOffice
    ? '<div class="field"><label class="lbl" for="apWho">Who is this for</label><select class="f" id="apWho">'+
        activeStaff().map(function(s){return '<option value="'+esc(s.id)+'">'+esc(s.name)+'</option>'}).join('')+
      '</select></div>'
    : '';
  var types=(P().types||[]).map(function(t){
    return '<option value="'+esc(t.k)+'">'+esc(t.label)+'</option>';
  }).join('');
  p.innerHTML='<div class="card card-pad">'+
    '<h2 class="sec">Apply for leave</h2>'+
    '<div id="apState"></div>'+
    who+
    '<div class="field"><label class="lbl" for="apType">Type of leave</label><select class="f" id="apType">'+types+'</select></div>'+
    '<div class="grid2">'+
      '<div class="field"><label class="lbl" for="apFrom">First day</label><input class="f" id="apFrom" type="date"></div>'+
      '<div class="field"><label class="lbl" for="apTo">Last day</label><input class="f" id="apTo" type="date"></div>'+
    '</div>'+
    '<div class="field" id="apHalfWrap" hidden><label class="lbl"><input type="checkbox" id="apHalf"> Half day only</label></div>'+
    '<div class="field"><label class="lbl" for="apReason">Reason</label>'+
      '<textarea class="f" id="apReason" rows="2" placeholder="Short and plain - it is read by the office, not by a machine."></textarea></div>'+
    '<div class="field" id="apCertWrap">'+
      '<label class="lbl">Doctor\'s certificate</label>'+
      '<div class="shot">'+
        '<label class="shot-btn" for="apCert">'+CAMERA+'<span>Attach a photo of the certificate</span></label>'+
        '<input id="apCert" type="file" accept="image/*" hidden>'+
        '<div class="shot-prev" id="apCertPrev"></div>'+
      '</div>'+
      '<div class="hint" id="apCertHint"></div>'+
    '</div>'+
    '<div id="apSummary"></div>'+
    '<div class="row" style="margin-top:14px">'+
      '<button class="btn btn-send" id="apSend" type="button">Send request</button>'+
      '<button class="btn" id="apClear" type="button">Clear</button>'+
    '</div>'+
  '</div>';

  var today=todayISO();
  $('apFrom').value=today; $('apTo').value=today;
  ['apType','apFrom','apTo','apHalf','apReason'].forEach(function(id){
    var el=$(id); if(el)el.addEventListener('change',syncApply);
  });
  $('apFrom').addEventListener('input',function(){
    if($('apTo').value<$('apFrom').value)$('apTo').value=$('apFrom').value;
    syncApply();
  });
  $('apTo').addEventListener('input',syncApply);
  $('apCert').addEventListener('click',function(){picking=true});
  $('apCert').addEventListener('change',function(e){
    picking=false;
    var f=e.target.files&&e.target.files[0];
    if(!f)return;
    $('apCertHint').textContent='Shrinking the picture…';
    shrink(f,function(data,err){
      if(err){cert=null;certName='';$('apCertHint').textContent=err;$('apCertPrev').innerHTML='';return}
      cert=data; certName=f.name||'certificate';
      $('apCertPrev').innerHTML='<img src="'+cert+'" alt="Certificate"><button class="btn danger" type="button" id="apCertDrop">Remove</button>';
      $('apCertHint').textContent='Attached. It is stored in this page and kept for '+keepDays()+' days.';
      $('apCertDrop').onclick=function(){cert=null;certName='';$('apCertPrev').innerHTML='';syncApply()};
      syncApply();
    });
  });
  $('apClear').onclick=function(){cert=null;certName='';renderApply()};
  $('apSend').onclick=submitRequest;
  /* the notice belongs on the panel every time it is drawn, not only when
     the capability happens to resolve while Apply is on screen */
  if(readOnly)goReadOnly();
  syncApply();
}
function applyTarget(){
  if(isOffice()){var s=$('apWho'); return s?s.value:null}
  return me;
}
function syncApply(){
  var st=staffById(applyTarget());
  var type=$('apType').value, from=$('apFrom').value, to=$('apTo').value;
  if(to&&from&&to<from){to=from;$('apTo').value=from}
  $('apHalfWrap').hidden=!(from&&to&&from===to);
  var half=$('apHalf')&&!$('apHalfWrap').hidden&&$('apHalf').checked;
  var days=countLeaveDays(from,to,half);
  $('apCertWrap').hidden=(type!=='sick');
  var msgs=[];
  if(type==='sick'){
    var need=certRequired('sick',days);
    $('apCertHint').textContent=cert
      ? ('Attached. Kept in this page for '+keepDays()+' days.')
      : (need? ('A certificate is required from '+num(P().certFromDays,0)+' day'+(Number(P().certFromDays)===1?'':'s')+' of sick leave.')
             : 'Not required for this length, but attach one if you have it.');
  }
  if(st&&type==='annual'){
    var b=balance(st);
    if(b.ok){
      var after=Math.round((b.available-days)*100)/100;
      msgs.push('<div class="note-box'+(after<0?' warn':'')+'">'+
        esc(st.name)+' has <strong>'+num(b.available)+'</strong> day'+(b.available===1?'':'s')+' left. '+
        'This request is <strong>'+num(days)+'</strong>, leaving <strong>'+num(after)+'</strong>.'+
        (after<0?'<br>That is more than the balance. It can still be sent - the office decides whether to allow it or record it as unpaid.':'')+
        '</div>');
    }else{
      msgs.push('<div class="note-box warn">No joining date on file for '+esc(st.name)+
        ', so the annual balance cannot be worked out yet. The request can still be sent.</div>');
    }
  }
  if(st&&from&&to&&overlaps(st.id,from,to)){
    msgs.push('<div class="note-box warn">These dates overlap a request that is already in. Check the dates before sending.</div>');
  }
  if(type==='annual'&&P().noticeDays>0&&from){
    var notice=dayList(todayISO(),from).length-1;
    if(notice<Number(P().noticeDays)){
      msgs.push('<div class="note-box">House notice for annual leave is '+num(P().noticeDays,0)+' days. '+
        'This is '+num(Math.max(0,notice),0)+'. It can be sent - the office sees the short notice.</div>');
    }
  }
  $('apSummary').innerHTML=msgs.join('');
  var sendBtn=$('apSend');
  sendBtn.textContent=(apiKnown&&(readOnly||!api))?'Cannot send - page is read-only':
    ('Send request'+(days?(' · '+num(days)+(days===1?' day':' days')):''));
  sendBtn.disabled=!days||(apiKnown&&(readOnly||!api));
}

async function submitRequest(){
  var sid=applyTarget(), st=staffById(sid);
  if(!st){toast('Choose who this is for.');return}
  var type=$('apType').value, from=$('apFrom').value, to=$('apTo').value;
  var half=$('apHalf')&&!$('apHalfWrap').hidden&&$('apHalf').checked;
  var days=countLeaveDays(from,to,half);
  if(!days){toast('Choose the dates first.');return}
  if(certRequired(type,days)&&!cert){
    $('apState').innerHTML='<div class="note-box bad">A doctor\'s certificate is required for '+
      num(days)+' days of sick leave. Photograph it and attach it above.</div>';
    return;
  }
  var r={id:uid(),at:new Date().toISOString(),sid:sid,type:type,from:from,to:to,
    days:days,half:!!half,reason:$('apReason').value.trim(),
    status:'pending',by:(role?('office ('+roleName(role)+')'):st.name)};
  if(cert){r.cert=cert;r.certName=certName}
  var ok=await pushRequest(r,1);
  if(ok){
    cert=null;certName='';
    renderApply(); selectTab('tab-me'); render();
  }
}

function renderTeam(){
  var p=$('panel-team');
  if(!isOffice()){p.innerHTML='';return}
  var pend=pendingReqs().slice().sort(function(a,b){return a.from<b.from?-1:1});
  var others=S.reqs.filter(function(r){return r.status!=='pending'})
    .slice().sort(function(a,b){return a.at<b.at?1:-1}).slice(0,60);
  var act=function(r){
    return '<div class="row no-print" style="margin-top:9px;gap:7px">'+
      '<button class="btn" type="button" data-ok="'+esc(r.id)+'" style="border-color:var(--good);color:var(--good)">Approve</button>'+
      '<button class="btn danger" type="button" data-no="'+esc(r.id)+'">Reject</button>'+
      '</div>';
  };
  p.innerHTML='<div class="card card-pad">'+
      '<h2 class="sec">Waiting for a decision</h2>'+
      (pend.length?pend.map(function(r){return reqCard(r,{showName:true,actions:act(r)})}).join('')
        :'<div class="empty">Nothing is waiting.</div>')+
    '</div>'+
    '<div class="card card-pad" style="margin-top:14px">'+
      '<h2 class="sec">Decided</h2>'+
      (others.length?others.map(function(r){return reqCard(r,{showName:true})}).join('')
        :'<div class="empty">No decisions yet.</div>')+
    '</div>';
  wireDecide(p); wireCert(p);
}

function renderPeople(){
  var p=$('panel-people');
  if(!isOffice()){p.innerHTML='';return}
  var rows=S.staff.map(function(s){
    var b=balance(s);
    return '<tr>'+
      '<td class="name">'+esc(s.name)+'<div class="faint">'+esc(s.pos||'')+'</div></td>'+
      '<td>'+(s.joined?esc(fmtDay(s.joined)):'<span class="pill warn">needed</span>')+'</td>'+
      '<td class="n">'+(b.ok?num(b.available):'-')+'</td>'+
      '<td>'+(s.pin?'set':'<span class="faint">not set</span>')+'</td>'+
      '<td class="no-print"><button class="btn" type="button" data-edit="'+esc(s.id)+'">Edit</button></td>'+
      '</tr>';
  }).join('');
  p.innerHTML='<div class="card card-pad">'+
      '<h2 class="sec">People</h2>'+
      '<p class="faint">Joining date drives every annual figure on this page. Until it is filled in, that person sees "joining date needed" rather than a number that might be wrong.</p>'+
      '<div style="overflow-x:auto"><table><thead><tr><th>Name</th><th>Joined</th><th class="n">Annual left</th><th>PIN</th><th></th></tr></thead>'+
      '<tbody>'+rows+'</tbody></table></div>'+
      '<div class="row no-print" style="margin-top:12px"><button class="btn" id="addPerson" type="button">Add a person</button></div>'+
    '</div>';
  $('addPerson').onclick=function(){editPerson(null)};
  Array.prototype.forEach.call(p.querySelectorAll('[data-edit]'),function(b){
    b.onclick=function(){editPerson(b.getAttribute('data-edit'))};
  });
}
function editPerson(id){
  var s=id?staffById(id):{id:'',name:'',pos:'',joined:'',entitle:null,active:true,opening:{annualTaken:0}};
  var isNew=!id;
  var d=sheetOf('<div class="sheet"><div class="sheet-head"><h3>'+(isNew?'Add a person':esc(s.name))+'</h3>'+
    '<div class="who">Joining date is what the balance is built from.</div></div>'+
    '<div class="sheet-body">'+
      '<div class="field"><label class="lbl" for="pName">Name</label><input class="f" id="pName" value="'+esc(s.name)+'"></div>'+
      '<div class="field"><label class="lbl" for="pPos">Position</label><input class="f" id="pPos" value="'+esc(s.pos||'')+'"></div>'+
      '<div class="grid2">'+
        '<div class="field"><label class="lbl" for="pJoin">Joining date</label><input class="f" id="pJoin" type="date" value="'+esc(s.joined||'')+'"></div>'+
        '<div class="field"><label class="lbl" for="pEnt">Days a year</label><input class="f num" id="pEnt" type="number" min="0" step="0.5" value="'+esc(s.entitle==null?'':s.entitle)+'" placeholder="'+esc(P().annualDays)+'"></div>'+
      '</div>'+
      '<div class="field"><label class="lbl" for="pOpen">Days already taken this year, before this page</label>'+
        '<input class="f num" id="pOpen" type="number" min="0" step="0.5" value="'+esc((s.opening&&s.opening.annualTaken)||0)+'"></div>'+
      '<div class="field"><label class="lbl"><input type="checkbox" id="pActive"'+(s.active!==false?' checked':'')+'> On the roster now</label></div>'+
      (id?'<div class="field"><label class="lbl">PIN</label>'+
        '<div class="row"><button class="btn danger" type="button" id="pPinClear">'+(s.pin?'Clear the PIN':'No PIN set')+'</button></div>'+
        '<div class="hint">Clearing lets them choose a new one next time they sign in. Nobody can read the old one, here or anywhere else.</div></div>':'')+
      (id?'<div class="field"><label class="lbl" for="pAdj">Adjust the balance by</label>'+
        '<div class="grid2"><input class="f num" id="pAdj" type="number" step="0.5" placeholder="e.g. -2 or 3">'+
        '<input class="f" id="pAdjWhy" placeholder="Reason - it goes in the log"></div></div>':'')+
    '</div>'+
    '<div class="sheet-foot"><button class="btn" id="pCancel" type="button">Cancel</button>'+
    '<button class="btn" id="pSave" type="button" style="border-color:var(--accent);color:var(--accent)">Save</button></div></div>');
  $('pCancel').onclick=function(){d.close()};
  var pinCleared=false;
  var pc=$('pPinClear');
  if(pc)pc.onclick=function(){
    if(!s.pin){toast('There is no PIN to clear.');return}
    pinCleared=true; pc.textContent='PIN will be cleared on save'; pc.disabled=true;
  };
  $('pSave').onclick=async function(){
    var nm=$('pName').value.trim();
    if(!nm){toast('A name is needed.');return}
    var ent=$('pEnt').value.trim();
    var target=s;
    if(isNew){
      target={id:'p'+uid(),name:nm,pos:'',joined:'',entitle:null,active:true,opening:{annualTaken:0},adj:[]};
      S.staff.push(target);
    }
    target.name=nm;
    target.pos=$('pPos').value.trim();
    target.joined=$('pJoin').value||'';
    target.entitle=ent===''?null:Number(ent);
    target.opening={annualTaken:Number($('pOpen').value||0)};
    target.active=$('pActive').checked;
    if(pinCleared){delete target.pin; logIt('PIN cleared for '+target.name)}
    var adjEl=$('pAdj');
    if(adjEl&&adjEl.value.trim()!==''){
      var dv=Number(adjEl.value);
      if(isFinite(dv)&&dv!==0){
        if(!target.adj)target.adj=[];
        var why=$('pAdjWhy').value.trim()||'no reason given';
        target.adj.push({d:todayISO(),days:dv,why:why,by:whoLabel()});
        logIt('Balance for '+target.name+' adjusted by '+dv+' days - '+why);
      }
    }
    logIt((isNew?'Added ':'Updated ')+target.name);
    d.close();
    await saveState('Saved.');
    render();
  };
}

function renderReports(){
  var p=$('panel-reports');
  if(!isOffice()){p.innerHTML='';return}
  var rows=S.staff.filter(function(s){return s.active!==false}).map(function(s){
    var b=balance(s);
    if(!b.ok)return '<tr><td class="name">'+esc(s.name)+'</td><td colspan="6" class="faint">joining date needed</td></tr>';
    return '<tr>'+
      '<td class="name">'+esc(s.name)+'<div class="faint">'+esc(s.pos||'')+'</div></td>'+
      '<td class="faint">'+esc(b.win.label)+'</td>'+
      '<td class="n">'+num(b.accrued+b.carry+b.adj)+'</td>'+
      '<td class="n">'+num(b.taken+b.opening)+'</td>'+
      '<td class="n">'+num(b.pending)+'</td>'+
      '<td class="n"><strong>'+num(b.available)+'</strong></td>'+
      '<td class="n">'+num(b.sick.used)+'</td>'+
      '</tr>';
  }).join('');
  var upcoming=S.reqs.filter(function(r){return r.status==='approved'&&r.to>=todayISO()})
    .sort(function(a,b){return a.from<b.from?-1:1});
  p.innerHTML='<div class="card card-pad">'+
      '<h2 class="sec">Balances today</h2>'+
      '<div style="overflow-x:auto"><table><thead><tr><th>Name</th><th>Leave year</th><th class="n">Earned</th>'+
      '<th class="n">Taken</th><th class="n">Waiting</th><th class="n">Left</th><th class="n">Sick</th></tr></thead>'+
      '<tbody>'+rows+'</tbody></table></div>'+
      '<div class="row no-print" style="margin-top:12px;gap:7px">'+
        '<button class="btn" id="repCopy" type="button">Copy as CSV</button>'+
        '<button class="btn" id="repDl" type="button" hidden>Download CSV</button>'+
        '<button class="btn" id="repPrint" type="button">Print</button>'+
      '</div>'+
    '</div>'+
    '<div class="card card-pad" style="margin-top:14px">'+
      '<h2 class="sec">Approved leave still to come</h2>'+
      '<p class="faint">This is what has to be on the duty roster. The two pages do not talk to each other - copy this list and mark those days as Leave when you build the week.</p>'+
      (upcoming.length
        ? '<div style="overflow-x:auto"><table><thead><tr><th>Name</th><th>From</th><th>To</th><th class="n">Days</th><th>Type</th></tr></thead><tbody>'+
          upcoming.map(function(r){
            return '<tr><td class="name">'+esc(nameOf(r.sid))+'</td><td>'+esc(fmtDay(r.from))+'</td><td>'+esc(fmtDay(r.to))+
              '</td><td class="n">'+num(r.days)+'</td><td>'+esc(typeLabel(r.type))+'</td></tr>';
          }).join('')+'</tbody></table></div>'+
          '<div class="row no-print" style="margin-top:12px"><button class="btn" id="rosCopy" type="button">Copy for the roster</button></div>'
        : '<div class="empty">Nothing approved for the days ahead.</div>')+
    '</div>';
  $('repPrint').onclick=function(){window.print()};
  $('repCopy').onclick=function(){copyText(balancesCSV(),'Balances copied.')};
  var rc=$('rosCopy'); if(rc)rc.onclick=function(){copyText(rosterText(upcoming),'Copied. Paste it beside the roster while you build the week.')};
  offerDownload();
}
function balancesCSV(){
  var out=[['Name','Position','Leave year','Earned','Taken','Waiting','Left','Sick used']];
  S.staff.filter(function(s){return s.active!==false}).forEach(function(s){
    var b=balance(s);
    out.push(b.ok
      ? [s.name,s.pos||'',b.win.label,num(b.accrued+b.carry+b.adj),num(b.taken+b.opening),num(b.pending),num(b.available),num(b.sick.used)]
      : [s.name,s.pos||'','joining date needed','','','','','']);
  });
  return out.map(function(r){return r.map(function(c){
    var v=String(c==null?'':c);
    return /[",\n]/.test(v)?('"'+v.replace(/"/g,'""')+'"'):v;
  }).join(',')}).join('\n');
}
function rosterText(list){
  return list.map(function(r){
    return fmtDay(r.from)+(r.from===r.to?'':(' to '+fmtDay(r.to)))+'  '+nameOf(r.sid)+'  '+typeLabel(r.type)+'  ('+num(r.days)+')';
  }).join('\n');
}
function copyText(text,okMsg){
  var ta=document.createElement('textarea');
  ta.value=text; ta.setAttribute('readonly','');
  ta.style.position='fixed'; ta.style.top='-1000px';
  document.body.appendChild(ta); ta.select();
  var ok=false;
  try{ok=document.execCommand('copy')}catch(e){ok=false}
  ta.remove();
  if(ok){toast(okMsg||'Copied.');return}
  if(navigator.clipboard&&navigator.clipboard.writeText){
    navigator.clipboard.writeText(text).then(function(){toast(okMsg||'Copied.')},function(){showText(text)});
  }else showText(text);
}
function showText(text){
  var d=sheetOf('<div class="sheet"><div class="sheet-head"><h3>Copy this</h3>'+
    '<div class="who">The browser would not copy it for us - select it and copy by hand.</div></div>'+
    '<div class="sheet-body"><textarea class="f" rows="12" id="cpBox"></textarea></div>'+
    '<div class="sheet-foot"><button class="btn" id="cpClose" type="button">Close</button></div></div>');
  $('cpBox').value=text; $('cpBox').select();
  $('cpClose').onclick=function(){d.close()};
}
async function offerDownload(){
  var b=$('repDl'); if(!b)return;
  var dl=null;
  try{ dl=(window.claude&&typeof claude.use==='function')?await claude.use('downloads'):null }catch(e){dl=null}
  if(!dl)return;
  b.hidden=false;
  b.onclick=async function(){
    try{
      await dl.save({filename:'Shan Village leave balances '+todayISO()+'.csv',data:balancesCSV()});
      toast('Saved.');
    }catch(e){toast('The download was not saved.',3500)}
  };
}

function renderSettings(){
  var p=$('panel-settings');
  if(!isOffice()){p.innerHTML='';return}
  var po=P();
  p.innerHTML='<div class="card card-pad">'+
      '<h2 class="sec">Leave policy</h2>'+
      '<div class="note-box warn"><strong>These started as the UAE statutory minimums, not as a reading of your contracts.</strong> '+
      'Check every number here against what Shan Village actually promises people, change what differs, and the page follows your policy from then on.</div>'+
      '<div class="grid2" style="margin-top:12px">'+
        '<div class="field"><label class="lbl" for="stAnnual">Annual leave days a year</label>'+
          '<input class="f num" id="stAnnual" type="number" min="0" step="0.5" value="'+esc(po.annualDays)+'"></div>'+
        '<div class="field"><label class="lbl" for="stPartial">Days earned a month in year one</label>'+
          '<input class="f num" id="stPartial" type="number" min="0" step="0.5" value="'+esc(po.partialPerMonth)+'"></div>'+
      '</div>'+
      '<div class="grid2">'+
        '<div class="field"><label class="lbl" for="stMin">Months of service before leave starts</label>'+
          '<input class="f num" id="stMin" type="number" min="0" step="1" value="'+esc(po.minServiceMonths)+'"></div>'+
        '<div class="field"><label class="lbl" for="stCarry">Days that may carry over</label>'+
          '<input class="f num" id="stCarry" type="number" min="0" step="0.5" value="'+esc(po.carryOverMax)+'"></div>'+
      '</div>'+
      '<div class="grid2">'+
        '<div class="field"><label class="lbl" for="stBasis">The leave year runs from</label>'+
          '<select class="f" id="stBasis">'+
            '<option value="anniversary"'+(po.yearBasis==='anniversary'?' selected':'')+'>each person\'s joining date</option>'+
            '<option value="calendar"'+(po.yearBasis==='calendar'?' selected':'')+'>1 January</option>'+
          '</select></div>'+
        '<div class="field"><label class="lbl" for="stAccrual">Annual leave is earned</label>'+
          '<select class="f" id="stAccrual">'+
            '<option value="monthly"'+(po.accrual==='monthly'?' selected':'')+'>month by month</option>'+
            '<option value="upfront"'+(po.accrual==='upfront'?' selected':'')+'>all at once, at the start of the year</option>'+
          '</select></div>'+
      '</div>'+
      '<div class="field"><label class="lbl"><input type="checkbox" id="stSkipHol"'+(po.skipHolidays?' checked':'')+'> Public holidays inside a leave period do not count as leave</label>'+
        '<div class="hint">Off by default: UAE annual leave is counted in calendar days. Turn it on only if that is what your contracts say.</div></div>'+
      '<div class="field"><label class="lbl" for="stNotice">Notice expected for annual leave, in days</label>'+
        '<input class="f num" id="stNotice" type="number" min="0" step="1" value="'+esc(po.noticeDays)+'">'+
        '<div class="hint">Short notice is shown to the person and to the office. It never blocks a request.</div></div>'+
    '</div>'+
    '<div class="card card-pad" style="margin-top:14px">'+
      '<h2 class="sec">Sick leave</h2>'+
      '<div class="grid3">'+
        '<div class="field"><label class="lbl" for="stFull">Days at full pay</label><input class="f num" id="stFull" type="number" min="0" step="1" value="'+esc(po.sick.full)+'"></div>'+
        '<div class="field"><label class="lbl" for="stHalf">Then at half pay</label><input class="f num" id="stHalf" type="number" min="0" step="1" value="'+esc(po.sick.half)+'"></div>'+
        '<div class="field"><label class="lbl" for="stUnp">Then unpaid</label><input class="f num" id="stUnp" type="number" min="0" step="1" value="'+esc(po.sick.unpaid)+'"></div>'+
      '</div>'+
      '<div class="field"><label class="lbl" for="stCert">Certificate required from this many days</label>'+
        '<input class="f num" id="stCert" type="number" min="0" step="1" value="'+esc(po.certFromDays)+'">'+
        '<div class="hint">Set to 0 to never require one. A request that needs a certificate cannot be sent without it.</div></div>'+
      '<div class="field"><label class="lbl" for="stKeep">Keep certificate pictures for this long</label>'+
        '<input class="f num" id="stKeep" type="number" min="7" step="1" value="'+esc(keepDays())+'">'+
        '<div class="hint">The request, its dates and its decision are kept for good. Only the picture is let go, so the page stays under its size limit.</div></div>'+
    '</div>'+
    '<div class="card card-pad" style="margin-top:14px">'+
      '<h2 class="sec">Public holidays</h2>'+
      '<p class="faint">Used only if the setting above is on. Dates are for this page - the roster keeps its own.</p>'+
      '<div id="holList"></div>'+
      '<div class="grid2" style="margin-top:10px">'+
        '<div class="field"><label class="lbl" for="holD">Date</label><input class="f" id="holD" type="date"></div>'+
        '<div class="field"><label class="lbl" for="holN">Name</label><input class="f" id="holN" placeholder="Eid al Fitr"></div>'+
      '</div>'+
      '<div class="row no-print"><button class="btn" id="holAdd" type="button">Add holiday</button></div>'+
    '</div>'+
    '<div class="card card-pad" style="margin-top:14px">'+
      '<h2 class="sec">Office codes</h2>'+
      '<p class="faint">The same owner, admin and chef codes as the roster and the wastage page. Change one here and it changes for this page only.</p>'+
      '<div class="grid3">'+
        '<div class="field"><label class="lbl" for="lkOwner">New owner code</label><input class="f pin" id="lkOwner" type="text" autocomplete="off" placeholder="blank to keep"></div>'+
        '<div class="field"><label class="lbl" for="lkAdmin">New admin code</label><input class="f pin" id="lkAdmin" type="text" autocomplete="off" placeholder="blank to keep"></div>'+
        '<div class="field"><label class="lbl" for="lkChef">New chef code</label><input class="f pin" id="lkChef" type="text" autocomplete="off" placeholder="blank to keep"></div>'+
      '</div>'+
      '<div class="row no-print"><button class="btn" id="lkSave" type="button">Change codes</button></div>'+
    '</div>'+
    '<div class="row no-print" style="margin-top:16px"><button class="btn btn-send" id="stSave" type="button">Save the policy</button></div>';

  renderHolidays();
  $('holAdd').onclick=async function(){
    var d=$('holD').value, n=$('holN').value.trim();
    if(!d){toast('Choose a date.');return}
    if(!S.holidays)S.holidays=[];
    if(S.holidays.some(function(h){return h.d===d})){toast('That date is already listed.');return}
    S.holidays.push({d:d,name:n||'Public holiday'});
    S.holidays.sort(function(a,b){return a.d<b.d?-1:1});
    logIt('Public holiday added: '+d);
    $('holD').value=''; $('holN').value='';
    /* only the list is redrawn - redrawing the whole panel would throw
       away any policy numbers typed above and not yet saved */
    renderHolidays();
    await saveState('Holiday added.');
  };
  $('stSave').onclick=async function(){
    var po=P();
    po.annualDays=Number($('stAnnual').value||0);
    po.partialPerMonth=Number($('stPartial').value||0);
    po.minServiceMonths=Number($('stMin').value||0);
    po.carryOverMax=Number($('stCarry').value||0);
    po.yearBasis=$('stBasis').value;
    po.accrual=$('stAccrual').value;
    po.skipHolidays=$('stSkipHol').checked;
    po.noticeDays=Number($('stNotice').value||0);
    po.sick={full:Number($('stFull').value||0),half:Number($('stHalf').value||0),unpaid:Number($('stUnp').value||0)};
    po.certFromDays=Number($('stCert').value||0);
    S.keepCert=Number($('stKeep').value||365);
    po.confirmed=true;
    logIt('Leave policy changed');
    await saveState('Policy saved.'); render();
  };
  $('lkSave').onclick=async function(){
    if(!cryptoOk()){toast('This browser cannot set a code.',4000);return}
    var o=$('lkOwner').value.trim(), a=$('lkAdmin').value.trim(), c=$('lkChef').value.trim();
    if(!o&&!a&&!c){toast('Type at least one new code.');return}
    if(!S.locks)S.locks={};
    var changed=[];
    if(o){var s1=randSalt();S.locks.owner={salt:s1,hash:await codeHash(o,s1)};changed.push('owner')}
    if(a){var s2=randSalt();S.locks.admin={salt:s2,hash:await codeHash(a,s2)};changed.push('admin')}
    if(c){var s3=randSalt();S.locks.chef={salt:s3,hash:await codeHash(c,s3)};changed.push('chef')}
    logIt('Office code changed: '+changed.join(', '));
    $('lkOwner').value='';$('lkAdmin').value='';$('lkChef').value='';
    await saveState('Codes changed.');
  };
}
function renderHolidays(){
  var el=$('holList'); if(!el)return;
  var list=(S.holidays||[]).slice().sort(function(a,b){return a.d<b.d?-1:1});
  el.innerHTML=list.length
    ? '<div class="chips">'+list.map(function(h,i){
        return '<span class="chip">'+esc(fmtDay(h.d))+' &middot; '+esc(h.name)+
          ' <button class="btn danger" type="button" data-hol="'+i+'" style="padding:2px 7px;font-size:12px">remove</button></span>';
      }).join('')+'</div>'
    : '<div class="empty">None listed.</div>';
  Array.prototype.forEach.call(el.querySelectorAll('[data-hol]'),function(b){
    b.onclick=async function(){
      var i=Number(b.getAttribute('data-hol'));
      var list2=(S.holidays||[]).slice().sort(function(a,b2){return a.d<b2.d?-1:1});
      var h=list2[i]; if(!h)return;
      S.holidays=(S.holidays||[]).filter(function(x){return !(x.d===h.d&&x.name===h.name)});
      logIt('Public holiday removed: '+h.d);
      renderHolidays();
      await saveState('Removed.');
    };
  });
}

function renderLog(){
  var p=$('panel-log');
  if(!isOffice()){p.innerHTML='';return}
  var list=(S.log||[]).slice(0,200);
  p.innerHTML='<div class="card card-pad"><h2 class="sec">Change log</h2>'+
    '<p class="faint">Every decision and every change to the policy, newest first. A name here is the name that was signed in, which is a PIN and not proof.</p>'+
    (list.length?'<div style="overflow-x:auto"><table><thead><tr><th>When</th><th>Who</th><th>What</th></tr></thead><tbody>'+
      list.map(function(e){
        return '<tr><td class="faint">'+esc(stampText(e.t))+'</td><td>'+esc(e.who||'')+'</td><td>'+esc(e.what||'')+'</td></tr>';
      }).join('')+'</tbody></table></div>':'<div class="empty">Nothing yet.</div>')+
    '</div>';
}

function render(){
  renderStamp();
  if(tab==='me')renderMe();
  if(tab==='apply')renderApply();
  if(tab==='team')renderTeam();
  if(tab==='people')renderPeople();
  if(tab==='reports')renderReports();
  if(tab==='settings')renderSettings();
  if(tab==='log')renderLog();
}

/* ---------------------------- wiring bits ----------------------------- */
function wireCert(root){
  Array.prototype.forEach.call(root.querySelectorAll('[data-cert]'),function(b){
    b.onclick=function(){
      var r=S.reqs.filter(function(x){return x.id===b.getAttribute('data-cert')})[0];
      if(!r||!r.cert)return;
      var lb=$('lightbox');
      lb.innerHTML='<img src="'+r.cert+'" alt="Doctor\'s certificate">';
      lb.hidden=false;
      lb.onclick=function(){lb.hidden=true;lb.innerHTML=''};
    };
  });
}
function wireCancel(root){
  Array.prototype.forEach.call(root.querySelectorAll('[data-cancel]'),function(b){
    b.onclick=async function(){
      var id=b.getAttribute('data-cancel');
      var r=S.reqs.filter(function(x){return x.id===id})[0];
      if(!r||r.status!=='pending')return;
      if(!confirm('Cancel this request?'))return;
      r.status='cancelled'; r.decidedAt=new Date().toISOString(); r.decidedBy=whoLabel();
      logIt('Cancelled own request '+fmtDay(r.from));
      await saveState('Request cancelled.'); render();
    };
  });
}
function wireDecide(root){
  Array.prototype.forEach.call(root.querySelectorAll('[data-ok]'),function(b){
    b.onclick=function(){decide(b.getAttribute('data-ok'),'approved')};
  });
  Array.prototype.forEach.call(root.querySelectorAll('[data-no]'),function(b){
    b.onclick=function(){decide(b.getAttribute('data-no'),'rejected')};
  });
}
function decide(id,status){
  var r=S.reqs.filter(function(x){return x.id===id})[0];
  if(!r||r.status!=='pending')return;
  var st=staffById(r.sid), b=st?balance(st):null;
  var warn='';
  if(status==='approved'&&r.type==='annual'&&b&&b.ok&&b.available<r.days){
    warn='<div class="note-box warn">This is more than '+esc(nameOf(r.sid))+' has left ('+num(b.available)+
      ' day'+(b.available===1?'':'s')+'). Approving it takes the balance below zero, which is a decision the page will record but not make for you.</div>';
  }
  var d=sheetOf('<div class="sheet"><div class="sheet-head"><h3>'+(status==='approved'?'Approve':'Reject')+' this request</h3>'+
    '<div class="who">'+esc(nameOf(r.sid))+' &middot; '+esc(typeLabel(r.type))+' &middot; '+
      esc(r.from===r.to?fmtDay(r.from):(fmtDay(r.from)+' to '+fmtDay(r.to)))+' &middot; '+num(r.days)+' days</div></div>'+
    '<div class="sheet-body">'+warn+
      '<div class="field"><label class="lbl" for="dcNote">Note'+(status==='rejected'?' - the reason is worth writing':' (optional)')+'</label>'+
      '<textarea class="f" id="dcNote" rows="2"></textarea></div></div>'+
    '<div class="sheet-foot"><button class="btn" id="dcCancel" type="button">Back</button>'+
    '<button class="btn" id="dcGo" type="button" style="border-color:'+(status==='approved'?'var(--good)':'var(--critical)')+';color:'+(status==='approved'?'var(--good)':'var(--critical)')+'">'+
      (status==='approved'?'Approve':'Reject')+'</button></div></div>');
  $('dcCancel').onclick=function(){d.close()};
  $('dcGo').onclick=async function(){
    r.status=status;
    r.note=$('dcNote').value.trim();
    r.decidedAt=new Date().toISOString();
    r.decidedBy=whoLabel();
    logIt((status==='approved'?'Approved ':'Rejected ')+typeLabel(r.type)+' for '+nameOf(r.sid)+' '+fmtDay(r.from)+
      (r.from===r.to?'':(' to '+fmtDay(r.to))));
    d.close();
    await saveState(status==='approved'?'Approved.':'Rejected.');
    render();
  };
}

/* ------------------------------ publish ------------------------------- */
function buildDocument(){
  var css=document.getElementById('appStyle').textContent;
  var app=document.getElementById('app').textContent;
  var json=JSON.stringify(S).replace(/</g,'\\u003c');
  return '<!doctype html><html lang="en"><head><meta charset="utf-8">'
    +'<meta name="viewport" content="width=device-width,initial-scale=1">'
    +'<title>Shan Village Leave</title>'
    +'<link rel="preconnect" href="https://fonts.googleapis.com">'
    +'<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
    +'<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap">'
    +'<style id="appStyle">'+css+'</style></head><body><div id="root"></div>'
    +'<script id="state" type="application/json">'+json+'<\/script>'
    +'<script id="app">'+app+'<\/script></body></html>';
}
function goReadOnly(){
  readOnly=true;
  var s=$('apState');
  if(s)s.innerHTML='<div class="note-box warn"><strong>This phone cannot write to the page yet.</strong><br>'+
    'That happens when it is signed out of Claude - use <strong>Sign in</strong> at the very top of the screen - '+
    'or when the account it is signed in to was given the link to read but not to edit. '+
    'Balances still show; sending a request needs write access.</div>';
  syncApply&&$('apSend')&&syncApply();
}
function stash(r,tries){
  try{sessionStorage.setItem(PENDING,JSON.stringify({r:r,tries:tries||1}))}catch(e){}
}
function unstash(){
  try{var raw=sessionStorage.getItem(PENDING);return raw?JSON.parse(raw):null}catch(e){return null}
}
function clearStash(){try{sessionStorage.removeItem(PENDING)}catch(e){}}

async function pushRequest(r,tries){
  if(sending)return false;
  if(!api){goReadOnly();return false}
  sending=true;
  var btn=$('apSend'); if(btn){btn.disabled=true;btn.textContent='Sending…'}
  stash(r,tries||1);
  S.reqs.unshift(r);
  logIt('Applied: '+typeLabel(r.type)+' for '+nameOf(r.sid)+' '+fmtDay(r.from)+
    (r.from===r.to?'':(' to '+fmtDay(r.to)))+' - '+num(r.days)+' days');
  var dropped=shedCerts();
  var prevPub=S.pub, prevRev=S.rev||0;
  S.pub=new Date().toISOString(); S.rev=prevRev+1;
  try{
    await api.publish(buildDocument());
    clearStash(); sending=false;
    toast('Sent to the office.'+(dropped?' Older certificates were cleared to make room.':''),3200);
    return true;
  }catch(err){
    S.reqs=S.reqs.filter(function(x){return x.id!==r.id});
    if(S.log&&S.log.length)S.log.shift();
    S.pub=prevPub; S.rev=prevRev;
    sending=false;
    var code=(err&&err.code)||'upstream_error';
    if(code==='conflict'){
      toast('Somebody saved at the same moment - yours is queued and will go again.',4200);
    }else if(code==='not_writer'||code==='not_granted'||code==='not_declared'||
             code==='consent_required'||code==='capability_disabled'){
      clearStash(); goReadOnly();
    }else if(code==='too_large'){
      clearStash();
      $('apState').innerHTML='<div class="note-box bad">The page has grown too large to save. '+
        'Open Settings and lower how long certificate pictures are kept.</div>';
    }else if(code==='rate_limited'){
      toast('Too many at once. Wait a moment and send again.',4000);
    }else{
      toast('That did not send. Check the connection and try again.',4500);
    }
    if(btn){btn.disabled=false}
    syncApply();
    return false;
  }
}
async function saveState(what){
  if(!api){goReadOnly();toast('This phone cannot save - it has the link to read only.',4500);return false}
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

/* -------------------------------- tabs -------------------------------- */
function selectTab(id){
  var t=id.replace('tab-','');
  var officeOnly=['team','people','reports','settings','log'];
  if(!isOffice()&&officeOnly.indexOf(t)>=0){t='me';id='tab-me'}
  tab=t;
  ['me','apply','team','people','reports','settings','log'].forEach(function(k){
    var b=$('tab-'+k), p=$('panel-'+k);
    if(!b||!p)return;
    var on=(k===tab);
    b.setAttribute('aria-selected',on?'true':'false');
    p.hidden=!on;
  });
  render();
}

/* -------------------------------- boot -------------------------------- */
function boot(){
  document.getElementById('root').innerHTML=shell();
  $('whoBtn').onclick=whoClicked;
  ['me','apply','team','people','reports','settings','log'].forEach(function(k){
    var b=$('tab-'+k); if(b)b.onclick=function(){selectTab('tab-'+k)};
  });
  try{
    var raw=sessionStorage.getItem('sv-lv-who');
    if(raw){
      var w=JSON.parse(raw);
      if(w.kind==='staff'&&staffById(w.val))me=w.val;
      else if(w.kind==='office')role=w.val;
    }
  }catch(e){}
  refreshMode();

  var reach = (window.claude&&typeof claude.use==='function')
    ? claude.use('artifact') : Promise.resolve(null);
  reach.then(async function(a){
    api=a; apiKnown=true;
    if(!a){goReadOnly();render();return}
    var st=unstash();
    if(st&&st.r&&!S.reqs.some(function(x){return x.id===st.r.id})){
      if((st.tries||1)<=3){ await pushRequest(st.r,(st.tries||1)+1) }
      else clearStash();
    }
    render();
  }).catch(function(){apiKnown=true;goReadOnly();render()});
}
boot();
