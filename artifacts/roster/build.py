import re,json,sys
html=open('shan-village-roster.html',encoding='utf8').read()
css=open('part-style.css',encoding='utf8').read()
app=open('part-app.js',encoding='utf8').read()
import datetime, json as _json
_st=_json.load(open('state-aug.json',encoding='utf8'))
# Stamp every build. Drafts saved against an older build are discarded on load.
_st['built']=datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
state=_json.dumps(_st,separators=(',',':'))
open('state-aug.json','w',encoding='utf8').write(state)
for part,name in ((css,'css'),(app,'app'),(state,'state')):
    assert '</script>' not in part and '</style>' not in part, name

def repl_first(doc,open_tag,close_tag,body):
    i=doc.index(open_tag)+len(open_tag)
    j=doc.index(close_tag,i)
    return doc[:i]+body+doc[j:]

html=repl_first(html,'<style id="appStyle">','</style>',css)
html=repl_first(html,'<script id="state" type="application/json">','</script>',state)
html=repl_first(html,'<script id="app">','</script>',app)
open('shan-village-roster.html','w',encoding='utf8').write(html)
# sanity
assert html.count('<script id="app">')==2 and html.count('id="root"')>=1
print('built',len(html),'bytes')
