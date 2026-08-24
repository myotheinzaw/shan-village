
/* ------------------------------ render ------------------------------ */

function render(){
  if(tab==='stock')renderStock();
  else if(tab==='overview')renderOverview();
  else if(tab==='export')renderExport();
  else if(tab==='setup'){renderDrives();renderLists();renderLog()}
  renderPublish();
}

function chip(id,label,n,on){
  return '<button type="button" class="chip" data-'+id+'="'+esc(label)+'" aria-pressed="'+(on?'true':'false')+'">'+
    esc(label)+(n===null?'':'<span class="n">'+n+'</span>')+'</button>';
}

function renderChips(){
  var all=items();
  var cLoc=$('chipsLoc'), cStat=$('chipsStat'), cCat=$('chipsCat');

  var h='<span class="cap">Where</span>'+chip('loc','All',all.length,f.loc==='All');
  (S.locations||[]).forEach(function(L){
    h+=chip('loc',L,all.filter(function(i){return i.loc===L}).length,f.loc===L);
  });
  cLoc.innerHTML=h;

  var nExp=all.filter(function(i){return statusOf(i)==='expired'}).length;
  var nSoon=all.filter(function(i){var s=statusOf(i);return s==='week'||s==='month'}).length;
  var nLow=all.filter(belowPar).length;
  var nToday=all.filter(function(i){return i.invDate===todayISO()}).length;
  cStat.innerHTML='<span class="cap">Show</span>'+chip('stat','All',null,f.stat==='All')+
    chip('stat','Expired',nExp,f.stat==='Expired')+
    chip('stat','Soon',nSoon,f.stat==='Soon')+
    chip('stat','Low',nLow,f.stat==='Low')+
    chip('stat','Today',nToday,f.stat==='Today');

  /* Only categories actually in use — an empty chip helps nobody. */
  var used={}; all.forEach(function(i){if(i.cat)used[i.cat]=(used[i.cat]||0)+1});
  var keys=Object.keys(used).sort();
  if(!keys.length&&f.cat==='All'){cCat.hidden=true}
  else{
    cCat.hidden=false;
    var hc='<span class="cap">Kind</span>'+chip('cat','All',null,f.cat==='All');
    keys.forEach(function(k){hc+=chip('cat',k,used[k],f.cat===k)});
    cCat.innerHTML=hc;
  }

  Array.prototype.forEach.call(document.querySelectorAll('#chipsLoc .chip,#chipsStat .chip,#chipsCat .chip'),function(b){
    b.onclick=function(){
      if(b.dataset.loc!==undefined)f.loc=b.dataset.loc;
      else if(b.dataset.stat!==undefined)f.stat=b.dataset.stat;
      else if(b.dataset.cat!==undefined)f.cat=b.dataset.cat;
      renderStock();
    };
  });
}

function itemCard(it){
  var st=statusOf(it), ph=photoOf(it.id);
  var cls='icard'+(st==='expired'?' exp':(st==='week'?' soon':''));
  var thumb = ph
    ? '<img class="thumb" src="'+ph+'" alt="">'
    : '<div class="thumb none" aria-hidden="true">'+IC_CAM+'</div>';
  var val=valueOf(it);
  return '<button type="button" class="'+cls+'" data-open="'+esc(it.id)+'">'+thumb+
    '<div class="body">'+
      '<div class="nm">'+esc(it.name)+'</div>'+
      '<div class="qt">'+esc(fmtQty(num(it.qty)))+' '+esc(it.unit||'')+
        (val>0?' <span class="faint" style="font-weight:400">&middot; AED '+money(val)+'</span>':'')+'</div>'+
      '<div class="meta">'+statusPill(it)+
        '<span class="pill off">'+esc(it.loc||'No location')+'</span>'+
        (belowPar(it)?'<span class="pill acc">Below minimum</span>':'')+
      '</div>'+
      (it.remark?'<div class="meta faint">'+esc(it.remark)+'</div>':'')+
    '</div></button>';
}

