import datetime, json
css=open('part-style.css',encoding='utf8').read()
app=open('part-app.js',encoding='utf8').read()
st=json.load(open('state.json',encoding='utf8'))
st['built']=datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
state=json.dumps(st,separators=(',',':')).replace('<','\\u003c')
json.dump(st,open('state.json','w',encoding='utf8'),separators=(',',':'))
# Only </script> can break out of a <script>; </style> inside JS is inert.
assert '</style>' not in css, 'css'
for part,name in ((app,'app'),(state,'state')):
    assert '</script>' not in part, name
html=('<!doctype html><html lang="en"><head><meta charset="utf-8">'
 '<meta name="viewport" content="width=device-width,initial-scale=1">'
 '<title>Shan Village Daily Wastage</title>'
 '<link rel="preconnect" href="https://fonts.googleapis.com">'
 '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
 '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700'
 '&family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap">'
 '<style id="appStyle">'+css+'</style></head><body><div id="root"></div>'
 '<script id="state" type="application/json">'+state+'</script>'
 '<script id="app">'+app+'</script></body></html>')
open('shan-village-wastage.html','w',encoding='utf8').write(html)
print('built',len(html),'bytes')
