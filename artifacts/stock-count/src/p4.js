
/* ------------------------- changes and drafts ----------------------- */

/* Every edit goes through here: it flags the page as unpublished, writes
   a plain-English line for the log, and keeps a local copy so a dropped
   phone signal or an accidental refresh never loses a count. */
function mark(desc){
  if(!canEdit())return;
  dirty=true;
  if(desc)pending.push(desc);
  saveDraft();
  renderPublish();
}
function saveDraft(){
  try{localStorage.setItem('sv-inv-draft',JSON.stringify({rev:S.rev||0,pending:pending,S:S}))}catch(e){}
}
function clearDraft(){ try{localStorage.removeItem('sv-inv-draft')}catch(e){} }
function loadDraft(){
  try{
    var raw=localStorage.getItem('sv-inv-draft'); if(!raw)return false;
    var d=JSON.parse(raw);
    if(!d||!d.S||d.rev!==(S.rev||0))return false;
    if(JSON.stringify(d.S)===JSON.stringify(S))return false;
    S=d.S; pending=d.pending||[];
    return true;
  }catch(e){return false}
}

/* ------------------------------ sheets ------------------------------ */

function sheet(el,html,wide){
  var d=$(el); d.innerHTML=html; d.showModal(); return d;
}
function closeSheet(d){ try{d.close()}catch(e){} }
function confirmSheet(title,body,okLabel,fn){
  var d=sheet('lockSheet',
    '<div class="sheet-head"><div><h3>'+esc(title)+'</h3><div class="who">'+body+'</div></div></div>'+
    '<div class="sheet-foot"><button type="button" class="btn" id="cNo">Cancel</button>'+
    '<button type="button" class="btn primary" id="cYes">'+esc(okLabel)+'</button></div>');
  $('cNo').onclick=function(){closeSheet(d)};
  $('cYes').onclick=function(){closeSheet(d);fn()};
}

/* -------------------------- the item form --------------------------- */

var CONDITIONS=['Good','Near expiry','Damaged','Expired','To discard'];
var STORAGE=['Dry / ambient','Chiller','Freezer'];

function opts(list,sel,blank){
  var h=blank?'<option value="">'+esc(blank)+'</option>':'';
  return h+(list||[]).map(function(v){
    return '<option value="'+esc(v)+'"'+(v===sel?' selected':'')+'>'+esc(v)+'</option>';
  }).join('');
}