function itemRows(list){
  var h='<thead><tr><th>Item</th><th class="n">Quantity</th><th>Where</th><th>Kind</th>'+
        '<th>Expiry</th><th class="n">Value AED</th><th>Counted</th></tr></thead><tbody>';
  list.forEach(function(it){
    h+='<tr class="clickable" data-open="'+esc(it.id)+'">'+
      '<td><strong>'+esc(it.name)+'</strong>'+(it.remark?'<div class="faint" style="font-size:11.5px">'+esc(it.remark)+'</div>':'')+'</td>'+
      '<td class="n">'+esc(fmtQty(num(it.qty)))+' '+esc(it.unit||'')+(belowPar(it)?'<div><span class="pill acc">Low</span></div>':'')+'</td>'+
      '<td>'+esc(it.loc||'')+(it.sub?'<div class="faint" style="font-size:11.5px">'+esc(it.sub)+'</div>':'')+'</td>'+
      '<td class="muted">'+esc(it.cat||'')+'</td>'+
      '<td>'+statusPill(it)+'</td>'+
      '<td class="n">'+(valueOf(it)>0?money(valueOf(it)):'<span class="faint">—</span>')+'</td>'+
      '<td class="muted">'+esc(dnice(it.invDate))+(it.by?'<div class="faint" style="font-size:11.5px">'+esc(it.by)+'</div>':'')+'</td>'+
    '</tr>';
  });
  return h+'</tbody>';
}

function renderStock(){
  renderChips();
  $('sortBy').value=f.sort;
  $('vCards').setAttribute('aria-pressed',view==='cards'?'true':'false');
  $('vTable').setAttribute('aria-pressed',view==='table'?'true':'false');

  var list=filtered(), all=items().length;
  var shown=list.reduce(function(a,b){return a+valueOf(b)},0);
  $('stockCount').innerHTML = all
    ? '<strong>'+list.length+'</strong> of '+all+' item'+(all===1?'':'s')+
      (shown>0?' &middot; AED '+money(shown)+' counted value':'')
    : '';

  var host=$('stockList');
  if(!all){
    host.innerHTML='<div class="card empty"><div class="big">Nothing counted yet</div>'+
      (readOnly?'Ask the office for the lock code, then start the count.':'Press <strong>New item</strong> to log the first thing on the shelf.')+'</div>';
    return;
  }
  if(!list.length){
    host.innerHTML='<div class="card empty"><div class="big">No match</div>Nothing here fits those filters. Clear the search or pick <strong>All</strong>.</div>';
    return;
  }
  host.innerHTML = view==='table'
    ? '<div class="wrap"><table class="plain">'+itemRows(list)+'</table></div>'
    : '<div class="cards">'+list.map(itemCard).join('')+'</div>';

  Array.prototype.forEach.call(host.querySelectorAll('[data-open]'),function(el){
    el.onclick=function(){openDetail(el.getAttribute('data-open'))};
  });
}

function tile(label,value,foot,cls){
  return '<div class="tile'+(cls?' '+cls:'')+'"><div class="label">'+esc(label)+'</div>'+
    '<div class="value">'+value+'</div>'+(foot?'<div class="foot">'+foot+'</div>':'')+'</div>';
}

