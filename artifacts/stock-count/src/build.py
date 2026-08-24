import io,json
state={"v":1,"rev":0,"pub":None,"seq":0,
# The three duty-roster codes, salted SHA-256. The codes themselves are
# never stored here or in the page — only these hashes, so reading the
# source tells you nothing you could type into the unlock box.
"locks":{
  "owner":{"salt":"bc69ec96b0f04feb","hash":"9fa927b9d4cd8d066c4e9b0275e3b709de889cd9f245119613f11940f874727f"},
  "admin":{"salt":"3fb72138ef198064","hash":"cb73a503db92459dddebe27702afbac47ac5cd73fac68eb72c6f59921292d15e"},
  "chef": {"salt":"3714cd325fe6fc22","hash":"5fc59c7b661583778bbf49c7d728b647c78a603177393ca928048231c5cc9583"}
},

"drive":"https://drive.google.com/drive/folders/1N-185axMNfrq49iXSlLTH1iF-mo15uRy?usp=sharing",
"drivePhotos":"",
"photoFolder":"Stock Count Photos",
"locations":["Al Ghurair Store","Al Ghurair Kitchen","Home Al Quoz"],
"categories":["Rice & Noodles","Dry Goods","Spices & Masala","Sauces & Oils","Vegetables","Fruits","Meat & Poultry","Seafood","Dairy & Eggs","Frozen","Beverages","Bakery","Packaging & Disposables","Cleaning & Chemicals","Equipment & Utensils","Other"],
"units":["kg","g","L","ml","pcs","pack","box","carton","bag","bottle","can","tray","tin","bundle","dozen"],
"staff":["Hla Kyawt Khing","Phyu Sin Maung","Win Paing","Thiha Naing Soe","Kaung Htet Zaw","Nay Lin Htet","Mariam"],
"items":[],"photos":{},"log":[]}
head=io.open('p1.html',encoding='utf8').read()
js=''.join(io.open('p%d.js'%i,encoding='utf8').read() for i in (2,3,4,5))
assert '</script>' not in js, 'raw closing script tag in JS'
out = head + '<script id="state" type="application/json">' + json.dumps(state,ensure_ascii=False).replace('<','\\u003c') + '</script>\n<script id="app">' + js + '</script></body></html>\n'
io.open('../stock-count.html','w',encoding='utf8').write(out)
io.open('app-only.js','w',encoding='utf8').write(js)  # for `node --check`
print('built', len(out.encode('utf8')), 'bytes')
