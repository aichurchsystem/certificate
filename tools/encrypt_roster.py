#!/usr/bin/env python3
"""노회원 명단(인명부 245명·사진 193장)을 비밀번호로 잠가 배포 파일로 만든다.

  python3 tools/encrypt_roster.py --src /workspace/projects/노회인명부/원본-데이터 --out . --pw 1004

- data/people.json 의 directory(시드)와 data/photo/*.jpg 를 한 덩어리로 묶어
  AES-GCM-256 으로 암호화해 data/roster.enc 에 쓴다.
- 파일 모양: salt(16) | 반복수(4, little-endian) | iv(12) | 암호문
- 암호화한 뒤 평문은 지운다(data/people.json 은 기본 명단 1명만, data/photo/ 없음).
- 비밀번호는 파일 어디에도 남기지 않는다(앱에서 넣은 값으로만 열린다).
"""
import argparse
import base64
import hashlib
import json
import os
import pathlib
import shutil
import struct
import sys

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

ITER = 400_000      # PBKDF2-SHA256 반복 수(앱 app.js 의 ROSTER_ITER 와 같아야 한다)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", default="/workspace/projects/노회인명부/원본-데이터")
    ap.add_argument("--out", default=".")
    ap.add_argument("--pw", required=True)
    ap.add_argument("--keep-plain", action="store_true", help="만든 뒤 평문을 지우지 않는다(점검용)")
    a = ap.parse_args()

    out = pathlib.Path(a.out)
    people_path = out / "data" / "people.json"
    doc = json.loads(people_path.read_text(encoding="utf-8"))
    directory = doc.get("directory") or {}
    people = directory.get("people") or []
    if not people:
        print("data/people.json 에 directory(시드)가 없습니다. build_directory_seed.py 를 먼저 돌리세요.", file=sys.stderr)
        return 2

    photo_dir = out / "data" / "photo"
    photos = {}
    for pid in directory.get("photoIds") or []:
        f = photo_dir / (pid + ".jpg")
        if not f.exists():
            continue
        photos[pid] = "data:image/jpeg;base64," + base64.b64encode(f.read_bytes()).decode("ascii")

    payload = {
        "ver": directory.get("ver"),
        "asOf": directory.get("asOf"),
        "source": directory.get("source"),
        "count": len(people),
        "people": people,
        "photos": photos,
    }
    raw = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")

    salt = os.urandom(16)
    iv = os.urandom(12)
    key = hashlib.pbkdf2_hmac("sha256", a.pw.encode("utf-8"), salt, ITER, dklen=32)
    ct = AESGCM(key).encrypt(iv, raw, None)
    blob = salt + struct.pack("<I", ITER) + iv + ct
    (out / "data" / "roster.enc").write_bytes(blob)

    # 평문 정리 — 배포본에는 남기지 않는다
    if not a.keep_plain:
        doc.pop("directory", None)
        people_path.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        if photo_dir.exists():
            shutil.rmtree(photo_dir)

    print(json.dumps({
        "사람": len(people), "사진": len(photos),
        "평문 MB": round(len(raw) / 1048576, 2),
        "암호문 MB": round(len(blob) / 1048576, 2),
        "data/roster.enc": str(out / "data" / "roster.enc"),
        "반복수": ITER,
    }, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
