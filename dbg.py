from playwright.sync_api import sync_playwright
import pathlib
url='file://'+str(pathlib.Path('index.html').resolve())+'?v=77'
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':1200,'height':1500})
    errs=[]
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(url); pg.wait_for_timeout(1500)
    print(pg.evaluate("()=>({q:typeof window.qrcode, q2:typeof qrcode})"))
    for _ in range(4):
        pg.evaluate("()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='0');if(b)b.click();}")
        pg.wait_for_timeout(100)
    pg.wait_for_timeout(500)
    pg.evaluate("()=>document.getElementById('cvGo').click()"); pg.wait_for_timeout(1500)
    print(pg.evaluate("()=>{const i=document.getElementById('pQr');return {hidden:i.hidden, src:(i.src||'').slice(0,60), w:i.width, h:i.height, complete:i.complete};}"))
    print('errors', errs[:3])
    b.close()
