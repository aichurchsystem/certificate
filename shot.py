from playwright.sync_api import sync_playwright
import pathlib, json
url='file://'+str(pathlib.Path('index.html').resolve())
with sync_playwright() as p:
    b=p.chromium.launch()
    pg=b.new_page(viewport={'width':1200,'height':1500})
    pg.goto(url); pg.wait_for_timeout(1200)
    for _ in range(4):
        pg.evaluate("""()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='0');if(b)b.click();}""")
        pg.wait_for_timeout(120)
    pg.wait_for_timeout(800)
    pg.evaluate("()=>{const b=document.getElementById('cvGo'); if(b) b.click();}")
    pg.wait_for_timeout(2500)
    print(pg.evaluate("()=>({issue:document.getElementById('view-issue').hidden?'hidden':'shown', lock:document.querySelector('.lock, #lockModal')?true:false})"))
    el=pg.query_selector('#paperHost')
    el.screenshot(path='host.png')
    b.close()
