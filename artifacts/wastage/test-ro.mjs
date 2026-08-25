import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs'
const b=await chromium.launch(); const errors=[], r={}
// a phone that is signed out of Claude: claude.use resolves null
const ctx=await b.newContext({viewport:{width:430,height:940}})
await ctx.addInitScript(()=>{window.claude={use:async()=>null}})
const p=await ctx.newPage(); p.on('pageerror',e=>errors.push(String(e)))
await p.goto('http://127.0.0.1:8097/shan-village-wastage.html'); await p.waitForTimeout(800)
r.note=(await p.textContent('#sendState')).replace(/\s+/g,' ').trim()
r.sendDisabled=await p.$eval('#sendBtn',e=>e.disabled)
r.sendLabel=await p.$eval('#sendBtn',e=>e.textContent)
r.reloadBtn=!!(await p.$('#roReload'))
await b.close(); console.log(JSON.stringify({r,errors},null,1))
