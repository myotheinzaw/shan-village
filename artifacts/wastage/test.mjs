import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs'
const URL='http://127.0.0.1:8098/shan-village-wastage.html'
const b=await chromium.launch(); const r={}, errors=[]
async function open_(write){
  const ctx=await b.newContext({viewport:{width:420,height:900},timezoneId:'Asia/Yangon'})
  await ctx.addInitScript(([w])=>{
    window.__published=null
    window.claude={use:async n=>n==='artifact'
      ? {publish:async h=>{ if(!w){const e=new Error('x');e.code='not_writer';throw e}
          window.__published=h; sessionStorage.setItem('__pub',h.length); return {version:'v'} }}
      : null}
  },[write])
  const p=await ctx.newPage()
  p.on('pageerror',e=>errors.push('PAGEERROR '+e.message))
  p.on('console',m=>{if(m.type()==='error')errors.push('CONSOLE '+m.text())})
  await p.goto(URL); await p.waitForTimeout(700); return p
}
const tabs=p=>p.$$eval('nav.tabs button',bs=>bs.filter(x=>!x.hidden).map(x=>x.textContent.trim()))

// ---- staff, writable link ----
let p=await open_(true)
r.tabs_staff=await tabs(p)
r.lockBtn=(await p.textContent('#lockBtn')).trim()
r.dateDefault=await p.inputValue('#fDate')
r.timeDefault=await p.inputValue('#fTime')
r.reasonCount=await p.locator('#reasonChips .chip').count()
// fill and send
await p.fill('#fItem','Chicken thigh')
await p.fill('#fQty','2.5')
await p.selectOption('#fUnit','kg')
await p.fill('#fPrice','38.50')
await p.click('.chip[data-reason="Spoiled"]')
await p.fill('#fNote','Left out of the chiller overnight')
await p.fill('#fBy','Win Paing')
await p.click('#sendBtn'); await p.waitForTimeout(900)
r.afterSend_tab=await p.$$eval('nav.tabs button',bs=>bs.filter(x=>x.getAttribute('aria-selected')==='true')[0].textContent.trim())
r.today_entries=await p.locator('#todayList .entry').count()
r.today_text=(await p.textContent('#todayList')).replace(/\s+/g,' ').trim().slice(0,150)
r.tiles=(await p.textContent('#todayTiles')).replace(/\s+/g,' ').trim()
r.published_hasEntry=await p.evaluate(()=>!!window.__published && window.__published.includes('Chicken thigh'))
r.formCleared=await p.inputValue('#fItem')
await p.close()

// ---- office code opens history + settings ----
p=await open_(true)
await p.click('#lockBtn'); await p.fill('#lkCode','ShanAdmin-4713'); await p.click('#lkGo')
await p.waitForTimeout(500)
r.tabs_office=await tabs(p)
r.lockBtn_office=(await p.textContent('#lockBtn')).trim()
await p.click('#tab-settings'); await p.waitForTimeout(300)
r.currency=await p.inputValue('#setCur')
r.keepDays=await p.inputValue('#setKeep')
await p.close()

// ---- view-only link ----
p=await open_(false)
await p.fill('#fItem','Rice')
await p.click('#sendBtn'); await p.waitForTimeout(700)
r.readOnlyMsg=(await p.textContent('#sendState')).replace(/\s+/g,' ').trim().slice(0,90)
await p.close()
await b.close()
console.log(JSON.stringify({r,errors},null,1))
