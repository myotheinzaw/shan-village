import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs'
const URL='http://127.0.0.1:8098/shan-village-wastage.html'
const b=await chromium.launch(); const r={}, errors=[]

// ---------- a phone signed out of Claude ----------
const ctx=await b.newContext({viewport:{width:430,height:940},timezoneId:'Asia/Yangon'})
await ctx.addInitScript(()=>{window.claude={use:async()=>null}})
const p=await ctx.newPage(); p.on('pageerror',e=>errors.push('RO: '+e))
await p.goto(URL); await p.waitForTimeout(700)
await p.click('#lockBtn'); await p.fill('#lkCode','ShanStaff-2640'); await p.click('#lkGo'); await p.waitForTimeout(400)
async function add(item,qty,price,by){
  await p.click('#tab-add'); await p.waitForTimeout(200)
  await p.fill('#fItem',item); await p.fill('#fQty',qty); await p.fill('#fPrice',price); await p.fill('#fBy',by)
  await p.click('#reasonChips .chip'); await p.click('#sendBtn'); await p.waitForTimeout(500)
}
await add('Chicken thigh','2','18','Aung')
await add('Jasmine rice','1.5','9','Aung')
r.tabAfterSend=await p.$eval('nav.tabs button[aria-selected="true"]',e=>e.textContent)
r.localBox=(await p.textContent('#localBox')).replace(/\s+/g,' ').trim().slice(0,120)
r.todayList=(await p.textContent('#todayList')).replace(/\s+/g,' ').trim().slice(0,150)
r.localCount=await p.evaluate(()=>LOCAL.length)
r.stored=await p.evaluate(()=>JSON.parse(localStorage.getItem('sv-w-local')).length)
r.sendNowDisabled=await p.$eval('#lqSend',e=>e.disabled)
await p.click('#lqText'); await p.waitForTimeout(200)
r.asText=await p.$eval('#lqTextArea',e=>e.value)
// survives a reload
await p.reload(); await p.waitForTimeout(800)
await p.click('#tab-today'); await p.waitForTimeout(300)
r.afterReload=await p.evaluate(()=>LOCAL.length)
r.entriesSent=await p.evaluate(()=>S.entries.length)
await ctx.close()

// ---------- the office opens the same phone, now able to publish ----------
const ctx2=await b.newContext({viewport:{width:900,height:1000},timezoneId:'Asia/Dubai',storageState:undefined})
await ctx2.addInitScript(()=>{ window.__pub=0
  window.claude={use:async n=> n==='artifact' ? {publish:async h=>{window.__pub++;window.__last=h;return{version:'v'+window.__pub}}}
                          : n==='downloads' ? {save:async o=>{window.__saved=o;return{status:'saved'}}} : null }})
const q=await ctx2.newPage(); q.on('pageerror',e=>errors.push('RW: '+e))
await q.goto(URL); await q.waitForTimeout(500)
// seed the same two held entries into this browser, then reload so boot flushes them
await q.evaluate(()=>{localStorage.setItem('sv-w-local',JSON.stringify([
 {id:'wlocal2',at:new Date().toISOString(),d:new Date().toISOString().slice(0,10),t:'09:30',item:'Jasmine rice',qty:1.5,unit:'kg',reason:'Spoiled',note:'',price:9,by:'Aung',role:'staff'},
 {id:'wlocal1',at:new Date().toISOString(),d:new Date().toISOString().slice(0,10),t:'09:00',item:'Chicken thigh',qty:2,unit:'kg',reason:'Spoiled',note:'',price:18,by:'Aung',role:'staff'}]))})
await q.reload(); await q.waitForTimeout(1500)
r.afterFlush_local=await q.evaluate(()=>LOCAL.length)
r.afterFlush_sent=await q.evaluate(()=>S.entries.map(e=>e.item))
r.publishes=await q.evaluate(()=>window.__pub)
r.storedNow=await q.evaluate(()=>JSON.parse(localStorage.getItem('sv-w-local')).length)
// office reports
await q.click('#lockBtn'); await q.fill('#lkCode','ShanAdmin-4713'); await q.click('#lkGo'); await q.waitForTimeout(500)
await q.click('#tab-history'); await q.waitForTimeout(400)
r.repTabs=await q.$$eval('#repMode .chip',e=>e.map(x=>x.textContent))
r.repLabelDay=await q.textContent('#repLabel')
r.tilesDay=(await q.textContent('#histTiles')).replace(/\s+/g,' ').trim().slice(0,120)
r.byItem=(await q.textContent('#repBreak')).replace(/\s+/g,' ').trim().slice(0,200)
await q.click('#repMode .chip[data-mode="week"]'); await q.waitForTimeout(300)
r.repLabelWeek=await q.textContent('#repLabel')
r.hasDayTable=(await q.textContent('#repBreak')).includes('Day by day')
await q.click('#repMode .chip[data-mode="month"]'); await q.waitForTimeout(300)
r.repLabelMonth=await q.textContent('#repLabel')
r.nextDisabled=await q.$eval('#repNext',e=>e.disabled)
await q.click('#repPrev'); await q.waitForTimeout(300)
r.repLabelPrevMonth=await q.textContent('#repLabel')
r.nextEnabledNow=await q.$eval('#repNext',e=>e.disabled)
await q.click('#repMode .chip[data-mode="day"]'); await q.waitForTimeout(300)
await q.click('#repExportAll'); await q.waitForTimeout(600)
r.savedFile=await q.evaluate(()=>window.__saved&&{name:window.__saved.filename,head:window.__saved.data.slice(0,90),len:window.__saved.data.length})
await b.close(); console.log(JSON.stringify({r,errors},null,1))
