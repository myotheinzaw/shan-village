import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs'
const URL='http://127.0.0.1:8096/shan-village-inventory.html'
const b=await chromium.launch(); const r={}, errors=[]
async function open_(){
  const ctx=await b.newContext({viewport:{width:430,height:940}})
  await ctx.addInitScript(()=>{window.__pub=0
    window.claude={use:async n=>n==='artifact'?{publish:async h=>{window.__pub++;return {version:'v'}}}:null}})
  const p=await ctx.newPage(); p.on('pageerror',e=>errors.push('PAGEERROR '+e.message))
  await p.goto(URL); await p.waitForTimeout(700); return p
}
const tabs=p=>p.$$eval('nav.tabs button',bs=>bs.filter(x=>!x.hidden).map(x=>x.textContent.trim()))
async function signIn(p,c){await p.click('#lockBtn');await p.fill('#lkCode',c);await p.click('#lkGo');await p.waitForTimeout(450)}

// staff code
let p=await open_()
await signIn(p,'ShanStaff-2640')
r.staff_btn=(await p.textContent('#lockBtn')).trim()
r.staff_tabs=await tabs(p)
// seed a couple of items as staff cannot; do it directly then count
await p.evaluate(()=>{
  S.items.push({id:'i1',name:'Cooking oil',sku:'SV-003',cat:'Dry Goods',unit:'bottle',cost:9.75,reorder:24,active:true})
  S.items.push({id:'i2',name:'Jasmine rice',sku:'SV-002',cat:'Rice & Noodles',unit:'kg',cost:4.2,reorder:100,active:true})
  S.moves.push({id:'m1',at:new Date().toISOString(),i:'i1',l:'AGS',q:30,c:9.75,k2:'opening',src:'seed',by:'admin'})
  _stockRev=-1; render()
})
await p.click('#tab-count'); await p.waitForTimeout(400)
await p.selectOption('#ctLoc','AGS'); await p.click('#ctStart'); await p.waitForTimeout(700)
r.staff_canStart=!(await p.locator('#countRun').isHidden())
const line=await p.$eval('#runList .countrow',e=>e.getAttribute('data-line'))
await p.click(`[data-plus="${line}"]`); await p.waitForTimeout(200)
r.staff_counted=await p.inputValue(`[data-qty="${line}"]`)
r.staff_seesBook=await p.evaluate(()=>document.body.innerHTML.includes('book '))   // costs hidden for staff
r.staff_footer=(await p.textContent('#runFoot')).replace(/\s+/g,' ').trim().slice(0,70)
await p.close()

// admin still full
p=await open_()
await signIn(p,'ShanAdmin-4713')
r.admin_tabs=await tabs(p)
r.admin_btn=(await p.textContent('#lockBtn')).trim()
await p.close()

// wrong code
p=await open_()
await p.click('#lockBtn'); await p.fill('#lkCode','ShanStaff-9999'); await p.click('#lkGo'); await p.waitForTimeout(400)
r.wrongRejected=(await p.textContent('#lkErr')).includes('not right')
await b.close()
console.log(JSON.stringify({r,errors},null,1))
