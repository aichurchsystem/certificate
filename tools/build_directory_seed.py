#!/usr/bin/env python3
"""노회 문서 앱 — 서울강동노회 인명부(원본 받아 온 자료)를 앱의 '노회원 명단' 시드로 만든다.

  python3 tools/build_directory_seed.py [--src projects/노회인명부/원본-데이터] [--out .]

만드는 것
  data/people.json            기존 기본 명단(박재용 1명) + directory(245명 시드, 사진 있는 사람 id 목록)
  data/photo/<id>.jpg         증명사진 193장 — 앱의 증명사진 규격(3:4 가운데 자르기, 긴 변 480·폭 360까지, JPEG 0.82)

원칙
  - 증명서 발급에 쓰는 항목만 넣는다(이름·직분·시찰·교회·주소·안수일·대표자).
    전화·생년월일·학교·학위·비고는 증명서에 쓰지 않으므로 넣지 않는다(개인정보 최소화).
  - 사진은 data URI 그대로 두지 않고 앱 규격으로 다시 줄여 담는다.
  - 같은 교회가 '글로벌비전'/'글로벌비전교회'처럼 두 이름으로 있어도, 목사님이 쓰는 표기대로
    이름 뒤에 '교회'를 붙여 하나로 맞춘다.
"""
import argparse
import base64
import io
import json
import pathlib
import re
import sys

from PIL import Image

APP_ID_FOR = {"박재용": "p1"}          # 앱에 이미 있는 기본 명단 항목을 살려 둔다
PHOTO_W, PHOTO_H, PHOTO_Q = 360, 480, 82   # 앱은 0.82로 저장한다


def load(path):
    return json.loads(pathlib.Path(path).read_text(encoding="utf-8"))


def church_label(name):
    """교회 이름 뒤에 '교회'를 붙인 표기(이미 붙어 있으면 그대로)."""
    n = re.sub(r"\s+", " ", str(name or "")).strip()
    if not n:
        return ""
    return n if n.endswith("교회") else n + "교회"


def crop_resize(data_uri):
    """data URI 사진 → 3:4 가운데 자르기 → (JPEG 바이트, 크기). 원본보다 키우지 않는다."""
    head, _, b64 = data_uri.partition(",")
    raw = base64.b64decode(b64)
    im = Image.open(io.BytesIO(raw))
    im = im.convert("RGB")
    sw, sh = im.size
    ratio = PHOTO_W / PHOTO_H
    if sw / sh > ratio:
        cw, ch = sh * ratio, sh
    else:
        cw, ch = sw, sw / ratio
    sx, sy = (sw - cw) / 2, (sh - ch) / 2
    im = im.crop((round(sx), round(sy), round(sx + cw), round(sy + ch)))
    k = min(1.0, PHOTO_W / im.width, PHOTO_H / im.height)
    if k < 1.0:
        im = im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.LANCZOS)
    out = io.BytesIO()
    im.save(out, "JPEG", quality=PHOTO_Q, optimize=True, progressive=True)
    return out.getvalue(), im.size


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", default="projects/노회인명부/원본-데이터")
    ap.add_argument("--out", default=".")
    ap.add_argument("--ver", default="gd-2026-11-28")
    a = ap.parse_args()

    src = pathlib.Path(a.src)
    out = pathlib.Path(a.out)
    people_src = load(src / "people.json")
    churches = {c["id"]: c for c in load(src / "churches.json")}

    base = load(out / "data" / "people.json")
    base_people = base.get("people") or []

    records, photo_ids = [], []
    photo_dir = out / "data" / "photo"
    photo_dir.mkdir(parents=True, exist_ok=True)
    photo_bytes = 0
    stat = {"total": len(people_src), "photo_in": 0, "photo_out": 0,
            "no_photo": [], "no_church": [], "church_from_role": 0}

    for p in people_src:
        name = (p.get("name") or "").strip()
        if not name:
            continue
        ch = churches.get(p.get("churchId") or "", {})
        church = church_label(ch.get("name"))
        if not church:
            stat["no_church"].append(name)
        # 대표자 — 그 교회 담임목사(교회 자료의 값을 먼저, 없으면 담임목사 본인)
        rep = (ch.get("seniorPastor") or "").strip()
        if not rep and p.get("churchRole") == "담임목사":
            rep = name
        if rep:
            stat["church_from_role"] += 1
        rec = {
            "id": APP_ID_FOR.get(name) or p["id"],
            "name": name,
            "position": (p.get("position") or "").strip(),
            "district": (p.get("district") or "").strip(),
            "church": church,
            "address": (p.get("address") or "").strip(),
            "representative": rep,
            "ordainDate": (p.get("ordinationDate") or "").strip(),
        }
        records.append(rec)

        photo = p.get("photo") or ""
        if photo.startswith("data:image/"):
            try:
                jpg, size = crop_resize(photo)
                (photo_dir / (rec["id"] + ".jpg")).write_bytes(jpg)
                photo_ids.append(rec["id"])
                photo_bytes += len(jpg)
                stat["photo_in"] += 1
                stat["photo_out"] += 1
            except Exception as e:                      # 깨진 사진은 '없음'으로 둔다
                print("사진 변환 실패:", name, e, file=sys.stderr)
                stat["no_photo"].append(name)
        else:
            stat["no_photo"].append(name)

    # 기본 명단(박재용)도 인명부 값으로 빈 칸만 채운다
    src_by_name = {r["name"]: r for r in records}
    for b in base_people:
        s = src_by_name.get(b.get("name"))
        if not s:
            continue
        for k in ("position", "district", "church", "address", "representative", "ordainDate"):
            if not str(b.get(k) or "").strip() and str(s.get(k) or "").strip():
                b[k] = s[k]

    # 박재용도 시드에 넣는다(앱 id p1). 이미 있는 사람은 새로 만들지 않고 빈 칸만 채운다.
    seed = records

    base["updated"] = "2026-11-29"
    base["note"] = ("증명서 발급 화면에서 이름이나 직분을 고르면 이 명단의 정보가 저절로 채워집니다. "
                    "관리자 화면에서 사람을 더하고 고칠 수 있으며, 그 값은 그 기기 브라우저에 저장됩니다. "
                    "이 파일은 '기본 명단'입니다.")
    base["people"] = base_people
    base["directory"] = {
        "ver": a.ver,
        "asOf": "2026-11-28",
        "source": "서울강동노회 인명부 (제88회기 · 2026년 10월 기준) 인명부 내려받기 2026-11-28",
        "count": len(seed),
        "photoDir": "data/photo/",
        "photoIds": photo_ids,
        "note": ("노회원 명단 시드 — 기기에 한 번만 심습니다. 이미 심은 뒤 앱에서 지운 사람은 "
                 "다시 생기지 않습니다."),
        "people": seed,
    }
    (out / "data" / "people.json").write_text(
        json.dumps(base, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(json.dumps({
        "인명": len(records),
        "시드 사람": len(seed),
        "사진 넣음": stat["photo_out"],
        "사진 없음": len(stat["no_photo"]),
        "교회 없음": len(stat["no_church"]),
        "대표자 채움": stat["church_from_role"],
        "사진 파일 합계 MB": round(photo_bytes / 1024 / 1024, 2),
        "사진 한 장 평균 KB": round(photo_bytes / max(1, stat["photo_out"]) / 1024, 1),
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