function openForm(id){
  if(!canEdit()){toast('Unlock with a code first.');return}
  editing=id||null;
  draftPhoto=undefined;
  var it=editing?findItem(editing):null;
  var isNew=!it;
  it=it||{name:'',qty:'',unit:(S.units||[])[0]||'kg',loc:lastLoc(),cat:'',sub:'',cond:'Good',
          storage:'',expiry:'',invDate:todayISO(),by:lastBy(),batch:'',supplier:'',cost:'',par:'',remark:''};

  var d=sheet('formSheet',
  '<div class="sheet-head"><div><h3>'+(isNew?'New item':'Edit item')+'</h3>'+
    '<div class="who">'+(isNew?'Fill the top five boxes and save. The rest is optional.':esc(editing))+'</div></div>'+
    '<button type="button" class="x" id="fX" aria-label="Close">&times;</button></div>'+
  '<div class="sheet-body">'+
    '<div><label class="lbl" for="iName">Item name <span class="req">*</span></label>'+
      '<input class="f" id="iName" placeholder="e.g. Chicken thigh boneless" value="'+esc(it.name)+'" autocomplete="off"></div>'+

    '<div><label class="lbl" for="iQty">Quantity <span class="req">*</span></label>'+
      '<div class="qtyrow"><input class="f" id="iQty" type="number" inputmode="decimal" step="any" min="0" placeholder="0" value="'+esc(it.qty)+'">'+
      '<select class="f" id="iUnit">'+opts(S.units,it.unit)+'</select></div></div>'+

    '<div><label class="lbl">Location <span class="req">*</span></label>'+
      '<div class="seg" id="iLocSeg">'+(S.locations||[]).map(function(L){
        return '<button type="button" class="segb" data-loc="'+esc(L)+'" aria-pressed="'+(L===it.loc?'true':'false')+'">'+esc(L)+'</button>';
      }).join('')+'</div></div>'+

    '<div class="fgrid">'+
      '<div><label class="lbl" for="iExp">Expiry date</label><input class="f" id="iExp" type="date" value="'+esc(it.expiry)+'"></div>'+
      '<div><label class="lbl" for="iInv">Count date <span class="req">*</span></label><input class="f" id="iInv" type="date" value="'+esc(it.invDate||todayISO())+'"></div>'+
      '<div><label class="lbl" for="iCat">Category</label><select class="f" id="iCat">'+opts(S.categories,it.cat,'— choose —')+'</select></div>'+
      '<div><label class="lbl" for="iCond">Condition</label><select class="f" id="iCond">'+opts(CONDITIONS,it.cond||'Good')+'</select></div>'+
      '<div class="full"><label class="lbl" for="iRem">Remark</label>'+
        '<textarea class="f" id="iRem" placeholder="Anything the next person should know — opened pack, wrong label, short weight&hellip;">'+esc(it.remark)+'</textarea></div>'+
    '</div>'+

    '<div><label class="lbl">Photo</label><div class="photobox">'+
      '<div id="phSlot"></div>'+
      '<div class="ph-actions">'+
        '<input type="file" id="iPhoto" accept="image/*" capture="environment" hidden>'+
        '<button type="button" class="btn" id="phTake">'+IC_CAM+' Take or choose a photo</button>'+
        '<button type="button" class="btn danger" id="phDel" hidden>Remove photo</button>'+
        '<div class="faint" style="font-size:11.5px">Shrunk before saving so the page stays quick. Save the originals to Drive from the Excel &amp; photos tab.</div>'+
      '</div></div></div>'+

    '<details class="more"'+(it.batch||it.supplier||it.cost||it.par||it.sub||it.storage||it.by?' open':'')+'>'+
      '<summary>More details</summary>'+
      '<div class="fgrid">'+
        '<div><label class="lbl" for="iBy">Counted by</label><input class="f" id="iBy" placeholder="Your name" value="'+esc(it.by)+'" autocomplete="off"></div>'+
        '<div><label class="lbl" for="iSub">Shelf / rack</label><input class="f" id="iSub" placeholder="e.g. Chiller 2, shelf B" value="'+esc(it.sub)+'" autocomplete="off"></div>'+
        '<div><label class="lbl" for="iStore">Stored at</label><select class="f" id="iStore">'+opts(STORAGE,it.storage,'— choose —')+'</select></div>'+
        '<div><label class="lbl" for="iBatch">Batch / lot no.</label><input class="f" id="iBatch" value="'+esc(it.batch)+'" autocomplete="off"></div>'+
        '<div><label class="lbl" for="iSup">Supplier</label><input class="f" id="iSup" value="'+esc(it.supplier)+'" autocomplete="off"></div>'+
        '<div><label class="lbl" for="iCost">Unit cost (AED)</label><input class="f" id="iCost" type="number" inputmode="decimal" step="any" min="0" value="'+esc(it.cost)+'"></div>'+
        '<div><label class="lbl" for="iPar">Minimum level</label><input class="f" id="iPar" type="number" inputmode="decimal" step="any" min="0" placeholder="Warn below this" value="'+esc(it.par)+'"></div>'+
        '<div><label class="lbl">Total value</label><div class="f" id="iVal" style="background:var(--surface-sunken);font-family:var(--font-mono)">AED 0.00</div></div>'+
      '</div>'+
    '</details>'+
    '<div id="fErr"></div>'+
  '</div>'+
  '<div class="sheet-foot">'+
    (isNew?'':'<button type="button" class="btn danger admin-only" id="fDel">Delete item</button>')+
    '<div class="spacer"></div>'+
    '<button type="button" class="btn" id="fCancel">Cancel</button>'+
    (isNew?'<button type="button" class="btn" id="fSaveNext">Save &amp; add another</button>':'')+
    '<button type="button" class="btn primary" id="fSave">Save</button>'+
  '</div>');

  var curPhoto = editing?photoOf(editing):null;
  function paintPhoto(){
    var src = draftPhoto===undefined ? curPhoto : draftPhoto;
    $('phSlot').outerHTML = src
      ? '<img class="prev" id="phSlot" src="'+src+'" alt="Photo of this item">'
      : '<div class="dropzone" id="phSlot">'+IC_CAM+'</div>';
    $('phDel').hidden=!src;
  }
  paintPhoto();

  function recalcValue(){
    $('iVal').textContent='AED '+money(num($('iQty').value)*num($('iCost').value));
  }
  $('iQty').oninput=recalcValue; $('iCost').oninput=recalcValue; recalcValue();

  Array.prototype.forEach.call(d.querySelectorAll('#iLocSeg .segb'),function(b){
    b.onclick=function(){
      Array.prototype.forEach.call(d.querySelectorAll('#iLocSeg .segb'),function(o){o.setAttribute('aria-pressed','false')});
      b.setAttribute('aria-pressed','true');
    };
  });

  $('phTake').onclick=function(){$('iPhoto').click()};
  $('phDel').onclick=function(){draftPhoto=null;paintPhoto()};
  $('iPhoto').onchange=function(){
    var file=this.files&&this.files[0]; if(!file)return;
    this.value='';
    shrink(file,function(dataUrl,err){
      if(err){toast('That photo could not be read. Try taking it again.',4000);return}
      draftPhoto=dataUrl; paintPhoto();
    });
  };

  $('fX').onclick=$('fCancel').onclick=function(){closeSheet(d)};
  if($('fDel'))$('fDel').onclick=function(){
    closeSheet(d);
    var target=findItem(editing);
    confirmSheet('Delete “'+(target?target.name:editing)+'”?','It disappears from the count and from the next Excel file. This cannot be undone.','Delete',function(){
      deleteItem(editing); editing=null;
    });
  };
  $('fSave').onclick=function(){ if(saveForm())closeSheet(d) };
  if($('fSaveNext'))$('fSaveNext').onclick=function(){
    if(saveForm()){ closeSheet(d); openForm(null); }
  };
  setTimeout(function(){try{$('iName').focus()}catch(e){}},60);
}

