import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs'
const b=await chromium.launch(); const r={}, errors=[]
// downloads NOT available - the public-link case
const ctx=await b.newContext({viewport:{width:900,height:1000},timezoneId:'Asia/Dubai'})
await ctx.addInitScript(()=>{window.claude={use:async n=>n==='artifact'?{publish:async()=>({version:'v'})}:null}})
const p=await ctx.newPage(); p.on('pageerror',e=>errors.push(String(e)))
await p.goto('http://127.0.0.1:8098/shan-village-wastage.html'); await p.waitForTimeout(600)
await p.evaluate(()=>{S.entries=[
 {id:'a1',d:'2026-08-25',t:'09:00',item:'Chicken thigh',qty:2,unit:'kg',price:18,reason:'Spoiled',note:'chiller, "overnight"',by:'Aung',role:'staff'},
 {id:'a2',d:'2026-08-24',t:'20:10',item:'Prawns',qty:0.5,unit:'kg',price:31.5,reason:'Dropped',note:'',by:'Mariam',role:'chef'}];render()})
await p.click('#lockBtn'); await p.fill('#lkCode','ShanOwner-5027'); await p.click('#lkGo'); await p.waitForTimeout(500)
await p.click('#tab-history'); await p.waitForTimeout(400)
await p.click('#repMode .chip[data-mode="month"]'); await p.waitForTimeout(300)
await p.click('#repExport'); await p.waitForTimeout(700)
r.boxText=(await p.textContent('#repExportBox')).replace(/\s+/g,' ').trim().slice(0,110)
r.csv=await p.$eval('#repCsv',e=>e.value)
r.tiles=(await p.textContent('#histTiles')).replace(/\s+/g,' ').trim().slice(0,100)
// a chef is no longer office
await p.click('#lockBtn'); await p.waitForTimeout(200)
await p.click('#lockBtn'); await p.fill('#lkCode','ShanChef-8264'); await p.click('#lkGo'); await p.waitForTimeout(500)
r.chefTabs=await p.$$eval('nav.tabs button',bs=>bs.filter(x=>!x.hidden).map(x=>x.textContent.trim()))
await b.close(); console.log(JSON.stringify({r,errors},null,1))
