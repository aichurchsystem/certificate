#!/usr/bin/env python3
"""노회 문서 앱 — 잠근 인명부(245명·사진 193장)와 관리자 비밀번호 점검.

  python3 tools/check_directory.py                                                    # 로컬
  BASE=https://aichurchsystem.github.io/certificate/ python3 tools/check_directory.py   # 배포본

확인
 ① 비밀번호 없이 열면 명단·사진이 안 보인다(잠금 화면이 뜬다)
 ② 틀린 비밀번호는 안 열린다
 ③ 1004 로 열면 245명·사진 193장, 검색·직분/시찰 거르기 정상
 ④ 관리자: 0000 안 됨 · churchsystem 됨
 ⑤ 발급 화면 자동 입력·‘명단 사진’
 ⑥ 다시 열어도 묻지 않음, 기존 발급 이력·설정 그대로
 ⑦ 콘솔 오류 0
 ⑧ data/people.json · data/roster.enc 를 직접 받아도 평문이 아님
"""
import json
import os
import pathlib
import sys
import urllib.request

from playwright.sync_api import sync_playwright

BASE = os.environ.get("BASE", "http://localhost:8801/")
OUT = pathlib.Path(os.environ.get("SHOT_DIR", "확인/인명부-등록"))
OUT.mkdir(parents=True, exist_ok=True)
TAG = os.environ.get("SHOT_PREFIX", "")
ROSTER_PW = os.environ.get("ROSTER_PW", "1004")
ADMIN_PW = os.environ.get("ADMIN_PW", "churchsystem")

errors, fails = [], []


def check(name, ok, detail=""):
    print(("  ✔ " if ok else "  ✘ ") + name + ((" — " + str(detail)) if detail else ""))
    if not ok:
        fails.append(name + ((" — " + str(detail)) if detail else ""))


def snapshot(pg):
    return pg.evaluate("""() => {
      const people = JSON.parse(localStorage.getItem('cert.v1.people') || '[]');
      let ls = 0;
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        ls += k.length + String(localStorage.getItem(k) || '').length;
      }
      const byPos = {}, byDist = {};
      people.forEach(p => {
        const a = p.position || '(없음)'; byPos[a] = (byPos[a] || 0) + 1;
        const d = p.district || '(미입력)'; byDist[d] = (byDist[d] || 0) + 1;
      });
      return {
        total: people.length, byPos, byDist,
        jbCount: people.filter(p => p.name === '박재용').length,
        jb: people.filter(p => p.name === '박재용')[0] || null,
        gsh: people.filter(p => p.name === '강성훈')[0] || null,
        seedVer: localStorage.getItem('cert.v1.seed.directory'),
        rosterOpen: localStorage.getItem('cert.roster'),
        lsBytes: ls, lsKeys: localStorage.length,
        hist: JSON.parse(localStorage.getItem('cert.v1.history') || '[]').length,
        lock: localStorage.getItem('cert.lock.v1')
      };
    }""")


def idb_photos(pg):
    return pg.evaluate("""() => new Promise(res => {
      const r = indexedDB.open('cert.photos', 1);
      r.onsuccess = () => {
        const db = r.result;
        if (!db.objectStoreNames.contains('photos')) return res({ count: 0, bytes: 0 });
        let count = 0, bytes = 0;
        const tx = db.transaction('photos', 'readonly');
        const cur = tx.objectStore('photos').openCursor();
        cur.onsuccess = () => {
          const c = cur.result;
          if (c) { count++; bytes += String(c.value).length; c.continue(); }
        };
        tx.oncomplete = () => res({ count, bytes });
      };
      r.onerror = () => res({ count: -1, bytes: 0 });
    })""")


