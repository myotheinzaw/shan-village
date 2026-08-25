
/* ---------------------------- item master --------------------------- */
function itemSheet(existing){
  var it=existing||{id:uid('i'),active:true};
  var cats=(S.categories||[]);
  sheet('<div class="sheet"><div class="sheet-head"><h3>'+(existing?'Edit item':'Add item')+'</h3>'+
    '<div class="who">Only a name is required. Everything else can be filled in later.</div></div>'+
    '<div class="sheet-body">'+
    '<div class="grid2">'+
      '<div class="field"><label class="lbl" for="iName">Item name</label><input class="f" id="iName" value="'+esc(it.name||'')+'"></div>'+
      '<div class="field"><label class="lbl" for="iSku">SKU</label><input class="f" id="iSku" value="'+esc(it.sku||'')+'"></div>'+
    '</div>'+
    '<div class="grid2">'+
      '<div class="field"><label class="lbl" for="iCat">Category</label><select class="f" id="iCat">'+
        '<option value="">No category</option>'+cats.map(function(c){
          return '<option value="'+esc(c)+'"'+(c===it.cat?' selected':'')+'>'+esc(c)+'</option>'}).join('')+'</select></div>'+
      '<div class="field"><label class="lbl" for="iBrand">Brand</label><input class="f" id="iBrand" value="'+esc(it.brand||'')+'"></div>'+
    '</div>'+
    '<div class="grid3">'+
      '<div class="field"><label class="lbl" for="iUnit">Count unit</label><input class="f" id="iUnit" placeholder="kg, bottle, box" value="'+esc(it.unit||'')+'"></div>'+
      '<div class="field"><label class="lbl" for="iPUnit">Purchase unit</label><input class="f" id="iPUnit" placeholder="case" value="'+esc(it.punit||'')+'"></div>'+
      '<div class="field"><label class="lbl" for="iConv">Units per purchase unit</label><input class="f num" id="iConv" type="number" step="any" min="0" value="'+esc(it.conv==null?'':it.conv)+'"></div>'+
    '</div>'+
    '<div class="grid2">'+
      '<div class="field"><label class="lbl" for="iCost">Unit cost ('+esc(cur())+' per count unit)</label><input class="f num" id="iCost" type="number" step="0.01" min="0" value="'+esc(it.cost==null?'':it.cost)+'"></div>'+
      '<div class="field"><label class="lbl" for="iSupp">Supplier</label><input class="f" id="iSupp" value="'+esc(it.supplier||'')+'"></div>'+
    '</div>'+
    '<div class="grid3">'+
      '<div class="field"><label class="lbl" for="iMin">Minimum</label><input class="f num" id="iMin" type="number" step="any" min="0" value="'+esc(it.min==null?'':it.min)+'"></div>'+
      '<div class="field"><label class="lbl" for="iReo">Reorder at</label><input class="f num" id="iReo" type="number" step="any" min="0" value="'+esc(it.reorder==null?'':it.reorder)+'"></div>'+
      '<div class="field"><label class="lbl" for="iMax">Maximum</label><input class="f num" id="iMax" type="number" step="any" min="0" value="'+esc(it.max==null?'':it.max)+'"></div>'+
    '</div>'+
    '<div class="field"><label class="lbl" for="iNotes">Notes</label><textarea class="f" id="iNotes">'+esc(it.notes||'')+'</textarea></div>'+
    (existing?'<div class="row"><label class="row" style="gap:7px;font-size:13.5px"><input type="checkbox" id="iActive"'+
      (it.active!==false?' checked':'')+'> Active</label></div>':'')+
    '</div><div class="sheet-foot">'+
    (existing?'<button class="btn danger" id="iOpening">Set opening stock</button>':'')+
    '<div class="spacer"></div><button class="btn" id="iCancel">Cancel</button>'+
    '<button class="btn primary" id="iSave">Save</button></div></div>');
  $('iCancel').onclick=closeSheet;
  var op=$('iOpening'); if(op)op.onclick=function(){closeSheet();openingSheet(it)};
  $('iSave').onclick=function(){
    var name=$('iName').value.trim();
    if(!name){toast('The item needs a name.');return}
    var before=existing?JSON.stringify({n:it.name,c:it.cost,r:it.reorder}):null;
    it.name=name; it.sku=$('iSku').value.trim(); it.cat=$('iCat').value;
    it.brand=$('iBrand').value.trim(); it.unit=$('iUnit').value.trim();
    it.punit=$('iPUnit').value.trim(); it.conv=numOrNull($('iConv').value);
    it.cost=numOrNull($('iCost').value); it.supplier=$('iSupp').value.trim();
    it.min=numOrNull($('iMin').value); it.reorder=numOrNull($('iReo').value); it.max=numOrNull($('iMax').value);
    it.notes=$('iNotes').value.trim();
    if(existing)it.active=$('iActive').checked;
    if(!existing)S.items.push(it);
    logIt(existing?'Item edited':'Item added', it.name+(existing&&before!==JSON.stringify({n:it.name,c:it.cost,r:it.reorder})?' (was '+before+')':''));
    closeSheet(); saveState(existing?'Item saved.':'Item added.'); render();
  };
  setTimeout(function(){$('iName').focus()},60);
}
function numOrNull(v){v=String(v==null?'':v).trim();if(v==='')return null;var n=Number(v);return isFinite(n)?n:null}

