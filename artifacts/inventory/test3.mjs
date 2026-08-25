import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs'
const b=await chromium.launch(); const r={}, errors=[]
const ctx=await b.newContext({viewport:{width:430,height:940}})
await ctx.addInitScript(()=>{window.claude={use:async n=>n==='artifact'?{publish:async h=>({version:'v'})}:null}})
const p=await ctx.newPage(); p.on('pageerror',e=>errors.push(String(e)))
await p.goto('http://127.0.0.1:8096/shan-village-inventory.html'); await p.waitForTimeout(700)
await p.click('#lockBtn'); await p.fill('#lkCode','ShanOwner-5027'); await p.click('#lkGo'); await p.waitForTimeout(400)
await p.click('#tab-items'); await p.waitForTimeout(300)
await p.setInputFiles('#csvFile','sample.csv'); await p.waitForTimeout(800)
await p.click('#csvGo'); await p.waitForTimeout(800)
await p.evaluate(()=>{S.items.forEach(it=>S.moves.push({id:'m'+it.id,at:new Date().toISOString(),
  i:it.id,l:'AGK',q:20,c:Number(it.cost||0),k2:'opening',src:'seed',by:'owner'}));_stockRev=-1})
await p.click('#tab-count'); await p.waitForTimeout(300)
await p.selectOption('#ctLoc','AGK'); await p.click('#ctStart'); await p.waitForTimeout(700)
// count: three deliberate values, rest at book
r.plan=await p.evaluate(()=>{
  const t=S.takes[0], ids=Object.keys(t.lines)
  const plan={}
  ids.forEach((k,n)=>{ t.lines[k].q = n===0?7 : n===1?0 : n===2?26 : t.lines[k].sys
    ; t.lines[k].vcom='checked'; t.lines[k].photo='data:image/jpeg;base64,AAAA'
    plan[k]=t.lines[k].q })
  return plan
})
await p.evaluate(()=>{renderRun()}); await p.waitForTimeout(300)
await p.click('#runSubmit'); await p.waitForTimeout(700)
r.status=await p.evaluate(()=>S.takes[0].status)
await p.click('#runApprove'); await p.waitForTimeout(900)
r.stockMatchesCount=await p.evaluate(plan=>{
  return Object.keys(plan).every(id=>Math.abs(qtyOf(id,'AGK')-plan[id])<1e-9)
},r.plan)
r.kitchenTotals=await p.evaluate(plan=>Object.keys(plan).map(id=>qtyOf(id,'AGK')).slice(0,4),r.plan)
r.plannedFirst4=Object.values(r.plan).slice(0,4)
r.otherLocationsUntouched=await p.evaluate(()=>{
  return S.items.every(it=>qtyOf(it.id,'AGS')===0&&qtyOf(it.id,'AQH')===0)})
delete r.plan
// dashboard reflects it
await p.click('#tab-dash'); await p.waitForTimeout(400)
r.dashTiles=(await p.textContent('#dashTiles')).replace(/\s+/g,' ').trim()
await p.screenshot({path:'shot-dash.png',fullPage:false})
await p.click('#tab-count'); await p.waitForTimeout(400)
await p.screenshot({path:'shot-count.png',fullPage:false})
await b.close()
console.log(JSON.stringify({r,errors},null,1))