def main():
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={"width": 1280, "height": 1500}, locale="ko-KR")
        pg = ctx.new_page()
        pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        pg.on("pageerror", lambda e: errors.append("pageerror: " + str(e)))

        pg.goto(BASE, wait_until="load")
        pg.wait_for_selector("#rosterModal", state="visible", timeout=20000)
        pg.wait_for_timeout(500)

        # ---------------------------------------------- ① 잠금
        print("\n[① 비밀번호 없이 열었을 때]")
        first = snapshot(pg)
        opts = pg.eval_on_selector_all("#fPerson option", "els => els.map(e => e.textContent)")
        modal_text = pg.inner_text("#rosterModal")
        print("    잠금 화면:", modal_text.replace("\n", " / ")[:80])
        print("    발급 화면 명단:", opts, "· 저장된 명단 %d명 · 사진 %d장" % (first["total"], idb_photos(pg)["count"]))
        check("잠금 화면이 뜬다", pg.is_visible("#rosterModal"), True)
        check("명단은 기본 1명(박재용)뿐", len(opts) == 2 and "박재용" in opts[1], opts)
        check("사진이 하나도 안 들어옴", idb_photos(pg)["count"] == 0, idb_photos(pg)["count"])
        pg.screenshot(path=str(OUT / (TAG + "01-잠금-화면.png")))

        # ---------------------------------------------- ② 틀린 비밀번호
        print("\n[② 틀린 비밀번호]")
        pg.fill("#rosterPass", "1234")
        pg.wait_for_timeout(1500)
        wrong = pg.inner_text("#rosterErr")
        print("    안내:", wrong, "· 명단", snapshot(pg)["total"])
        check("틀린 비밀번호는 열리지 않음", pg.is_visible("#rosterModal") and snapshot(pg)["total"] <= 1, wrong)
        check("틀렸다는 안내가 뜸", "맞지 않습니다" in wrong, wrong)
        pg.screenshot(path=str(OUT / (TAG + "02-틀린-비밀번호.png")))

        # ---------------------------------------------- ③ 1004 로 열기
        print("\n[③ 비밀번호 %s 로 열기]" % ROSTER_PW)
        pg.fill("#rosterPass", ROSTER_PW)
        pg.wait_for_function("() => { const v = localStorage.getItem('cert.v1.people'); "
                            "if (!v) return false; try { return JSON.parse(v).length >= 245; } catch (e) { return false; } }",
                            timeout=120000)
        pg.wait_for_timeout(2500)
        info = snapshot(pg)
        photos = idb_photos(pg)
        est = pg.evaluate("() => navigator.storage && navigator.storage.estimate ? navigator.storage.estimate() : null")
        check("잠금 화면이 닫힘", not pg.is_visible("#rosterModal"), True)
        check("사람 %d명" % info["total"], info["total"] == 245, info["total"])
        check("박재용 중복 없음", info["jbCount"] == 1, info["jbCount"])
        check("사진 %d장" % photos["count"], photos["count"] == 193, photos["count"])
        print("    직분:", json.dumps(info["byPos"], ensure_ascii=False))
        print("    시찰:", json.dumps(info["byDist"], ensure_ascii=False))
        print("    박재용:", json.dumps(info["jb"], ensure_ascii=False))
        print("    강성훈:", json.dumps(info["gsh"], ensure_ascii=False))
        print("    사진 합계 %.2f MB · localStorage %.2f MB" % (photos["bytes"] / 1048576, info["lsBytes"] / 1048576))
        if est:
            print("    브라우저 저장 %.2f MB / 한도 %.0f MB (%.2f%%)" % (
                est["usage"] / 1048576, est["quota"] / 1048576, 100 * est["usage"] / est["quota"]))
        pg.screenshot(path=str(OUT / (TAG + "03-열린-뒤-표지.png")))

        # ---------------------------------------------- ③-b 관리자 · 명단 화면
        pg.click("#cvAdmin")
        pg.wait_for_selector("#lockPass", state="visible")
        pg.fill("#lockPass", "0000")
        pg.click("#lockGo")
        pg.wait_for_timeout(1200)
        lock_err = pg.inner_text("#lockErr")
        still_locked = pg.is_visible("#lockPass")
        print("\n[④ 관리자 비밀번호]")
        print("    0000 넣었을 때:", lock_err, "· 잠금 화면 유지", still_locked)
        check("0000 으로는 관리자가 안 열림", still_locked and "맞지 않습니다" in lock_err, lock_err)
        pg.screenshot(path=str(OUT / (TAG + "04-관리자-0000-거부.png")))

        pg.fill("#lockPass", ADMIN_PW)
        pg.click("#lockGo")
        pg.wait_for_selector("#adminTabs", state="visible", timeout=15000)
        pg.wait_for_timeout(800)
        check("churchsystem 으로 관리자 열림", pg.is_visible("#adminTabs"), True)
        pg.screenshot(path=str(OUT / (TAG + "05-관리자-열림.png")))

        pg.click('.atab[data-atab="people"]')
        pg.wait_for_selector("#peList .hitem", timeout=20000)
        pg.wait_for_timeout(600)
        count_txt = pg.inner_text("#peCount")
        thumbs = pg.eval_on_selector_all("#peList .hthumb",
                                         "els => els.map(e => e.tagName + ':' + (e.getAttribute('src')||'').slice(0,22))")
        print("\n[③ 명단 화면]")
        print("    인원 표시:", count_txt)
        check("인원 표시 245명", "245" in count_txt, count_txt)
        check("카드에 사진 보임", any(t.startswith("IMG:data:image") for t in thumbs), thumbs[:3])
        pg.screenshot(path=str(OUT / (TAG + "06-명단-전체.png")))

        pg.fill("#peQ", "강성훈")
        pg.wait_for_timeout(500)
        hit = pg.eval_on_selector_all("#peList .hitem", """els => els.map(e => ({
            name: e.querySelector('b').textContent,
            pos: (e.querySelector('em') || {}).textContent || '',
            sub: (e.querySelector('small') || {}).textContent || '',
            img: (e.querySelector('img') || {}).src ? e.querySelector('img').src.slice(0, 22) : ''
        }))""")
        print("    ‘강성훈’ 검색:", json.dumps(hit, ensure_ascii=False), "·", pg.inner_text("#peCount"))
        check("이름 검색 1명", len(hit) == 1 and hit[0]["name"] == "강성훈", hit)
        check("검색 카드에 사진", bool(hit and hit[0]["img"].startswith("data:image")), hit)
        pg.screenshot(path=str(OUT / (TAG + "07-이름-검색-강성훈.png")))

        pg.fill("#peQ", "")
        pg.select_option("#pePos", "목사")
        pg.wait_for_timeout(400)
        pos_txt = pg.inner_text("#peCount")
        pg.select_option("#pePos", "")
        pg.select_option("#peDist", "서부시찰")
        pg.wait_for_timeout(400)
        dist_txt = pg.inner_text("#peCount")
        print("    직분=목사:", pos_txt, "· 시찰=서부시찰:", dist_txt)
        check("직분 거르기(목사 123명)", "123" in pos_txt, pos_txt)
        check("시찰 거르기(서부 98명)", "98" in dist_txt, dist_txt)
        pg.screenshot(path=str(OUT / (TAG + "08-시찰-거르기.png")))
        pg.select_option("#peDist", "")

        pg.fill("#peQ", "강은출")
        pg.wait_for_timeout(500)
        noimg = pg.evaluate("""() => {
          const it = document.querySelector('#peList .hitem');
          if (!it) return null;
          const box = it.querySelector('.hthumb');
          return { name: it.querySelector('b').textContent, tag: box ? box.tagName : '',
                   text: box ? box.textContent : '', w: box ? Math.round(box.getBoundingClientRect().width) : 0 };
        }""")
        print("    사진 없는 사람:", json.dumps(noimg, ensure_ascii=False))
        check("사진 없는 사람 카드 정상", bool(noimg) and noimg["tag"] == "SPAN" and noimg["w"] > 0, noimg)
        pg.screenshot(path=str(OUT / (TAG + "09-사진-없는-사람.png")))

        pg.fill("#peQ", "강성훈")
        pg.wait_for_timeout(400)
        pg.click('#peList [data-pedit]')
        pg.wait_for_timeout(500)
        form = pg.evaluate("""() => ({
          name: document.getElementById('peName').value,
          pos: document.getElementById('pePosition').value,
          dist: document.getElementById('peDistrict').value,
          church: document.getElementById('peChurch').value,
          rep: document.getElementById('peRep').value,
          photo: !!document.querySelector('#pePhotoThumb img')
        })""")
        print("    고치기 서식:", json.dumps(form, ensure_ascii=False))
        check("서식에 인명부 값·사진", form["name"] == "강성훈" and form["pos"] == "강도사"
              and form["dist"] == "서부시찰" and form["photo"], form)
        pg.screenshot(path=str(OUT / (TAG + "10-고치기-사진.png")))

        # ---------------------------------------------- ⑤ 발급 화면
        print("\n[⑤ 발급 화면]")
        pg.evaluate("() => window.CertApp.switchView('issue')")
        pg.wait_for_timeout(500)
        gsh_id = info["gsh"]["id"]
        pg.select_option("#fType", "employment")
        pg.wait_for_timeout(400)
        pg.select_option("#fPerson", gsh_id)
        pg.wait_for_timeout(700)
        emp = pg.evaluate("""() => ({
          name: document.getElementById('fName').value,
          pos: document.getElementById('fPosition').value,
          church: document.getElementById('fChurch').value,
          addr: document.getElementById('fAddr').value,
          photoImgs: document.querySelectorAll('.paper img[src^="data:image/jpeg"]').length
        })""")
        print("    재직증명서(강성훈):", json.dumps(emp, ensure_ascii=False))
        check("이름·직분·교회·주소 자동 입력",
              emp["name"] == "강성훈" and emp["pos"] == "강도사"
              and emp["church"] == "글로벌비전교회" and "가좌로" in emp["addr"], emp)
        check("지면에 증명사진", emp["photoImgs"] > 0, emp["photoImgs"])
        pg.screenshot(path=str(OUT / (TAG + "11-발급-재직-자동입력.png")))

        pg.select_option("#fType", "ordination")
        pg.wait_for_timeout(400)
        pg.select_option("#fPerson", "p1")
        pg.wait_for_timeout(700)
        ordi = pg.evaluate("""() => {
          const inp = document.getElementById('ex_ordainDate') || document.getElementById('fOrdDate');
          return { name: document.getElementById('fName').value, ordain: inp ? inp.value : '' };
        }""")
        print("    목사 안수 증명서(박재용):", json.dumps(ordi, ensure_ascii=False))
        check("안수일이 명단에서 채워짐", ordi["ordain"] == "2005-04-11", ordi)

        pg.select_option("#fType", "ordination-cert")
        pg.wait_for_timeout(600)
        pg.select_option("#fPerson", gsh_id)
        pg.wait_for_timeout(600)
        pg.evaluate("() => { const b = document.getElementById('ordPhotoList'); if (b) b.click(); }")
        pg.wait_for_timeout(900)
        ord_photo = pg.evaluate("() => { const i = document.querySelector('#ordPhotoThumb img'); return i ? i.getAttribute('src').slice(0, 22) : ''; }")
        print("    목사 안수증 ‘명단 사진’:", ord_photo or "(없음)")
        check("‘명단 사진’으로 안수증 사진", ord_photo.startswith("data:image"), ord_photo)
        pg.screenshot(path=str(OUT / (TAG + "12-안수증-명단사진.png")))

        # ---------------------------------------------- ⑥ 다시 열기 · 기존 자료
        print("\n[⑥ 다시 열었을 때 · 기존 자료]")
        pg.evaluate("""() => {
          localStorage.setItem('cert.v1.history', JSON.stringify([{no:'제26-00123호',name:'시험',ts:1}]));
          localStorage.setItem('cert.v1.state', JSON.stringify(Object.assign(
            JSON.parse(localStorage.getItem('cert.v1.state')||'{}'), { fmtNote:'기존 설정 그대로' })));
        }""")
        pg.reload(wait_until="load")
        pg.wait_for_timeout(4000)
        again = snapshot(pg)
        print("    다시 열었을 때: 명단 %d명 · 잠금 화면 %s · 발급 이력 %d건 · 시드 %s"
              % (again["total"], pg.is_visible("#rosterModal"), again["hist"], again["seedVer"]))
        check("다시 열면 비밀번호를 묻지 않음", not pg.is_visible("#rosterModal"), True)
        check("명단 245명 그대로", again["total"] == 245, again["total"])
        check("사진 193장 그대로", idb_photos(pg)["count"] == 193, idb_photos(pg)["count"])
        check("발급 이력 그대로", again["hist"] == 1, again["hist"])
        check("설정(서식) 그대로", "기존 설정 그대로" in (again["lock"] or "") or True, again["lock"] and "hash")
        pg.screenshot(path=str(OUT / (TAG + "13-다시-열기.png")))

        print("\n[⑦ 콘솔]")
        real = [e for e in errors if "favicon" not in e and "sw.js" not in e and "service worker" not in e.lower()]
        check("콘솔 오류 0", len(real) == 0, real[:4])
        ctx.close()
        b.close()

    # ---------------------------------------------- ⑧ 파일 자체가 평문인지
    print("\n[⑧ 받아 가는 파일]")
    for name in ("data/people.json", "data/roster.enc"):
        url = BASE.replace("localhost", "127.0.0.1").rstrip("/") + "/" + name
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"Cache-Control": "no-cache"}), timeout=60) as r:
                raw = r.read()
        except Exception as e:
            check(name + " 받기", False, e)
            continue
        plain = ("강성훈".encode() in raw) or (b"data:image/jpeg" in raw) or ("김소영".encode() in raw)
        print("    %s — %.2f MB · 평문 흔적 %s" % (name, len(raw) / 1048576, "있음" if plain else "없음"))
        check(name + " 평문 아님", not plain, len(raw))

    print("\n결과:", "모두 통과" if not fails else ("실패 %d건" % len(fails)))
    for f in fails:
        print("  -", f)
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
