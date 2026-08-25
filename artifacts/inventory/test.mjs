import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs'
const URL='http://127.0.0.1:8096/shan-village-inventory.html'
const b=await chromium.launch(); const r={}, errors=[]
async function open_(write=true,size={width:430,height:940}){
  const ctx=await b.newContext({viewport:size,timezoneId:'Asia/Yangon'})
  await ctx.addInitScript(([w])=>{
    window.__pub=0
    window.claude={use:async n=>n==='artifact'
      ? {publish:async h=>{ if(!w){const e=new Error('x');e.code='not_writer';throw e}
          window.__pub++; window.__html=h; return {version:'v'} }} : null}
  },[write])
  const p=await ctx.newPage()
  p.on('pageerror',e=>errors.push('PAGEERROR '+e.message))
  await p.goto(URL); await p.waitForTimeout(700); return p
}
const tabs=p=>p.$$eval('nav.tabs button',bs=>bs.filter(x=>!x.hidden).map(x=>x.textContent.trim()))
async function signIn(p,code){
  await p.click('#lockBtn'); await p.fill('#lkCode',code); await p.click('#lkGo'); await p.waitForTimeout(400)
}

// ---------- 1. locked visitor ----------
let p=await open_()
r.tabs_locked=await tabs(p)
r.locOptions=await p.$$eval('#locPick option',o=>o.map(x=>x.textContent))
await p.close()

// ---------- 2. admin: import the item master ----------
p=await open_()
await signIn(p,'ShanAdmin-4713')
r.tabs_admin=await tabs(p)
await p.click('#tab-items'); await p.waitForTimeout(300)
await p.setInputFiles('#csvFile','sample.csv'); await p.waitForTimeout(900)
r.import_summary=(await p.textContent('#sheet .tiles')).replace(/\s+/g,' ').trim()
r.import_rejected=(await p.textContent('#sheet')).includes('not a number')
await p.click('#csvGo'); await p.waitForTimeout(900)
r.items_after=await p.locator('#itemsTable tbody tr').count()
// opening stock for one item at two locations
await p.click('#itemsTable tbody tr:first-child button[data-edit]'); await p.waitForTimeout(400)
r.editSheetName=await p.inputValue('#iName')
await p.click('#iOpening'); await p.waitForTimeout(400)
await p.fill('#op_AGK','12'); await p.fill('#op_AGS','30')
await p.click('#opSave'); await p.waitForTimeout(700)
r.pub_after_opening=await p.evaluate(()=>window.__pub)
await p.click('#tab-stock'); await p.waitForTimeout(400)
r.stock_first_row=(await p.textContent('#stockTable tbody tr:first-child')).replace(/\s+/g,' ').trim()
await p.close()
await b.close()
console.log(JSON.stringify({r,errors},null,1))