function lastLoc(){
  var a=items(); return a.length?a[a.length-1].loc:(S.locations||[])[0];
}
function lastBy(){
  try{return localStorage.getItem('sv-inv-by')||''}catch(e){return ''}
}

function saveForm(){
  var name=$('iName').value.trim();
  var qty=$('iQty').value;
  var locBtn=document.querySelector('#iLocSeg .segb[aria-pressed="true"]');
  var loc=locBtn?locBtn.getAttribute('data-loc'):'';
  var invDate=$('iInv').value;
  var problems=[];
  if(!name)problems.push('the item name');
  if(qty===''||num(qty)<0)problems.push('a quantity');
  if(!loc)problems.push('a location');
  if(!invDate)problems.push('the count date');
  if(problems.length){
    $('fErr').innerHTML='<div class="note bad">Still needed: '+esc(problems.join(', '))+'.</div>';
    return false;
  }

  var it=editing?findItem(editing):null;
  var isNew=!it;
  if(isNew){ it={id:nextId(),t:new Date().toISOString()}; items().push(it) }

  var before=isNew?null:JSON.stringify(it);
  it.name=name; it.qty=num(qty); it.unit=$('iUnit').value; it.loc=loc;
  it.cat=$('iCat').value; it.cond=$('iCond').value; it.expiry=$('iExp').value;
  it.invDate=invDate; it.remark=$('iRem').value.trim();
  it.by=$('iBy').value.trim(); it.sub=$('iSub').value.trim(); it.storage=$('iStore').value;
  it.batch=$('iBatch').value.trim(); it.supplier=$('iSup').value.trim();
  it.cost=$('iCost').value===''?'':num($('iCost').value);
  it.par=$('iPar').value===''?'':num($('iPar').value);
  it.mt=new Date().toISOString();
  if(it.by){try{localStorage.setItem('sv-inv-by',it.by)}catch(e){}}

  if(draftPhoto!==undefined){
    if(!S.photos)S.photos={};
    if(draftPhoto===null)delete S.photos[it.id];
    else S.photos[it.id]=draftPhoto;
  }
  it.photo=!!(S.photos&&S.photos[it.id]);

  if(storageBytes()>HARD_LIMIT){
    if(S.photos)delete S.photos[it.id];
    it.photo=false;
    toast('The page is full, so the photo was not kept. Save the photos to Drive and clear them in Setup.',6000);
  }

  mark(isNew?('Added '+name+' ('+fmtQty(it.qty)+' '+it.unit+') at '+loc)
            :(before===JSON.stringify(it)?'Touched '+name:'Edited '+name+' at '+loc));
  render();
  toast(isNew?'“'+name+'” added. Remember to publish.':'Saved.');
  return true;
}

