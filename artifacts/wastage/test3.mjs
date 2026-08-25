import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs'
const URL='http://127.0.0.1:8098/shan-village-wastage.html'
const b=await chromium.launch(); const r={}, errors=[]
async function open_(write=true){
  const ctx=await b.newContext({viewport:{width:420,height:900},timezoneId:'Asia/Yangon'})
  await ctx.addInitScript(([w])=>{ window.__pub=0
    window.claude={use:async n=>n==='artifact'
      ? {publish:async h=>{ if(!w){const e=new Error('x');e.code='not_writer';throw e}
          window.__pub++; window.__html=h; return {version:'v'} }} : null} },[write])
  const p=await ctx.newPage(); p.on('pageerror',e=>errors.push('PAGEERROR '+e.message))
  await p.goto(URL); await p.waitForTimeout(700); return p
}
const vis=(p,s)=>p.locator(s).isVisible()
const tabs=p=>p.$$eval('nav.tabs button',bs=>bs.filter(x=>!x.hidden).map(x=>x.textContent.trim()))

// 1. no code -> the form is replaced by the gate
let p=await open_()
r.gateShown=await vis(p,'#sendGate')
r.formHidden=!(await vis(p,'#sendForm'))
r.lockBtn=(await p.textContent('#lockBtn')).trim()
r.tabs_locked=await tabs(p)
// wrong code
await p.click('#gateBtn'); await p.fill('#lkCode','nope'); await p.click('#lkGo'); await p.waitForTimeout(400)
r.wrongRejected=(await p.textContent('#lkErr')).includes('not right')
await p.click('#lkCancel'); await p.waitForTimeout(200)
// right code
await p.click('#gateBtn'); await p.fill('#lkCode','ShanStaff-2640'); await p.click('#lkGo'); await p.waitForTimeout(500)
r.staff_lockBtn=(await p.textContent('#lockBtn')).trim()
r.staff_formShown=await vis(p,'#sendForm')
r.staff_gateHidden=!(await vis(p,'#sendGate'))
r.staff_tabs=await tabs(p)                      // must NOT include History / Settings
// send one
await p.fill('#fItem','Coriander'); await p.fill('#fQty','0.4')
await p.selectOption('#fUnit','kg'); await p.click('.chip[data-reason="Spoiled"]')
await p.fill('#fBy','Test staff'); await p.click('#sendBtn'); await p.waitForTimeout(900)
r.sent=await p.evaluate(()=>window.__pub)
r.entryRole=await p.evaluate(()=>S.entries[0]&&S.entries[0].role)
r.todayText=(await p.textContent('#todayList')).replace(/\s+/g,' ').trim().slice(0,80)
await p.close()

// 2. office code still gets everything
p=await open_()
await p.click('#lockBtn'); await p.fill('#lkCode','ShanAdmin-4713'); await p.click('#lkGo'); await p.waitForTimeout(500)
r.admin_tabs=await tabs(p)
await p.click('#tab-settings'); await p.waitForTimeout(300)
r.codeHint=(await p.textContent('#staffCodeState')).trim().slice(0,60)
// rotate the staff code
await p.fill('#setStaffCode','TempCode-99'); await p.click('#setSave'); await p.waitForTimeout(900)
r.rotated=await p.evaluate(()=>!!(S.locks&&S.locks.staff))
r.logged=await p.evaluate(()=>S.log&&S.log[0]&&S.log[0].items[0])
r.fieldCleared=await p.inputValue('#setStaffCode')
await p.close()

// 3. the new code works, the old one does not
p=await open_()
await p.evaluate(()=>{})
await p.click('#gateBtn'); await p.fill('#lkCode','ShanStaff-2640'); await p.click('#lkGo'); await p.waitForTimeout(400)
r.oldCodeStillWorksHere=!(await p.locator('#lkErr').isVisible().catch(()=>false))
await p.close()
await b.close()
console.log(JSON.stringify({r,errors},null,1))
