import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs'
const URL='http://127.0.0.1:8096/shan-village-inventory.html'
const b=await chromium.launch(); const r={}, errors=[]
const ctx=await b.newContext({viewport:{width:430,height:940}})
await ctx.addInitScript(()=>{
  window.__pub=0
  window.claude={use:async n=>n==='artifact'
    ? {publish:async h=>{window.__pub++;window.__html=h;return {version:'v'}}} : null}
})
const p=await ctx.newPage(); p.on('pageerror',e=>errors.push('PAGEERROR '+e.message))
await p.goto(URL); await p.waitForTimeout(700)
async function signIn(code){ await p.click('#lockBtn'); await p.fill('#lkCode',code); await p.click('#lkGo'); await p.waitForTimeout(400) }

// seed the master + opening stock as admin
await signIn('ShanAdmin-4713')
await p.click('#tab-items'); await p.waitForTimeout(300)
await p.setInputFiles('#csvFile','sample.csv'); await p.waitForTimeout(800)
await p.click('#csvGo'); await p.waitForTimeout(800)
await p.evaluate(()=>{
  // opening stock of 20 for every item at the Kitchen, written as movements
  S.items.forEach(it=>S.moves.push({id:'m'+it.id,at:new Date().toISOString(),i:it.id,l:'AGK',
    q:20,c:Number(it.cost||0),k2:'opening',src:'seed',by:'admin'}))
  _stockRev=-1
})
await p.click('#tab-count'); await p.waitForTimeout(300)
await p.selectOption('#ctLoc','AGK')
await p.click('#ctStart'); await p.waitForTimeout(800)
r.started=(await p.textContent('#runTitle')).trim()
r.progress0=(await p.textContent('#runText')).replace(/\s+/g,' ').trim()

// count: plus, minus, zero, typed
const rows=await p.$$eval('#runList .countrow',rs=>rs.map(x=>x.getAttribute('data-line')))
r.lineCount=rows.length
await p.click(`[data-plus="${rows[0]}"]`); await p.waitForTimeout(150)
await p.click(`[data-plus="${rows[0]}"]`); await p.waitForTimeout(150)
r.after2plus=await p.inputValue(`[data-qty="${rows[0]}"]`)
await p.click(`[data-minus="${rows[0]}"]`); await p.waitForTimeout(150)
r.after1minus=await p.inputValue(`[data-qty="${rows[0]}"]`)
await p.click(`[data-zero="${rows[1]}"]`); await p.waitForTimeout(200)
r.zeroValue=await p.inputValue(`[data-qty="${rows[1]}"]`)
r.zeroIsNotBlank=await p.evaluate(id=>{const t=S.takes[0];return t.lines[id].q===0},rows[1])
r.blankIsNull=await p.evaluate(id=>{const t=S.takes[0];return t.lines[id].q===null},rows[3])
// type a big variance on row 2
await p.fill(`[data-qty="${rows[2]}"]`,'5'); await p.dispatchEvent(`[data-qty="${rows[2]}"]`,'change'); await p.waitForTimeout(300)
r.varPill=(await p.textContent(`[data-line="${rows[2]}"] .crfoot`)).replace(/\s+/g,' ').trim().slice(0,60)

// submit must be blocked: items not counted
await p.click('#runSubmit'); await p.waitForTimeout(500)
r.blocked=(await p.textContent('#sheet')).replace(/\s+/g,' ').trim().slice(0,190)
await p.click('#pbClose'); await p.waitForTimeout(300)

// count everything at book value, then a photo on the varying line
await p.evaluate(()=>{
  const t=S.takes[0]
  Object.keys(t.lines).forEach(k=>{ if(t.lines[k].q==null) t.lines[k].q=t.lines[k].sys })
  renderRun()
})
await p.waitForTimeout(300)
r.progressFull=(await p.textContent('#runText')).replace(/\s+/g,' ').trim()
await p.click('#runSubmit'); await p.waitForTimeout(500)
const blocked2=await p.$('#sheet[open]')
r.blockedForPhoto = blocked2 ? (await p.textContent('#sheet')).includes('need a photo') : false
if(blocked2) await p.click('#pbClose')
await p.waitForTimeout(300)
// attach photo + comment to the varying lines
const varLines=await p.evaluate(()=>{const t=S.takes[0];return Object.keys(t.lines).filter(k=>t.lines[k].q!==t.lines[k].sys)})
r.varLines=varLines.length
for(const id of varLines){
  await p.evaluate(id=>{photoFor=id},id)
  await p.setInputFiles('#photoFile','sample-photo.jpg'); await p.waitForTimeout(1200)
}
r.photoAttached=await p.evaluate(()=>{const t=S.takes[0];return Object.values(t.lines).filter(l=>l.photo).length})
await p.click('#runSubmit'); await p.waitForTimeout(600)
const stillBlocked=await p.$('#sheet[open]')
if(stillBlocked){
  r.blockedForComment=(await p.textContent('#sheet')).includes('need a comment')
  await p.click('#pbClose'); await p.waitForTimeout(300)
  await p.evaluate(()=>{const t=S.takes[0]
    Object.keys(t.lines).forEach(k=>{if(t.lines[k].q!==t.lines[k].sys)t.lines[k].vcom='Recount confirmed - short delivery'})})
  await p.click('#runSubmit'); await p.waitForTimeout(700)
}
r.statusAfterSubmit=await p.evaluate(()=>S.takes[0].status)
r.varValue=await p.evaluate(()=>S.takes[0].varValue)

// approve
await p.click('#runApprove'); await p.waitForTimeout(900)
r.statusAfterApprove=await p.evaluate(()=>S.takes[0].status)
r.countMoves=await p.evaluate(()=>S.moves.filter(m=>m.k2==='count').length)
r.stockNowForVarying=await p.evaluate(id=>qtyOf(id,'AGK'),varLines[0])
r.lineFrozen=await p.evaluate(()=>{const t=S.takes[0];return Object.values(t.lines)[0].sys})
r.qtyDisabled=await p.evaluate(()=>document.querySelector('[data-qty]').disabled)

// reopen reverses
await p.click('#runUnlock'); await p.waitForTimeout(400)
await p.fill('#roWhy','Wrong shelf counted')
await p.click('#roGo'); await p.waitForTimeout(800)
r.statusAfterReopen=await p.evaluate(()=>S.takes[0].status)
r.countMovesAfterReopen=await p.evaluate(()=>S.moves.filter(m=>m.k2==='count').length)
r.auditTop=await p.evaluate(()=>S.audit.slice(0,4).map(a=>a.action))
await b.close()
console.log(JSON.stringify({r,errors},null,1))
