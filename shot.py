from playwright.sync_api import sync_playwright
import pathlib, json
url='file://'+str(pathlib.Path('index.html').resolve())
with sync_playwright() as p:
    b=p.chromium.launch()
    pg=b.new_page(viewport={'width':1100,'height':1400})
    pg.goto(url); pg.wait_for_timeout(1200)
    pg.click('#cvGo'); pg.wait_for_timeout(2000)
    info=pg.evaluate("""()=>{
      const r=x=>x?JSON.parse(JSON.stringify(x.getBoundingClientRect())):null;
      const n=document.getElementById('pNoteLine'), paper=document.getElementById('paper');
      return {note:n?n.textContent.trim():null, noteRect:r(n), footRect:r(document.querySelector('.p-foot')),
              paperRect:r(paper), hostRect:r(document.getElementById('paperHost')),
              transform:paper?getComputedStyle(paper).transform:null};
    }""")
    print(json.dumps(info,ensure_ascii=False))
    pg.locator('#paper').screenshot(path='paper.png')
    b.close()