function renderOverview(){
  var all=items();
  var value=all.reduce(function(a,b){return a+valueOf(b)},0);
  var exp=all.filter(function(i){return statusOf(i)==='expired'});
  var soon=all.filter(function(i){var s=statusOf(i);return s==='week'||s==='month'});
  var low=all.filter(belowPar);
  var today=all.filter(function(i){return i.invDate===todayISO()});
  var dates=all.map(function(i){return i.invDate}).filter(Boolean).sort();
  var last=dates.length?dates[dates.length-1]:null;

  $('ovTiles').innerHTML=
    tile('Items counted',all.length,last?'Last count '+esc(dnice(last)):'')+
    tile('Counted value','<span style="font-size:16px">AED</span> '+money(value),value?'Across '+(S.locations||[]).length+' locations':'')+
    tile('Expired',exp.length,exp.length?'Take these off the shelf':'Nothing expired',exp.length?'alert':'')+
    tile('Expiring in 30 days',soon.length,soon.length?'Use or move them first':'All clear',soon.length?'warnt':'')+
    tile('Below minimum',low.length,low.length?'Reorder these':'Nothing to reorder',low.length?'warnt':'')+
    tile('Counted today',today.length,esc(dnice(todayISO())));

  var attn=all.filter(function(i){var s=statusOf(i);return s==='expired'||s==='week'||s==='month'||belowPar(i)});
  var rank={expired:0,week:1,month:2,ok:3};
  attn.sort(function(a,b){return rank[statusOf(a)]-rank[statusOf(b)]||String(a.expiry||'9999').localeCompare(String(b.expiry||'9999'))});
  var at=$('actionTable');
  at.innerHTML = attn.length ? itemRows(attn)
    : '<tbody><tr><td style="padding:26px;text-align:center" class="muted">Nothing needs attention. Every item is in date and above its minimum.</td></tr></tbody>';
  Array.prototype.forEach.call(at.querySelectorAll('[data-open]'),function(el){
    el.onclick=function(){openDetail(el.getAttribute('data-open'))};
  });

  bars($('barsLoc'),(S.locations||[]).map(function(L){
    var sub=all.filter(function(i){return i.loc===L});
    return {label:L,n:sub.reduce(function(a,b){return a+valueOf(b)},0),
            amt:'AED '+money(sub.reduce(function(a,b){return a+valueOf(b)},0))+' · '+sub.length+' item'+(sub.length===1?'':'s')};
  }),'No stock counted yet.');

  var byCat={};
  all.forEach(function(i){var k=i.cat||'Uncategorised';byCat[k]=(byCat[k]||0)+1});
  bars($('barsCat'),Object.keys(byCat).sort(function(a,b){return byCat[b]-byCat[a]}).map(function(k){
    return {label:k,n:byCat[k],amt:byCat[k]+' item'+(byCat[k]===1?'':'s')};
  }),'No stock counted yet.');
}

function bars(host,rows,emptyMsg){
  var max=rows.reduce(function(m,r){return Math.max(m,r.n)},0);
  if(!rows.length||!max){host.innerHTML='<div class="muted" style="font-size:13px">'+esc(emptyMsg)+'</div>';return}
  host.innerHTML=rows.map(function(r){
    return '<div class="bar"><div>'+esc(r.label)+'</div>'+
      '<div class="track"><div class="fill" style="width:'+Math.max(2,Math.round(r.n/max*100))+'%"></div></div>'+
      '<div class="amt">'+esc(r.amt)+'</div></div>';
  }).join('');
}

function photoFolderName(){ return S.photoFolder||'Stock Count Photos' }

function renderExport(){
  $('driveLink').href=S.drive||'#';
  var pf=S.drivePhotos||'';
  var pl=$('drivePhotosLink');
  pl.href=pf||S.drive||'#';
  pl.textContent=pf?'Open the photos folder':'Open the Drive folder';

  $('photoHow').innerHTML='<strong>Where the photos go.</strong> Inside the Drive folder, in their own sub-folder named '+
    '<strong>'+esc(photoFolderName())+'</strong> — the .csv stays in the main folder, the pictures stay out of its way.'+
    (pf?'':' <span class="faint">Make that sub-folder once, then paste its link into Setup so this button jumps straight to it.</span>')+
    '<br><br>This page cannot upload to Drive by itself — Drive needs your own Google sign-in, which a shared link does not carry. '+
    'So: press <strong>Save all photos</strong>, confirm each one, then open the folder and upload them from your Downloads. '+
    'Every file is already named <span class="num">location_item_date_ID.jpg</span>, so they sort themselves.';

  var n=Object.keys(S.photos||{}).length;
  var b=storageBytes(), pct=Math.min(100,Math.round(b/HARD_LIMIT*100));
  var cls=b>SOFT_LIMIT?(b>HARD_LIMIT?'bad':'warn'):'';
  $('savePhotos').disabled=!n;
  $('photoMeter').innerHTML=
    '<div class="row" style="justify-content:space-between;font-size:12.5px"><span class="muted"><strong>'+n+'</strong> photo'+(n===1?'':'s')+' held in this page</span>'+
    '<span class="num muted">'+(b/1048576).toFixed(1)+' MB of 13 MB</span></div>'+
    '<div class="meter '+cls+'" style="margin-top:5px"><i style="width:'+pct+'%"></i></div>'+
    (b>SOFT_LIMIT?'<div class="note bad" style="margin-top:10px">The page is getting full. Save the photos to Drive, then clear the old ones from <strong>Setup</strong> so the count keeps saving.</div>':'');
}