function deleteItem(id){
  var it=findItem(id); if(!it)return;
  S.items=items().filter(function(x){return x.id!==id});
  if(S.photos)delete S.photos[id];
  mark('Deleted '+it.name+' from '+it.loc);
  render();
  toast('“'+it.name+'” deleted.');
}

/* --------------------------- item detail ---------------------------- */

function openDetail(id){
  var it=findItem(id); if(!it)return;
  var ph=photoOf(id);
  var rows=[
    ['Quantity',fmtQty(num(it.qty))+' '+esc(it.unit||'')],
    ['Location',esc(it.loc)+(it.sub?' <span class="faint">· '+esc(it.sub)+'</span>':'')],
    ['Category',esc(it.cat||'—')],
    ['Condition',esc(it.cond||'—')+(it.storage?' <span class="faint">· '+esc(it.storage)+'</span>':'')],
    ['Expiry',it.expiry?esc(dnice(it.expiry))+' '+statusPill(it):'<span class="faint">Not set</span>'],
    ['Counted',esc(dnice(it.invDate))+(it.by?' by '+esc(it.by):'')],
    ['Batch',esc(it.batch||'—')],
    ['Supplier',esc(it.supplier||'—')],
    ['Unit cost',it.cost!==''&&it.cost!=null?'AED '+money(num(it.cost)):'<span class="faint">—</span>'],
    ['Total value',valueOf(it)?'<strong>AED '+money(valueOf(it))+'</strong>':'<span class="faint">—</span>'],
    ['Minimum',it.par!==''&&it.par!=null?fmtQty(num(it.par))+' '+esc(it.unit||'')+(belowPar(it)?' <span class="pill acc">Below minimum</span>':''):'<span class="faint">—</span>'],
    ['Remark',esc(it.remark||'—')]
  ];
  var d=sheet('detSheet',
    '<div class="sheet-head"><div><h3>'+esc(it.name)+'</h3><div class="who">'+esc(it.id)+' · logged '+esc(stampText(it.t))+'</div></div>'+
    '<button type="button" class="x" id="dX" aria-label="Close">&times;</button></div>'+
    '<div class="sheet-body">'+
      (ph?'<img class="bigphoto" src="'+ph+'" alt="Photo of '+esc(it.name)+'">':'')+
      '<dl class="kv">'+rows.map(function(r){return '<dt>'+r[0]+'</dt><dd>'+r[1]+'</dd>'}).join('')+'</dl>'+
    '</div>'+
    '<div class="sheet-foot">'+
      (ph?'<button type="button" class="btn" id="dPhoto">Save photo</button>':'')+
      '<div class="spacer"></div>'+
      '<button type="button" class="btn" id="dClose">Close</button>'+
      '<button type="button" class="btn primary editor-only" id="dEdit">Edit</button>'+
    '</div>');
  $('dX').onclick=$('dClose').onclick=function(){closeSheet(d)};
  $('dEdit').onclick=function(){closeSheet(d);openForm(id)};
  if($('dPhoto'))$('dPhoto').onclick=function(){savePhoto(it,ph)};
}

