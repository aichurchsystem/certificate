from playwright.sync_api import sync_playwright
import pathlib
url='file://'+str(pathlib.Path('index.html').resolve())+'?v=71'
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':1200,'height':1500})
    pg.goto(url); pg.wait_for_timeout(1200)
    for _ in range(4):
        pg.evaluate("()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='0');if(b)b.click();}")
        pg.wait_for_timeout(100)
    pg.wait_for_timeout(600)
    pg.evaluate("()=>document.getElementById('cvGo').click()"); pg.wait_for_timeout(1500)
    print(pg.evaluate("()=>{const s=JSON.parse(localStorage.getItem('cert.v1')||'{}'); const f=(s.fmt&&s.fmt.note1)||''; return {note1:f, note2:(s.fmt||{}).note2, text:document.getElementById('pNoteLine').textContent};}"))
    b.close()