function openingSheet(it){
  sheet('<div class="sheet"><div class="sheet-head"><h3>Opening stock</h3>'+
    '<div class="who">'+esc(it.name)+' &mdash; sets the starting quantity at each location. Recorded as an opening movement, not as a silent overwrite.</div></div>'+
    '<div class="sheet-body">'+locList().map(function(l){
      return '<div class="field"><label class="lbl" for="op_'+l.id+'">'+esc(l.name)+
        ' (now '+n3(qtyOf(it.id,l.id))+')</label>'+
        '<input class="f num" id="op_'+l.id+'" type="number" step="any" min="0" placeholder="leave empty to keep"></div>';
    }).join('')+'</div>'+
    '<div class="sheet-foot"><button class="btn" id="opCancel">Cancel</button>'+
    '<button class="btn primary" id="opSave">Save</button></div></div>');
  $('opCancel').onclick=closeSheet;
  $('opSave').onclick=function(){
    var n=0;
    locList().forEach(function(l){
      var v=numOrNull($('op_'+l.id).value); if(v===null)return;
      var diff=n3(v-qtyOf(it.id,l.id)); if(diff===0)return;
      S.moves.push({id:uid('m'),at:new Date().toISOString(),i:it.id,l:l.id,q:diff,
        c:Number(it.cost||0),k2:'opening',src:'manual',by:role});
      n++;
    });
    _stockRev=-1;
    if(n)logIt('Opening stock set',it.name+' at '+n+' location'+(n===1?'':'s'));
    closeSheet(); saveState(n?'Opening stock recorded.':'Nothing changed.'); render();
  };
}

/* ------------------------------ CSV --------------------------------- */
function parseCSV(text){
  var rows=[], row=[], cell='', q=false;
  for(var i=0;i<text.length;i++){
    var c=text[i];
    if(q){
      if(c==='"'){ if(text[i+1]==='"'){cell+='"';i++} else q=false }
      else cell+=c;
    }else{
      if(c==='"')q=true;
      else if(c===','){row.push(cell);cell=''}
      else if(c==='\n'){row.push(cell);rows.push(row);row=[];cell=''}
      else if(c!=='\r')cell+=c;
    }
  }
  if(cell!==''||row.length){row.push(cell);rows.push(row)}
  return rows.filter(function(r){return r.some(function(x){return String(x).trim()!==''})});
}
var CSV_FIELDS=[['sku','SKU'],['name','Item Name'],['cat','Category'],['brand','Brand'],
  ['supplier','Supplier'],['punit','Purchase Unit'],['unit','Count Unit'],['conv','Conversion Factor'],
  ['cost','Unit Cost'],['min','Minimum Stock Level'],['reorder','Reorder Level'],['max','Maximum Stock Level'],
  ['notes','Notes']];
