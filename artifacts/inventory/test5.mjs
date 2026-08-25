import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs'
const b=await chromium.launch(); const r={}, errors=[]
async function run(code,key){
  const ctx=await b.newContext({viewport:{width:430,height:940}})
  await ctx.addInitScript(()=>{window.claude={use:async n=>n==='artifact'?{publish:async h=>({version:'v'})}:null}})
  const p=await ctx.newPage(); p.on('pageerror',e=>errors.push(String(e)))
  await p.goto('http://127.0.0.1:8096/shan-village-inventory.html'); await p.waitForTimeout(700)
  await p.click('#lockBtn'); await p.fill('#lkCode',code); await p.click('#lkGo'); await p.waitForTimeout(450)
  await p.evaluate(()=>{
    S.items.push({id:'i1',name:'Cooking oil',sku:'SV-003',cat:'Dry Goods',unit:'bottle',cost:9.75,reorder:24,active:true})
    S.moves.push({id:'m1',at:new Date().toISOString(),i:'i1',l:'AGS',q:30,c:9.75,k2:'opening',src:'seed',by:'x'})
    _stockRev=-1; render()
  })
  await p.click('#tab-stock'); await p.waitForTimeout(400)
  r[key+'_stockHeaders']=await p.$$eval('#stockTable thead th',t=>t.map(x=>x.textContent.trim()))
  r[key+'_dashHasValue']=(await p.textContent('#dashTiles')).includes('Inventory value')
  await p.click('#tab-count'); await p.waitForTimeout(300)
  await p.selectOption('#ctLoc','AGS'); await p.click('#ctStart'); await p.waitForTimeout(700)
  r[key+'_bookShown']=(await p.locator('#runList .countrow .sys').count())>0
  r[key+'_varianceValueShown']=(await p.textContent('#runText')).includes('value difference')
  await ctx.close()
}
await run('ShanStaff-2640','staff')
await run('ShanAdmin-4713','admin')
await b.close()
console.log(JSON.stringify({r,errors},null,1))
