import io,json
state={"v":1,"rev":0,"pub":None,"seq":0,"locks":None,
"drive":"https://drive.google.com/drive/folders/1N-185axMNfrq49iXSlLTH1iF-mo15uRy?usp=sharing",
"drivePhotos":"",
"photoFolder":"Stock Count Photos",
"locations":["Al Ghurair Store","Al Ghurair Kitchen","Home Al Quoz"],
"categories":["Rice & Noodles","Dry Goods","Spices & Masala","Sauces & Oils","Vegetables","Fruits","Meat & Poultry","Seafood","Dairy & Eggs","Frozen","Beverages","Bakery","Packaging & Disposables","Cleaning & Chemicals","Equipment & Utensils","Other"],
"units":["kg","g","L","ml","pcs","pack","box","carton","bag","bottle","can","tray","tin","bundle","dozen"],
"items":[],"photos":{},"log":[]}
head=io.open('p1.html',encoding='utf8').read()
js=''.join(io.open('p%d.js'%i,encoding='utf8').read() for i in (2,3,4,5))
assert '</script>' not in js, 'raw closing script tag in JS'
out = head + '<script id="state" type="application/json">' + json.dumps(state,ensure_ascii=False).replace('<','\\u003c') + '</script>\n<script id="app">' + js + '</script></body></html>\n'
io.open('../stock-count.html','w',encoding='utf8').write(out)
io.open('app-only.js','w',encoding='utf8').write(js)  # for `node --check`
print('built', len(out.encode('utf8')), 'bytes')
