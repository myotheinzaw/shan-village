import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs'
const URL='http://127.0.0.1:8096/shan-village-inventory.html'
const b=await chromium.launch(); const r={}, errors=[]
const ctx=await b.newContext({viewport:{width:420,height:920}})
await ctx.addInitScript(()=>{window.__pub=0
  window.claude={use:async n=>n==='artifact'?{publish:async h=>{window.__pub++;window.__html=h;return {version:'v'}}}:null}})
const p=await ctx.newPage(); p.on('pageerror',e=>errors.push('PAGEERROR '+e.message))
await p.goto(URL); await p.waitForTimeout(700)

// a stock taker with the staff code, and an EMPTY item master
await p.click('#lockBtn'); await p.fill('#lkCode','ShanStaff-2640'); await p.click('#lkGo'); await p.waitForTimeout(450)
r.itemsAtStart=await p.evaluate(()=>S.items.length)
await p.click('#tab-count'); await p.waitForTimeout(350)
r.defaultMode=await p.$eval('#ctMode .chip[aria-pressed="true"]',e=>e.textContent.trim())
r.modeHint=(await p.textContent('#ctModeHint')).trim()
r.catHidden=await p.locator('#ctCatWrap').isHidden()
await p.selectOption('#ctLoc','AGS')
await p.click('#ctStart'); await p.waitForTimeout(700)
r.startedWithEmptyMaster=!(await p.locator('#countRun').isHidden())
r.linesAtStart=await p.evaluate(()=>Object.keys(S.takes[0].lines).length)

// add three items one by one, one with a photo
await p.click('#runAdd'); await p.waitForTimeout(400)
await p.fill('#acItem','Cooking oil'); await p.fill('#acQty','8'); await p.fill('#acUnit','bottle')
await p.fill('#acNote','Top shelf, two cartons opened'); await p.fill('#acBy','Win Paing')
await p.click('#acShot')          // the camera button is what arms the input
await p.setInputFiles('#photoFile','../wastage/sample-photo.jpg'); await p.waitForTimeout(1500)
r.photoReady=(await p.textContent('#acHint')).trim()
await p.click('#acSave'); await p.waitForTimeout(1000)
// the sheet reopens for the next item
r.reopened=await p.locator('#acItem').isVisible()
await p.fill('#acItem','Jasmine rice'); await p.fill('#acQty','0'); await p.fill('#acUnit','kg')
await p.click('#acSave'); await p.waitForTimeout(900)
await p.fill('#acItem','Prawns'); await p.fill('#acQty','3.5'); await p.fill('#acUnit','kg')
await p.click('#acSave'); await p.waitForTimeout(900)
await p.click('#acCancel'); await p.waitForTimeout(300)

r.itemsCreated=await p.evaluate(()=>S.items.map(i=>i.name))
r.lines=await p.evaluate(()=>{const t=S.takes[0];return Object.keys(t.lines).map(k=>{
  const L=t.lines[k];return {q:L.q,unit:L.unit,by:L.byName,photo:!!L.photo,note:L.note||''}})})
r.progress=(await p.textContent('#runText')).replace(/\s+/g,' ').trim()
r.cardText=(await p.textContent('#runList')).replace(/\s+/g,' ').trim().slice(0,150)
// validation: blank quantity refused
await p.click('#runAdd'); await p.waitForTimeout(350)
await p.fill('#acItem','Salt'); await p.click('#acSave'); await p.waitForTimeout(300)
r.blankRefused=(await p.textContent('#acErr')).includes('different from leaving it blank')
await p.click('#acCancel'); await p.waitForTimeout(250)
// submit works with no fixed list
await p.click('#runSubmit'); await p.waitForTimeout(800)
r.status=await p.evaluate(()=>S.takes[0].status)
r.blockedSheet=await p.locator('#sheet[open]').count()
r.blockText=r.blockedSheet?(await p.textContent('#sheet')).replace(/\s+/g,' ').trim().slice(0,120):''
r.byNames=await p.evaluate(()=>S.takes[0].byNames)
r.openingPills=await p.locator('#runList .pill:has-text("opening stock")').count()
await p.screenshot({path:'shot-manual.png',fullPage:false})
await b.close()
console.log(JSON.stringify({r,errors},null,1))