function importSheet(text){
  var rows=parseCSV(text);
  if(rows.length<2){toast('That file has no rows.',3500);return}
  var head=rows[0].map(function(h){return h.trim().toLowerCase()});
  function col(){for(var i=0;i<arguments.length;i++){var k=head.indexOf(arguments[i]);if(k>=0)return k}return -1}
  var map={sku:col('sku','item id','item id / sku','code'),name:col('item name','name','item'),
    cat:col('category'),brand:col('brand'),supplier:col('supplier','preferred supplier'),
    punit:col('purchase unit'),unit:col('stock count unit','count unit','unit'),
    conv:col('conversion factor'),cost:col('unit cost','cost'),
    min:col('minimum stock level','min'),reorder:col('reorder level','reorder'),
    max:col('maximum stock level','max'),notes:col('notes')};
  if(map.name<0){toast('No "Item Name" column found.',4500);return}

  var ok=[],bad=[],dupFile=[],dupExisting=[],seen={};
  rows.slice(1).forEach(function(r,n){
    var g=function(k){return map[k]>=0?String(r[map[k]]==null?'':r[map[k]]).trim():''};
    var name=g('name');
    if(!name){bad.push({n:n+2,why:'no item name'});return}
    var sku=g('sku');
    var key=(sku||name).toLowerCase();
    if(seen[key]){dupFile.push({n:n+2,name:name});return}
    seen[key]=1;
    var exists=S.items.filter(function(i){
      return (sku&&i.sku&&i.sku.toLowerCase()===sku.toLowerCase())||i.name.toLowerCase()===name.toLowerCase()})[0];
    var rec={sku:sku,name:name,cat:g('cat'),brand:g('brand'),supplier:g('supplier'),
      punit:g('punit'),unit:g('unit'),conv:numOrNull(g('conv')),cost:numOrNull(g('cost')),
      min:numOrNull(g('min')),reorder:numOrNull(g('reorder')),max:numOrNull(g('max')),notes:g('notes')};
    var numsBad=['conv','cost','min','reorder','max'].filter(function(k){
      var raw=g(k); return raw!==''&&rec[k]===null});
    if(numsBad.length){bad.push({n:n+2,why:'"'+numsBad.join('", "')+'" is not a number',name:name});return}
    if(exists){dupExisting.push({rec:rec,existing:exists});return}
    ok.push(rec);
  });

  var newCats={};
  ok.concat(dupExisting.map(function(d){return d.rec})).forEach(function(r){
    if(r.cat&&(S.categories||[]).indexOf(r.cat)<0)newCats[r.cat]=1});

  sheet('<div class="sheet"><div class="sheet-head"><h3>Check before importing</h3>'+
    '<div class="who">Nothing is imported until you confirm.</div></div><div class="sheet-body">'+
    '<div class="tiles">'+
      tile('Ready',ok.length,'new items','good')+
      tile('Already here',dupExisting.length,'will be updated')+
      tile('Rejected',bad.length,'cannot be read',bad.length?'bad':'')+
      tile('Repeated in file',dupFile.length,'first one kept',dupFile.length?'warn':'')+
    '</div>'+
    (Object.keys(newCats).length?'<div class="note-box">New categories that will be created: <strong>'+
      esc(Object.keys(newCats).join(', '))+'</strong></div>':'')+
    (bad.length?'<div class="note-box bad"><strong>Rejected rows</strong><br>'+
      bad.slice(0,14).map(function(b){return 'Row '+b.n+(b.name?' ('+esc(b.name)+')':'')+' &mdash; '+esc(b.why)}).join('<br>')+
      (bad.length>14?'<br>and '+(bad.length-14)+' more':'')+'</div>':'')+
    (dupExisting.length?'<div class="note-box warn"><strong>Existing items</strong><br>'+
      esc(dupExisting.slice(0,12).map(function(d){return d.existing.name}).join(', '))+
      (dupExisting.length>12?' and '+(dupExisting.length-12)+' more':'')+
      '<br>Their details will be overwritten. Stock quantities are never touched by an import.</div>':'')+
    '</div><div class="sheet-foot"><button class="btn" id="csvCancel">Cancel</button>'+
    (ok.length+dupExisting.length?'<button class="btn primary" id="csvGo">Import '+
      (ok.length+dupExisting.length)+' item'+((ok.length+dupExisting.length)===1?'':'s')+'</button>':'')+
    '</div></div>');
  $('csvCancel').onclick=closeSheet;
  var go=$('csvGo');
  if(go)go.onclick=function(){
    if(!S.categories)S.categories=[];
    Object.keys(newCats).forEach(function(c){S.categories.push(c)});
    S.categories.sort();
    ok.forEach(function(r){S.items.push(Object.assign({id:uid('i'),active:true},r))});
    dupExisting.forEach(function(d){Object.assign(d.existing,d.rec)});
    logIt('Item master imported',ok.length+' added, '+dupExisting.length+' updated, '+bad.length+' rejected');
    closeSheet(); saveState('Imported '+(ok.length+dupExisting.length)+' items.'); render();
  };
}
function exportItems(){
  var head=CSV_FIELDS.map(function(f){return f[1]});
  var lines=[head.join(',')];
  S.items.forEach(function(it){
    lines.push(CSV_FIELDS.map(function(f){
      var v=it[f[0]]; v=(v==null?'':String(v));
      return /[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v;
    }).join(','));
  });
  var csv=lines.join('\n');
  sheet('<div class="sheet"><div class="sheet-head"><h3>Item master as CSV</h3>'+
    '<div class="who">'+S.items.length+' items. Select all and copy, then paste into Excel and use Text to Columns, or save as a .csv file.</div></div>'+
    '<div class="sheet-body"><textarea class="f" style="min-height:260px;font-family:var(--font-mono);font-size:11.5px" id="csvOut" readonly>'+
    esc(csv)+'</textarea>'+
    '<div class="note-box">A direct file download is deliberately not offered: turning it on would stop this page from being shareable by link, which matters more day to day.</div>'+
    '</div><div class="sheet-foot"><button class="btn primary" id="csvDone">Done</button></div></div>');
  $('csvDone').onclick=closeSheet;
  setTimeout(function(){var t=$('csvOut');t.focus();t.select()},80);
}