/* ----------------------------- photos ------------------------------- */

/* A phone photo is 3-6 MB; the whole page has to stay under 16 MB, so
   every picture is redrawn at most 1000px on its long side before it is
   kept. Enough to read a label, small enough to publish. */
function shrink(file,cb){
  var url=URL.createObjectURL(file);
  var img=new Image();
  img.onload=function(){
    try{
      var w=img.naturalWidth, h=img.naturalHeight;
      var k=Math.min(1,PHOTO_MAX/Math.max(w,h));
      var c=document.createElement('canvas');
      c.width=Math.max(1,Math.round(w*k)); c.height=Math.max(1,Math.round(h*k));
      var x=c.getContext('2d');
      x.fillStyle='#fff'; x.fillRect(0,0,c.width,c.height);
      x.drawImage(img,0,0,c.width,c.height);
      cb(c.toDataURL('image/jpeg',PHOTO_Q));
    }catch(e){cb(null,e)}
    URL.revokeObjectURL(url);
  };
  img.onerror=function(){URL.revokeObjectURL(url);cb(null,new Error('decode'))};
  img.src=url;
}

function safeName(s){
  return String(s||'').replace(/[\\/:*?"<>|#]+/g,'').replace(/\s+/g,'-').replace(/^-+|-+$/g,'').slice(0,42)||'item';
}
function photoFilename(it){
  return [safeName(it.loc),safeName(it.name),it.invDate||todayISO(),it.id].join('_')+'.jpg';
}
function dataUrlBytes(u){
  var b=atob(String(u).split(',')[1]||'');
  var a=new Uint8Array(b.length);
  for(var i=0;i<b.length;i++)a[i]=b.charCodeAt(i);
  return a;
}
async function savePhoto(it,ph){
  if(!dl){toast('Saving files is not available in this view.',4000);return}
  try{
    await dl.save({filename:photoFilename(it),data:dataUrlBytes(ph)});
    toast('Photo saved. Upload it to “'+photoFolderName()+'” in Drive.',4500);
  }catch(err){
    var c=(err&&err.code)||'unavailable';
    if(c==='declined')return;
    toast(c==='rate_limited'?'One file at a time — try again in a moment.':'That photo could not be saved.',3800);
  }
}
async function saveAllPhotos(){
  if(!dl){toast('Saving files is not available in this view.',4000);return}
  toast('Saving one at a time — confirm each. They all belong in “'+photoFolderName()+'”.',5000);
  var ids=Object.keys(S.photos||{});
  var list=ids.map(findItem).filter(Boolean);
  if(!list.length){toast('There are no photos to save.');return}
  var done=0,declined=0;
  for(var i=0;i<list.length;i++){
    var it=list[i];
    try{
      await dl.save({filename:photoFilename(it),data:dataUrlBytes(S.photos[it.id])});
      done++; declined=0;
      toast('Saved '+done+' of '+list.length+'…',2200);
    }catch(err){
      var c=(err&&err.code)||'unavailable';
      if(c==='declined'){ declined++; if(declined>=2)break; continue }
      if(c==='rate_limited'){ i--; await new Promise(function(r){setTimeout(r,1400)}); continue }
      toast('Stopped after '+done+' photo'+(done===1?'':'s')+'.',4000); return;
    }
  }
  toast(done?done+' photo'+(done===1?'':'s')+' saved. Now upload them to “'+photoFolderName()+'” in Drive.':'No photos were saved.',6000);
}

/* ------------------------------ export ------------------------------ */

var COLS=[
  ['Item ID',      function(i){return i.id}],
  ['Item',         function(i){return i.name}],
  ['Category',     function(i){return i.cat}],
  ['Quantity',     function(i){return num(i.qty)}],
  ['Unit',         function(i){return i.unit}],
  ['Location',     function(i){return i.loc}],
  ['Shelf / rack', function(i){return i.sub}],
  ['Stored at',    function(i){return i.storage}],
  ['Condition',    function(i){return i.cond}],
  ['Expiry date',  function(i){return i.expiry}],
  ['Days to expiry',function(i){var d=daysTo(i.expiry);return d===null?'':d}],
  ['Status',       function(i){return STATUS_LABEL[statusOf(i)]}],
  ['Count date',   function(i){return i.invDate}],
  ['Counted by',   function(i){return i.by}],
  ['Batch / lot',  function(i){return i.batch}],
  ['Supplier',     function(i){return i.supplier}],
  ['Unit cost AED',function(i){return i.cost===''||i.cost==null?'':num(i.cost)}],
  ['Total value AED',function(i){return valueOf(i)||''}],
  ['Minimum level',function(i){return i.par===''||i.par==null?'':num(i.par)}],
  ['Below minimum',function(i){return belowPar(i)?'YES':''}],
  ['Remark',       function(i){return i.remark}],
  ['Photo',        function(i){return photoOf(i.id)?photoFilename(i):''}],
  ['First logged', function(i){return i.t?String(i.t).slice(0,19).replace('T',' '):''}],
  ['Last updated', function(i){return i.mt?String(i.mt).slice(0,19).replace('T',' '):''}]
];

function cell(v){
  var s=v==null?'':String(v);
  return /[",\n\r]/.test(s) ? '"'+s.replace(/"/g,'""')+'"' : s;
}
function buildCsv(list){
  var rows=[COLS.map(function(c){return cell(c[0])}).join(',')];
  list.forEach(function(it){ rows.push(COLS.map(function(c){return cell(c[1](it))}).join(',')) });
  /* The BOM is what tells Excel the file is UTF-8 — without it Burmese
     and Arabic item names arrive as mojibake. */
  return '﻿'+rows.join('\r\n')+'\r\n';
}
function buildTsv(list){
  var clean=function(v){return String(v==null?'':v).replace(/[\t\r\n]+/g,' ')};
  return [COLS.map(function(c){return c[0]}).join('\t')]
    .concat(list.map(function(it){return COLS.map(function(c){return clean(c[1](it))}).join('\t')}))
    .join('\n');
}
async function downloadCsv(list,label){
  if(!list.length){toast('There is nothing to export yet.');return}
  var name='Shan-Village-Stock-'+label+'-'+todayISO()+'.csv';
  if(!dl){toast('Downloads are not available here — use Copy to clipboard.',4500);return}
  try{
    await dl.save({filename:name,data:buildCsv(list)});
    toast('Saved as '+name,4500);
  }catch(err){
    var c=(err&&err.code)||'unavailable';
    if(c==='declined')return;
    if(c==='extension_not_enabled'||c==='rejected_extension'){
      copyTsv(list,'CSV files are blocked in this view, so the count was copied instead — paste it into Excel.');
      return;
    }
    if(c==='rate_limited'){toast('One file at a time — try again in a moment.',3500);return}
    if(c==='too_large'){toast('That count is too big for one file. Filter it down and export again.',5000);return}
    toast('The file could not be saved. Use Copy to clipboard instead.',4500);
  }
}
function copyTsv(list,msg){
  if(!list.length){toast('There is nothing to copy yet.');return}
  var text=buildTsv(list);
  var ok=function(){toast(msg||('Copied '+list.length+' rows. Paste into Excel with Ctrl+V.'),5000)};
  if(navigator.clipboard&&navigator.clipboard.writeText){
    navigator.clipboard.writeText(text).then(ok,function(){legacyCopy(text,ok)});
  }else legacyCopy(text,ok);
}
function legacyCopy(text,ok){
  var ta=document.createElement('textarea');
  ta.value=text; ta.style.position='fixed'; ta.style.opacity='0';
  document.body.appendChild(ta); ta.select();
  try{document.execCommand('copy');ok()}catch(e){toast('Copying was blocked by the browser.',4000)}
  document.body.removeChild(ta);
}
function attentionList(){
  return items().filter(function(i){
    var s=statusOf(i); return s==='expired'||s==='week'||s==='month'||belowPar(i);
  });
}
