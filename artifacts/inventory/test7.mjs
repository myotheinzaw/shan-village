import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs'
const b=await chromium.launch(); const r={}, errors=[]
const ctx=await b.newContext({viewport:{width:430,height:940}})
await ctx.addInitScript(()=>{window.claude={use:async n=>n==='artifact'?{publish:async h=>({version:'v'})}:null}})
const p=await ctx.newPage(); p.on('pageerror',e=>errors.push(String(e)))
await p.goto('http://127.0.0.1:8096/shan-village-inventory.html'); await p.waitForTimeout(700)

const tabs=async()=>p.$$eval('nav.tabs button',bs=>bs.filter(x=>!x.hidden).map(x=>x.textContent))
const openTab=async()=>p.$eval('nav.tabs button[aria-selected="true"]',x=>x.textContent)
r.tabsSignedOut=await tabs(); r.openSignedOut=await openTab()

await p.click('#lockBtn'); await p.fill('#lkCode','ShanStaff-2640'); await p.click('#lkGo'); await p.waitForTimeout(500)
r.tabsStaff=await tabs(); r.openAfterSignIn=await openTab()
await p.click('#tab-dash'); await p.waitForTimeout(300)
r.staffTiles=await p.$$eval('#dashTiles .tile .k',e=>e.map(x=>x.textContent))
r.staffLocValueHidden=await p.$eval('#cardLocValue',e=>e.hidden)
r.staffRecentHidden=await p.$eval('#cardRecentTakes',e=>e.hidden)

await p.click('#tab-count'); await p.waitForTimeout(300)
await p.selectOption('#ctLoc','AGS'); await p.click('#ctStart'); await p.waitForTimeout(600)
const rows=[['Cooking oil','8','bottle'],['Jasmine rice','0','kg'],['Prawns','3.5','kg']]
for(let i=0;i<rows.length;i++){
  const [name,qty,unit]=rows[i]
  if(i===0){ await p.click('#runAdd'); await p.waitForTimeout(350) }
  await p.waitForSelector('#acItem',{state:'visible'})
  await p.fill('#acItem',name); await p.fill('#acQty',qty); await p.fill('#acUnit',unit)
  await p.fill('#acBy','Win Paing'); await p.click('#acSave'); await p.waitForTimeout(700)
}
await p.click('#acCancel'); await p.waitForTimeout(300)
r.runRowsNoBook=await p.$$eval('#runList .sys',e=>e.length)
await p.click('#runSubmit'); await p.waitForTimeout(700)
r.staffSees=(await p.textContent('#runFoot')).replace(/\s+/g,' ').trim().slice(0,70)
r.staffTakesRows=await p.$$eval('#takesTable tbody tr',e=>e.length)

await p.click('#lockBtn'); await p.waitForTimeout(300)
await p.click('#lockBtn'); await p.fill('#lkCode','ShanAdmin-4713'); await p.click('#lkGo'); await p.waitForTimeout(500)
r.tabsAdmin=await tabs()
await p.click('#tab-count'); await p.waitForTimeout(400)
r.takesRow=(await p.textContent('#takesTable')).replace(/\s+/g,' ').trim().slice(0,160)
await p.click('#takesTable button[data-open]'); await p.waitForTimeout(600)
await p.click('#runApprove'); await p.waitForTimeout(900)
r.status=await p.evaluate(()=>S.takes[0].status)
r.moveKinds=await p.evaluate(()=>S.moves.map(m=>m.k2))
r.moveNames=await p.evaluate(()=>S.moves.map(m=>m.byName))
r.stock=await p.evaluate(()=>S.items.map(i=>[i.name,qtyOf(i.id,'AGS')]))
await p.click('#tab-stock'); await p.waitForTimeout(400)
r.stockTable=(await p.textContent('#stockTable')).replace(/\s+/g,' ').trim().slice(0,180)
await p.click('#tab-audit'); await p.waitForTimeout(400)
r.audit=await p.evaluate(()=>S.audit.slice(0,5).map(a=>a.action))
await b.close(); console.log(JSON.stringify({r,errors},null,1))
