
/* ------------------------------ photos ------------------------------
   A phone camera hands over three to five megabytes. That cannot go into
   a page that is republished on every submit, so the picture is redrawn
   on a canvas at a size that is still clear enough to see what was thrown
   away, and the quality is stepped down until it fits the budget. The
   original never leaves the phone.
   -------------------------------------------------------------------- */
function shrink(file,cb){
  if(!file||!/^image\//.test(file.type||'')){cb(null,'That file is not a picture.');return}
  var url=URL.createObjectURL(file), img=new Image();
  img.onload=function(){
    try{
      var w=img.naturalWidth||img.width, h=img.naturalHeight||img.height;
      var s=Math.min(1,PHOTO_EDGE/Math.max(w,h));
      var c=document.createElement('canvas');
      c.width=Math.max(1,Math.round(w*s)); c.height=Math.max(1,Math.round(h*s));
      var ctx=c.getContext('2d');
      ctx.fillStyle='#fff'; ctx.fillRect(0,0,c.width,c.height);   /* no black behind transparency */
      ctx.drawImage(img,0,0,c.width,c.height);
      var q=0.55, out=c.toDataURL('image/jpeg',q);
      while(out.length>PHOTO_MAX&&q>0.24){q=Math.round((q-0.08)*100)/100;out=c.toDataURL('image/jpeg',q)}
      URL.revokeObjectURL(url);
      if(out.length>PHOTO_MAX){cb(null,'That picture is too large even after shrinking. Try again with less detail.');return}
      cb(out,null);
    }catch(err){URL.revokeObjectURL(url);cb(null,'The picture could not be read.')}
  };
  img.onerror=function(){URL.revokeObjectURL(url);cb(null,'The picture could not be read.')};
  img.src=url;
}

/* Photos are the only thing here that grows without limit. Entries are
   kept for good; their pictures are let go once they are older than the
   office asked for, and again - regardless of age - if the page is close
   to the size the platform will accept. The row, the cost and the note
   all survive; only the image goes. */
function keepDays(){var n=Number(S.keep);return (isFinite(n)&&n>0)?n:21}
function shedPhotos(){
  var cut=new Date(todayISO()+'T12:00:00Z');
  cut.setUTCDate(cut.getUTCDate()-keepDays());
  var cutISO=cut.toISOString().slice(0,10), dropped=0;
  S.entries.forEach(function(e){ if(e.photo&&e.d<cutISO){delete e.photo;e.hadPhoto=1;dropped++} });
  var older=S.entries.filter(function(e){return e.photo}).sort(function(a,b){return a.at<b.at?-1:1});
  while(JSON.stringify(S).length>STATE_BUDGET&&older.length){
    var e=older.shift(); delete e.photo; e.hadPhoto=1; dropped++;
  }
  return dropped;
}
