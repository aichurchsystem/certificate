from playwright.sync_api import sync_playwright
import pathlib, json
url='file://'+str(pathlib.Path('index.html').resolve())
with sync_playwright() as p:
    b=p.chromium.launch()
    pg=b.new_page(viewport={'width':1200,'height':1500})
    pg.goto(url); pg.wait_for_timeout(1200)
    pg.click('#cvGo'); pg.wait_for_timeout(2500)
    info=pg.evaluate("""()=>{
      const r=x=>x?{w:Math.round(x.width),h:Math.round(x.height),t:Math.round(x.top),l:Math.round(x.left)}:null;
      const n=document.getElementById('pNoteLine'), paper=document.getElementById('paper');
      return {view:(document.getElementById('view-issue').hidden?'hidden':'shown'),
              note:n?n.textContent.trim():null, noteRect:r(n),
              footRect:r(document.querySelector('.p-foot')), paperRect:r(paper),
              paperDisplay:paper?getComputedStyle(paper).display:null};
    }""")
    print(json.dumps(info,ensure_ascii=False))
    pg.screenshot(path='full.png', full_page=True)
    b.close()
