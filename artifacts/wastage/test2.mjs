import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs'
const URL='http://127.0.0.1:8098/shan-village-wastage.html'
const b=await chromium.launch(); const r={}, errors=[]
async function open_(opts={}){
  const ctx=await b.newContext({viewport:{width:420,height:900}})
  await ctx.addInitScript(([o])=>{
    window.__pub=0; window.__lastHtml=null
    // conflict only on the very first publish of the whole session
    let firstConflict=o.conflictOnce && !sessionStorage.getItem('__conflicted')
    window.claude={use:async n=>n==='artifact'
      ? {publish:async h=>{
          if(firstConflict){firstConflict=false;sessionStorage.setItem('__conflicted','1')
            const e=new Error('c');e.code='conflict';throw e}
          window.__pub++; window.__lastHtml=h
          sessionStorage.setItem('__pub',String(window.__pub))
          sessionStorage.setItem('__len',String(h.length))
          return {version:'v'} }}
      : null}
  },[opts])
  const p=await ctx.newPage()
  p.on('pageerror',e=>errors.push('PAGEERROR '+e.message))
  await p.goto(URL); await p.waitForTimeout(600); return p
}

// ---- photo: 586 KB in, small data URI out ----
let p=await open_()
await p.setInputFiles('#shotFile','sample-photo.jpg')
await p.waitForTimeout(1500)
r.hint=(await p.textContent('#shotHint')).trim()
r.previewShown=await p.locator('#shotPrev').isVisible()
r.photoChars=await p.evaluate(()=>photo?photo.length:0)
r.photoKB=Math.round(r.photoChars/1024)
await p.fill('#fItem','Prawns'); await p.fill('#fQty','1.2')
await p.selectOption('#fUnit','kg'); await p.fill('#fBy','Mariam')
await p.click('#sendBtn'); await p.waitForTimeout(1200)
r.pageKB=Math.round(Number(await p.evaluate(()=>sessionStorage.getItem('__len')))/1024)
r.entryHasImg=await p.locator('#todayList .entry img').count()
// lightbox
await p.click('#todayList .entry img'); await p.waitForTimeout(400)
r.lightboxOpen=await p.locator('#light').isVisible()
await p.close()

// ---- conflict: the entry survives the reload and is sent again ----
p=await open_({conflictOnce:true})
await p.fill('#fItem','Tom yum paste'); await p.fill('#fBy','Nay Lin Htet')
await p.click('#sendBtn'); await p.waitForTimeout(900)
r.conflict_pubCount=await p.evaluate(()=>sessionStorage.getItem('__pub'))
r.conflict_stashed=await p.evaluate(()=>!!sessionStorage.getItem('sv-w-pending'))
// the shell would reload the view; do that and watch the retry
await p.reload(); await p.waitForTimeout(1400)
r.afterReload_pubCount=await p.evaluate(()=>sessionStorage.getItem('__pub'))
r.afterReload_stashCleared=await p.evaluate(()=>!sessionStorage.getItem('sv-w-pending'))
r.afterReload_entries=await p.evaluate(()=>S.entries.length)
r.afterReload_tries=await p.evaluate(()=>{const x=sessionStorage.getItem('sv-w-pending');return x?JSON.parse(x).tries:null})
r.afterReload_item=await p.evaluate(()=>S.entries[0]&&S.entries[0].item)
await b.close()
console.log(JSON.stringify({r,errors},null,1))
