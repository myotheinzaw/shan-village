import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs'
const URL='http://127.0.0.1:8098/shan-village-wastage.html'
const b=await chromium.launch(); const r={}, errors=[]
const ctx=await b.newContext({viewport:{width:430,height:940},timezoneId:'Asia/Dubai'})
await ctx.addInitScript(()=>{window.claude={use:async()=>null}})   // signed out of Claude
const p=await ctx.newPage(); p.on('pageerror',e=>errors.push(String(e)))
await p.goto(URL); await p.waitForTimeout(700)
await p.click('#lockBtn'); await p.fill('#lkCode','ShanStaff-2640'); await p.click('#lkGo'); await p.waitForTimeout(400)
r.shotBtnVisible=await p.locator('#shotBtn').isVisible()
await p.setInputFiles('#shotFile','sample-photo.jpg'); await p.waitForTimeout(1800)
r.hint=(await p.textContent('#shotHint')).trim()
r.previewShown=await p.locator('#shotPrev').isVisible()
r.photoChars=await p.evaluate(()=>photo?photo.length:0)
await p.fill('#fItem','Prawns'); await p.fill('#fQty','1.2'); await p.fill('#fBy','Mariam')
await p.click('#sendBtn'); await p.waitForTimeout(1200)
r.localHasPhoto=await p.evaluate(()=>LOCAL[0]&&!!LOCAL[0].photo)
r.localPhotoKB=await p.evaluate(()=>LOCAL[0]&&LOCAL[0].photo?Math.round(LOCAL[0].photo.length/1024):0)
r.thumbShown=await p.locator('#todayList .entry img').count()
r.storedKB=await p.evaluate(()=>Math.round((localStorage.getItem('sv-w-local')||'').length/1024))
r.formCleared=await p.inputValue('#fItem')
r.previewCleared=await p.locator('#shotPrev').isHidden()
// survives reload
await p.reload(); await p.waitForTimeout(900)
await p.click('#tab-today'); await p.waitForTimeout(400)
r.afterReload_thumb=await p.locator('#todayList .entry img').count()
r.afterReload_photo=await p.evaluate(()=>LOCAL[0]&&!!LOCAL[0].photo)
// zoom
await p.click('#todayList .entry img'); await p.waitForTimeout(400)
r.lightbox=await p.locator('#light').isVisible()
await b.close(); console.log(JSON.stringify({r,errors},null,1))