function renderDrives(){
  var host=$('drivesCard');
  host.innerHTML='<div><h2 class="sec">Drive folders</h2><p class="sec">Where the count and the photos are filed. Everyone on the link sees these buttons.</p></div>'+
    '<div><label class="lbl" for="dvMain">Main folder — the Excel file goes here</label>'+
      '<input class="f" id="dvMain" type="url" placeholder="https://drive.google.com/drive/folders/…" value="'+esc(S.drive||'')+'"></div>'+
    '<div><label class="lbl" for="dvPhotos">Photos sub-folder — inside the main folder</label>'+
      '<input class="f" id="dvPhotos" type="url" placeholder="Paste the sub-folder link once you have made it" value="'+esc(S.drivePhotos||'')+'"></div>'+
    '<div><label class="lbl" for="dvName">Photos sub-folder name</label>'+
      '<input class="f" id="dvName" placeholder="Stock Count Photos" value="'+esc(S.photoFolder||'')+'"></div>'+
    '<div class="row"><button type="button" class="btn primary" id="dvSave">Save folders</button></div>'+
    '<div class="note">Make the sub-folder in Drive yourself — right-click inside the main folder, <strong>New folder</strong>, call it '+
      esc(photoFolderName())+' — then open it and paste its link above.</div>';
  $('dvSave').onclick=function(){
    var a=$('dvMain').value.trim(), b=$('dvPhotos').value.trim(), c=$('dvName').value.trim();
    var bad=function(u){ return u && !/^https:\/\/(drive|docs)\.google\.com\//.test(u) };
    if(bad(a)||bad(b)){toast('That does not look like a Google Drive link. It should start with https://drive.google.com/',5000);return}
    S.drive=a; S.drivePhotos=b; S.photoFolder=c;
    mark('Changed the Drive folder links');
    renderDrives();
    toast('Folders saved. Publish so everyone gets the new links.',4500);
  };
}

function renderLists(){
  var host=$('listsCard');
  var groups=[
    {key:'locations',title:'Locations',hint:'Where stock is counted.',min:1},
    {key:'categories',title:'Categories',hint:'How the count is grouped in Excel.',min:0},
    {key:'units',title:'Units of measure',hint:'Offered next to the quantity box.',min:1}
  ];
  host.innerHTML='<div><h2 class="sec">Lists</h2><p class="sec">These fill the drop-downs on the item form.</p></div>'+
    groups.map(function(g){
      var vals=S[g.key]||[];
      return '<div><label class="lbl">'+esc(g.title)+' <span class="faint" style="text-transform:none;letter-spacing:0;font-weight:400">— '+esc(g.hint)+'</span></label>'+
        '<div class="chiprow" style="margin-bottom:7px">'+vals.map(function(v,i){
          return '<span class="pill">'+esc(v)+(vals.length>g.min?' <button type="button" class="lx" data-g="'+g.key+'" data-i="'+i+'" title="Remove" style="appearance:none;background:none;border:none;color:var(--critical);cursor:pointer;padding:0 0 0 3px;font-size:13px">&times;</button>':'')+'</span>';
        }).join('')+'</div>'+
        '<div class="row"><input class="f" id="add-'+g.key+'" placeholder="Add to '+esc(g.title.toLowerCase())+'" style="flex:1;max-width:280px">'+
        '<button type="button" class="btn" data-add="'+g.key+'">Add</button></div></div>';
    }).join('')+
    '<div class="note">Removing a location or category never changes stock already counted — those items keep the name they were saved with.</div>'+
    '<div><button type="button" class="btn danger" id="clearPhotos">Clear all photos from this page</button></div>';

  Array.prototype.forEach.call(host.querySelectorAll('[data-add]'),function(b){
    b.onclick=function(){
      var g=b.getAttribute('data-add'), inp=$('add-'+g), v=inp.value.trim();
      if(!v)return;
      if((S[g]||[]).indexOf(v)>=0){toast('“'+v+'” is already on the list.');return}
      S[g]=(S[g]||[]).concat([v]); inp.value='';
      mark('Added '+v+' to '+g); renderLists();
    };
  });
  Array.prototype.forEach.call(host.querySelectorAll('.lx'),function(b){
    b.onclick=function(){
      var g=b.getAttribute('data-g'), i=+b.getAttribute('data-i'), v=S[g][i];
      S[g]=S[g].filter(function(_,j){return j!==i});
      mark('Removed '+v+' from '+g); renderLists();
    };
  });
  $('clearPhotos').onclick=function(){
    var n=Object.keys(S.photos||{}).length;
    if(!n){toast('There are no photos to clear.');return}
    confirmSheet('Clear '+n+' photo'+(n===1?'':'s')+'?','Save them to Drive first — this cannot be undone. The stock list itself is not touched.','Clear photos',function(){
      S.photos={}; mark('Cleared '+n+' photos'); renderLists(); toast(n+' photos cleared.');
    });
  };
}

function renderLog(){
  var t=$('logTable'), log=(S.log||[]).slice().reverse();
  if(!log.length){t.innerHTML='<tbody><tr><td style="padding:26px;text-align:center" class="muted">Nothing published yet.</td></tr></tbody>';return}
  t.innerHTML='<thead><tr><th>When</th><th>Who</th><th>What changed</th></tr></thead><tbody>'+
    log.map(function(e){
      return '<tr><td class="muted" style="white-space:nowrap">'+esc(stampText(e.t))+'</td>'+
        '<td><span class="pill">'+esc(e.who==='admin'?'Admin':'Counter')+'</span></td>'+
        '<td>'+e.items.map(esc).join('<br>')+(e.more?'<div class="faint">and '+e.more+' more</div>':'')+'</td></tr>';
    }).join('')+'</tbody>';
}

function renderPublish(){
  var btn=$('pubBtn'), stamp=$('pubStamp');
  if(!btn)return;
  var when=S.pub?esc(stampText(S.pub)):'Not published yet';
  stamp.innerHTML = !canEdit()
    ? '<strong>'+(S.pub?'Updated '+when:when)+'</strong>Live count'
    : '<strong>'+when+'</strong>'+(dirty
        ? pending.length+' change'+(pending.length===1?'':'s')+' waiting'
        : (S.pub?'Everything is published':'Nothing to publish yet'));
  if(!canEdit()){btn.hidden=true;return}
  btn.hidden=false;
  if(publishing){btn.className='btn-pub busy';btn.disabled=true;btn.innerHTML='Publishing&hellip;';return}
  btn.disabled=!dirty;
  btn.className='btn-pub'+(dirty?'':' clean');
  btn.innerHTML=dirty?'Publish count'+(pending.length?' <span class="cnt">'+pending.length+'</span>':''):'Published';
}

function selectTab(id){
  tab=id.replace('tab-','');
  ['stock','overview','export','setup'].forEach(function(k){
    var b=$('tab-'+k), p=$('panel-'+k);
    var on=k===tab;
    b.setAttribute('aria-selected',on?'true':'false');
    b.setAttribute('tabindex',on?'0':'-1');
    p.hidden=!on;
  });
  /* Nothing on the Excel or Setup tab is about adding stock. */
  $('fabAdd').hidden = (tab==='export'||tab==='setup');
  try{localStorage.setItem('sv-inv-tab',tab)}catch(e){}
  render();
}
