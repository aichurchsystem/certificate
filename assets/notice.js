/* ==========================================================================
   노회 공문 (대한예수교장로회(백석) 서울강동노회)

   이 파일이 맡는 세 화면
     1) 노회 공문 작성  — 지면(A4) 미리 보기 + 직접 입력 + 파일 첨부 + PDF·인쇄·드라이브 저장
     2) 공문 관리자     — 공문 서식 문구·직인·워터마크 농도·문서번호 규칙 + 공문 목록 관리
     3) 공문 PDF 보기   — 지난 공문(스캔 원본 · 서식으로 다시 만든 지면)을 PDF 쪽처럼 띄우고 기기에 저장

   지면 치수는 원본 공문(서울강동 제1102603-16호, 992×1403px 스캔)을 픽셀로 재어 옮겼다.
   좌우 여백 15.2mm · 상단 가는 선 21.6mm · 수신/제목 46.6mm · 본문 63.5mm · 줄간 5.2mm ·
   서명부 227.5mm · 굵은 회색선 259.4mm · 맨 아래 검은선 281.6mm.

   서버(Apps Script)의 notice-list / notice-upload / notice-add / notice-update / notice-delete /
   file 액션과, app.js의 apiGet·apiPost·openSheet·buildPdf를 그대로 쓴다.
   드라이브 연결 키는 이 기기(localStorage)에만 있고 저장소에는 넣지 않는다.
   ========================================================================== */
(function () {
  'use strict';

  var A = window.CertApp;
  if (!A) return;
  var $ = function (id) { return document.getElementById(id); };
  var esc = A.esc;
  var MM = 3.779527559;

  /* ---------------------------------------------------------------- 상수 */
  var KEY_SET = 'cert.notice.settings';
  var KEY_DRAFT = 'cert.notice.draft';
  var KEY_SEAL = 'cert.notice.seal';

  var PAGE_W = 210, PAGE_H = 297;
  var EDGE = 15.2;
  var BODY_TOP = 55.4, BODY_H = 162;
  var LINE_MM = 5.2;
  var BODY_W = PAGE_W - EDGE * 2;                 /* 179.6mm */
  var CAP = Math.floor(BODY_H / LINE_MM);         /* 한 장에 들어가는 줄 수 */

  var LOGO = 'assets/logo-sky.svg';
  var DEF_SEAL = 'assets/seals/seal-presbytery-square.png';
  var FOLDER = '노회공문';

  function defaults() {
    return {
      hq: '대한예수교장로회총회(백석)',
      org: '대한예수교장로회',
      presbytery: '서울강동노회',
      slogan: '“사랑을 심고, 사랑을 꽃피우는 노회” 엡4:15',
      chair: '황명구목사',
      secretary: '박재용목사',
      postal: '05048',
      address: '서울특별시 광진구 구의강변로3가길 2층 글로벌비전교회',
      tel: '010 5328 3683',
      email: 'pjypjy323@hanmail.net',
      seal: 'on',
      watermark: '4',
      noPrefix: '서울강동 제',
      noNext: '1102603-17',
      disclosure: '공개',
      attachOn: 'on',
      attachNote: '',
      ruleColor: '#1B3A5A'
    };
  }

  var S = defaults();   /* 서식 설정 */
  var D = null;         /* 지금 쓰는 공문 */
  var SEAL = '';        /* 직접 넣은 직인(이 기기에만) */
  var ATT = null;       /* 첨부한 원본 파일 {file, name, size} */
  var LAST_BODY = '';   /* 첨부로 덮기 전 본문(되돌리기) */
  var LIST = [];        /* 서버 공문 목록 */
  var LIST_LOADED = false;
  var started = false;

  /* ---------------------------------------------------------------- 작은 도구 */
  function loadJSON(key, fb) {
    try { var v = JSON.parse(localStorage.getItem(key) || 'null'); return v === null ? fb : v; }
    catch (e) { return fb; }
  }
  function saveJSON(key, v) {
    try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) {}
  }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function dateParts(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
    return m ? { y: m[1], m: m[2], d: m[3] } : null;
  }
  function dateKo(iso) {
    var p = dateParts(iso);
    return p ? (p.y + '년 ' + p.m + ' 월 ' + p.d + ' 일') : String(iso || '');
  }
  function dateKoShort(iso) {
    var p = dateParts(iso);
    return p ? (p.y + '년 ' + Number(p.m) + '월 ' + Number(p.d) + '일') : String(iso || '');
  }
  function trim(s) { return String(s == null ? '' : s).replace(/^\s+|\s+$/g, ''); }

  function chip(kind, text) {
    var c = $('ntChip');
    if (!c) return;
    c.hidden = !text;
    c.className = 'cloud-chip' + (kind ? ' ' + kind : '');
    c.innerHTML = '<span class="dot"></span><span class="t">' + esc(text) + '</span>';
  }

  /* ---------------------------------------------------------------- 설정 읽기/저장 */
  function loadSettings() {
    var saved = clean(loadJSON(KEY_SET, {}));
    var s = defaults(), k;
    for (k in saved) if (Object.prototype.hasOwnProperty.call(saved, k) && saved[k] !== undefined) s[k] = saved[k];
    S = s;
    try { SEAL = localStorage.getItem(KEY_SEAL) || ''; } catch (e) { SEAL = ''; }
  }
  function saveSettings() { saveJSON(KEY_SET, S); }

  function clean(o) {
    var out = {}, k;
    if (o && typeof o === 'object') for (k in o) if (Object.prototype.hasOwnProperty.call(o, k)) out[k] = o[k];
    return out;
  }

  function fullNo() { return String(S.noPrefix || '') + String(S.noNext || '') + '호'; }

  function nextNoText(txt) {
    var s = String(txt || '');
    var m = /^(.*?)(\d+)(\D*)$/.exec(s);
    if (!m) return s;
    var n = String(parseInt(m[2], 10) + 1);
    while (n.length < m[2].length) n = '0' + n;
    return m[1] + n + m[3];
  }

  /* ---------------------------------------------------------------- 지금 쓰는 공문 */
  function blankDoc(fromSet) {
    var d = {
      id: '', no: '', date: A.todayISO(), recipient: '', title: '', body: '',
      chair: '', secretary: '', refDate: ''
    };
    if (fromSet !== false) {
      d.no = fullNo();
      d.chair = S.chair || '';
      d.secretary = S.secretary || '';
    }
    return d;
  }
  function loadDraft() {
    var saved = clean(loadJSON(KEY_DRAFT, {}));
    var d = blankDoc();
    var k;
    for (k in saved) if (Object.prototype.hasOwnProperty.call(saved, k) && saved[k] !== undefined) d[k] = saved[k];
    if (!d.chair) d.chair = S.chair || '';
    if (!d.secretary) d.secretary = S.secretary || '';
    D = d;
  }
  function saveDraft() { saveJSON(KEY_DRAFT, D); }

  function docOf(item) {
    /* 서버 공문 한 줄 → 지면을 그릴 수 있는 모양 */
    var d = blankDoc(false);
    d.id = item.id || '';
    d.no = item.no || '';
    d.date = item.effectiveDate || item.date || A.todayISO();
    d.recipient = item.recipient || '';
    d.title = item.title || '';
    d.body = item.body || '';
    d.chair = item.chair || '';
    d.secretary = item.secretary || '';
    return d;
  }

  /* ================================================================ 지면 만들기
     본문을 줄 단위로 재어 장을 나눈다. 재는 칸(meas)은 지면과 같은 글꼴·폭·줄간을 쓴다. */
  var MEAS = null;
  function ensureMeasure() {
    if (MEAS) return MEAS;
    var d = document.createElement('div');
    d.className = 'nt-p nt-measure';
    d.id = 'ntMeasure';
    d.setAttribute('aria-hidden', 'true');
    document.body.appendChild(d);
    MEAS = d;
    return MEAS;
  }

  function lineHeightPx() {
    var m = ensureMeasure();
    var lh = parseFloat(window.getComputedStyle(m).lineHeight);
    if (!lh || isNaN(lh)) lh = LINE_MM * MM;
    return lh;
  }
  var LH = null;

  function linesOf(text, indent) {
    var m = ensureMeasure();
    m.style.paddingLeft = (indent || 0) + 'mm';
    m.textContent = text === '' ? '\u00a0' : text;
    var h = m.getBoundingClientRect().height;
    if (!LH) LH = lineHeightPx();
    return Math.max(1, Math.round(h / LH));
  }

  function cutToFit(text, indent, maxLines) {
    if (maxLines <= 0) return 0;
    var lo = 1, hi = text.length, best = 0;
    while (lo <= hi) {
      var mid = (lo + hi) >> 1;
      if (linesOf(text.slice(0, mid), indent) <= maxLines) { best = mid; lo = mid + 1; }
      else hi = mid - 1;
    }
    if (!best) return 1;
    /* 되도록 낱말 사이에서 끊는다 */
    var head = text.slice(0, best);
    var sp = Math.max(head.lastIndexOf(' '), head.lastIndexOf('\t'));
    if (sp > best * 0.55 && sp < best) best = sp + 1;
    return best;
  }

  function paginate(body) {
    layout();
    var pages = [[]], used = 0, i, k;
    function newPage() { pages.push([]); used = 0; }
    function put(p, indent) {
      pages[pages.length - 1].push({ t: p, i: indent });
      used += linesOf(p, indent);
    }
    var raw = String(body == null ? '' : body).replace(/\r\n?/g, '\n').split('\n');
    for (i = 0; i < raw.length; i++) {
      var line = raw[i];
      var lead = /^[ \t]*/.exec(line)[0].replace(/\t/g, '  ').length;
      var indent = Math.min(lead * 1.35, 24);
      var txt = line.replace(/^[ \t]+/, '');
      if (!txt) {
        if (used + 1 > LAY.cap) newPage();
        pages[pages.length - 1].push({ t: '', i: 0, blank: true });
        used += 1;
        continue;
      }
      var need = linesOf(txt, indent);
      if (used + need <= LAY.cap) { put(txt, indent); continue; }
      /* 이 장에 남은 줄만 채우고 다음 장으로 */
      var rest = txt, ind = indent;
      while (rest) {
        var room = LAY.cap - used;
        if (room <= 0) { newPage(); room = LAY.cap; }
        var n = linesOf(rest, ind);
        if (n <= room) { put(rest, ind); break; }
        var cut = cutToFit(rest, ind, room);
        pages[pages.length - 1].push({ t: rest.slice(0, cut).replace(/\s+$/, ''), i: ind });
        used += linesOf(rest.slice(0, cut), ind);
        rest = rest.slice(cut).replace(/^\s+/, '');
        ind = ind;      /* 이어지는 줄도 같은 들여쓰기로 */
        if (rest) newPage();
      }
      if (used >= LAY.cap && i < raw.length - 1) newPage();
    }
    /* 마지막 장이 비어 있으면 지운다 */
    for (k = pages.length - 1; k > 0; k--) {
      if (pages[k].length) break;
      pages.pop();
    }
    return pages;
  }

  /* 수신은 줄 단위로 여러 명을 적을 수 있다(빈 줄은 지면에서 빠진다) */
  function recipients() {
    return String(D.recipient || '').split(/\n+/).map(function (t) { return trim(t); })
      .filter(function (t) { return t; });
  }

  /* 지면 조판 — 수신 줄 수에 따라 제목·본문이 밀리지 않게 자리를 다시 계산한다 */
  var LAY = { recips: [], rowH: 5.4, bodyTop: 60.4, bodyH: 165, cap: 31 };
  function layout() {
    var rec = recipients();
    var rows = Math.max(1, rec.length) + 1;            /* 수신(최소 1) + 제목 */
    var top = 43.4, limit = 53.2;
    var avail = limit - top;
    var rowH = 5.4;
    if (rows * rowH > avail) rowH = Math.max(3.9, avail / rows);
    var used = rows * rowH;
    var bodyTop = limit + Math.max(0, used - avail) + 2.2 + 3.6;
    var bodyH = 218 - bodyTop;
    LAY = {
      recips: rec, rowH: rowH, bodyTop: bodyTop, bodyH: bodyH,
      cap: Math.max(10, Math.floor(bodyH / LINE_MM))
    };
    return LAY;
  }

  function pageHtml(paras, idx, total) {
    var s = S, L = LAY;
    var wmPct = Number(s.watermark || 0);
    var wm = wmPct > 0
      ? '<img class="nt-wm" src="' + LOGO + '" alt="" style="opacity:' + (wmPct / 100) + '">'
      : '';
    var seal = (s.seal === 'off') ? ''
      : '<img class="nt-seal" src="' + (SEAL || DEF_SEAL) + '" alt="노회 직인">';
    var bodyHtml = paras.map(function (p) {
      if (p.blank) return '<div class="nt-p nt-pblank">\u00a0</div>';
      return '<div class="nt-p" style="padding-left:' + p.i + 'mm">' + esc(p.t) + '</div>';
    }).join('');

    var meta = '';
    if (idx === 0) {
      var rows = L.recips.length ? L.recips : [''];
      meta = '<div class="nt-meta">' + rows.map(function (r, i) {
        return '<div class="nt-row" style="height:' + L.rowH.toFixed(2) + 'mm" data-f="recipient">' +
          '<span class="mk">' + (i === 0 ? '수 신' : '') + '</span>' +
          '<span class="cl">' + (i === 0 ? ':' : '') + '</span>' +
          '<span class="mv">' + esc(r) + '</span>' +
          (i > 0 ? '<button type="button" class="nt-x" data-rx="' + i + '" aria-label="이 수신자 지우기">×</button>' : '') +
        '</div>';
      }).join('') +
        '<div class="nt-row nt-row-title" style="height:' + L.rowH.toFixed(2) + 'mm;margin-top:3.6mm" data-f="title">' +
          '<span class="mk">제 목</span><span class="cl">:</span>' +
          '<span class="mv">' + esc(D.title || '') + '</span></div>' +
      '</div>';
    }

    var refDate = D.refDate ? D.refDate : dateKo(D.date);
    function footLine() {
      var bits = [];
      var addr = String(s.address || '').trim();
      if (s.postal || addr) bits.push('☎ ' + (s.postal ? '(' + s.postal + ') ' : '') + addr);
      if (s.tel) bits.push(String(s.tel).trim());
      bits.push('시행일자 ' + dateKoShort(D.date) + ' (' + disc + ')');
      return bits.join(' · ');
    }
    var sub1 = '(' + String(s.postal || '') + ') ' + String(s.address || '') +
      (s.tel ? '   Tel: ' + s.tel : '') + (s.email ? '   E-mail: ' + s.email : '');
    var disc = s.disclosure || '공개';

    return '' +
      '<div class="nt-page" data-pg="' + (idx + 1) + '">' +
        wm +
        '<div class="nt-band" data-f="a:org">' +
          '<div class="nt-brand">' +
            '<img class="nt-mark" src="assets/logo-white.svg" alt="">' +
            '<div class="nt-org">' + esc((s.org || '') + ' ' + (s.presbytery || '')) + '</div>' +
          '</div>' +
        '</div>' +
        (s.slogan ? '<div class="nt-sub" data-f="a:slogan"><div class="nt-sub2">' + esc(s.slogan) + '</div></div>' : '') +
        '<i class="nt-rule nt-rule-top"></i>' +
        '<div class="nt-docno" data-f="no">문서번호&nbsp;&nbsp;' + esc(D.no || '') + '</div>' +
        meta +
        '<i class="nt-rule nt-rule-body" style="top:' + (L.bodyTop - 2.2).toFixed(2) + 'mm"></i>' +
        '<div class="nt-body" data-f="body" style="top:' + L.bodyTop.toFixed(2) + 'mm;height:' + L.bodyH.toFixed(2) + 'mm">' +
          bodyHtml + '</div>' +
        '<div class="nt-sign">' +
          '<div class="nt-date" data-f="refDate">' + esc(refDate) + '</div>' +
          '<div class="nt-org2wrap"><span class="nt-org2" data-f="a:org">' + esc((s.org || '') + ' ' + (s.presbytery || '')) + seal + '</span></div>' +
          '<div class="nt-names">' +
            '<span class="st">노 회 장</span><span class="sn" data-f="chair">' + esc(D.chair || s.chair || '이용동') + '</span>' +
            '<span class="st">서 기</span><span class="sn" data-f="secretary">' + esc(D.secretary || s.secretary || '박재용') + '</span>' +
          '</div>' +
        '</div>' +
        '<i class="nt-rule nt-rule-info"></i>' +
        '<div class="nt-info">' +
          '<div class="nt-i1" data-f="a:address">' + esc(footLine()) + '</div>' +
        '</div>' +
        '<i class="nt-rule nt-rule-foot"></i>' +
        (total > 1 ? '<div class="nt-pgno">' + (idx + 1) + ' / ' + total + '</div>' : '') +
      '</div>';
  }

  /* 하단 주소 줄을 한 줄에 담기게 — 10pt부터 시작해 9pt·8.5pt·8pt로만 내린다 */
  function fitFoot(container) {
    var steps = ['3.53mm', '3.175mm', '3.0mm', '2.82mm'];
    Array.prototype.forEach.call(container.querySelectorAll('.nt-i1'), function (box) {
      box.style.fontSize = '';
      for (var i = 0; i < steps.length; i++) {
        box.style.fontSize = steps[i];
        if (box.scrollWidth <= box.clientWidth + 1) return;
      }
    });
  }

  /* 본문 끝에 '붙임' 표기 — 첨부 파일이 있으면 파일 이름으로, 없으면 관리자 기본 문구 */
  function bodyWithAttach() {
    var body = String(D.body || '');
    if (S.attachOn === 'off') return body;
    var line = '';
    if (ATT && ATT.name) line = '붙임 : ' + String(ATT.name).replace(/\.[^.]+$/, '') + ' 1부';
    else line = trim(S.attachNote || '');
    if (!line) return body;
    return body.replace(/\s+$/, '') + '\n\n' + line;
  }

  function renderInto(container) {
    if (!container) return 0;
    container.style.setProperty('--rule', S.ruleColor || '#1B3A5A');
    container.style.setProperty('--rule-lite', S.ruleColor || '#42618A');
    var pages = paginate(bodyWithAttach());
    var html = pages.map(function (p, i) { return pageHtml(p, i, pages.length); }).join('');
    container.innerHTML = html;
    fitFoot(container);
    return pages.length;
  }

  function renderPages() {
    var n = renderInto($('ntPages'));
    var tag = $('ntPageTag');
    if (tag) tag.textContent = 'A4 ' + n + '장';
    fitPages();
    return n;
  }

  function fitPages() {
    var host = $('ntHost'), pages = $('ntPages');
    if (!host || !pages) return;
    var w = host.clientWidth || 320;
    var s = Math.min(w / (PAGE_W * MM), 1);
    pages.style.transformOrigin = 'top left';
    pages.style.transform = 'scale(' + s + ')';
    pages.style.left = Math.round((w - PAGE_W * MM * s) / 2) + 'px';
    host.style.height = Math.round(pages.offsetHeight * s) + 'px';
  }

  /* ================================================================ 작성 화면 */
  function fillForm() {
    if (!$('ntForm')) return;
    $('ntNo').value = D.no || '';
    $('ntDate').value = D.date || '';
    $('ntTo').value = D.recipient || '';
    $('ntTitle').value = D.title || '';
    $('ntBody').value = D.body || '';
    $('ntChair').value = D.chair || '';
    $('ntSigner').value = D.secretary || '';
    $('ntRefDate').value = D.refDate || '';
    countBody();
  }

  function countBody() {
    var n = $('ntBodyCount');
    if (!n) return;
    var len = String(D.body || '').replace(/\s/g, '').length;
    n.textContent = len + '자';
  }

  function focusField(f) {
    var map = {
      no: 'ntNo', date: 'ntDate', recipient: 'ntTo', title: 'ntTitle', body: 'ntBody',
      chair: 'ntChair', secretary: 'ntSigner', refDate: 'ntRefDate'
    };
    if (f.indexOf('a:') === 0) {
      /* 공문 관리자(서식)의 칸으로 */
      var amap = {
        org: 'ntaOrg', presbytery: 'ntaPresb', address: 'ntaAddr', tel: 'ntaTel',
        email: 'ntaEmail', slogan: 'ntaSlogan', postal: 'ntaPostal', noPrefix: 'ntaNoPrefix',
        disclosure: 'ntaDisclosure'
      };
      var ae = $(amap[f.slice(2)] || '');
      A.switchView('notice-admin');
      if (!ae) return;
      setTimeout(function () {
        if (ae.scrollIntoView) ae.scrollIntoView({ block: 'center', behavior: 'smooth' });
        ae.focus();
        try { var p2 = ae.value.length; ae.setSelectionRange(p2, p2); } catch (ex) {}
      }, 60);
      return;
    }
    var el = $(map[f] || '');
    if (!el) return;
    if (f === 'chair' || f === 'secretary' || f === 'refDate') {
      var box = $('ntSignBox');
      if (box) box.open = true;
    }
    el.focus();
    if (el.setSelectionRange && el.value !== undefined) {
      try { var p = el.value.length; el.setSelectionRange(p, p); } catch (e) {}
    }
    if (el.scrollIntoView) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  var renderTimer = null;
  function scheduleRender() {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(function () { renderPages(); }, 220);
  }

  function setField(name, value) {
    if (!D) return;
    D[name] = value;
    saveDraft();
  }

  /* ================================================================ 파일 읽기 */
  function utf8(bytes) {
    try { return new TextDecoder('utf-8').decode(bytes); }
    catch (e) { return ''; }
  }

  function readFileAsArrayBuffer(file) {
    return new Promise(function (res, rej) {
      var r = new FileReader();
      r.onload = function () { res(r.result); };
      r.onerror = function () { rej(new Error('파일을 읽지 못했습니다.')); };
      r.readAsArrayBuffer(file);
    });
  }
  function readFileAsText(file) {
    return new Promise(function (res, rej) {
      var r = new FileReader();
      r.onload = function () { res(String(r.result || '')); };
      r.onerror = function () { rej(new Error('파일을 읽지 못했습니다.')); };
      r.readAsText(file);
    });
  }
  function fileToBase64(file) {
    return readFileAsArrayBuffer(file).then(function (buf) {
      var bytes = new Uint8Array(buf), bin = '', i, step = 0x8000;
      for (i = 0; i < bytes.length; i += step) {
        bin += String.fromCharCode.apply(null, bytes.subarray(i, i + step));
      }
      return btoa(bin);
    });
  }

  function attachBody(file) {
    if (!file) return;
    var name = file.name || '';
    var ext = (name.split('.').pop() || '').toLowerCase();
    chip('busy', '파일을 읽는 중… ' + name);
    var job;
    if (ext === 'txt' || ext === 'md') {
      job = readFileAsText(file).then(function (t) { return String(t).replace(/\r\n?/g, '\n'); });
    } else if (ext === 'csv') {
      job = readFileAsText(file).then(function (t) { return window.SheetRead.toText(window.SheetRead.csvRows(t)); });
    } else if (ext === 'xlsx' || ext === 'xls') {
      job = readFileAsArrayBuffer(file).then(function (buf) {
        var head = new Uint8Array(buf, 0, Math.min(8, buf.byteLength));
        if (head[0] === 0xD0 && head[1] === 0xCF) {
          throw new Error('예전 엑셀(.xls)은 읽지 못합니다. 엑셀에서 .xlsx나 CSV로 저장해 주세요.');
        }
        return window.SheetRead.rows(buf).then(window.SheetRead.toText);
      });
    } else {
      chip('warn', '텍스트(.txt·.md)·엑셀(.xlsx)·CSV 파일만 본문으로 넣을 수 있습니다.');
      return;
    }
    job.then(function (text) {
      var add = trim(text);
      if (!add) { chip('warn', '파일에서 글자를 찾지 못했습니다.'); return; }
      LAST_BODY = D.body;
      /* 직접 쓴 본문이 있으면 그대로 두고 파일 내용을 뒤에 덧붙인다 */
      var had = trim(D.body);
      D.body = had ? (had + '\n\n' + add) : add;
      ATT = { file: file, name: name, size: file.size };
      $('ntBody').value = D.body;
      $('ntFileInfo').textContent = name + ' · ' + Math.max(1, Math.round(file.size / 1024)) + 'KB';
      $('ntFileUndo').hidden = false;
      saveDraft();
      countBody();
      renderPages();
      chip('ok', (had ? '본문 뒤에 덧붙였습니다 · ' : '본문을 채웠습니다 · ') + name);
    }).catch(function (e) {
      console.error(e);
      chip('warn', (e && e.message) || '파일을 읽지 못했습니다.');
    });
  }

  function clearAttach() {
    ATT = null;
    var inp = $('ntFile');
    if (inp) inp.value = '';
    $('ntFileInfo').textContent = '고른 파일 없음';
    $('ntFileUndo').hidden = true;
  }

  /* ================================================================ 지면 → 그림/PDF */
  function capturePages(container, scale) {
    if (typeof window.html2canvas !== 'function') {
      return Promise.reject(new Error('지면을 그림으로 만드는 도구를 불러오지 못했습니다.'));
    }
    var nodes = Array.prototype.slice.call(container.querySelectorAll('.nt-page'));
    if (!nodes.length) return Promise.reject(new Error('지면이 없습니다.'));
    var out = [];
    function next(i) {
      if (i >= nodes.length) return Promise.resolve(out);
      return window.html2canvas(nodes[i], {
        scale: scale || 2.2, backgroundColor: '#ffffff', useCORS: true, logging: false,
        width: Math.round(PAGE_W * MM), height: Math.round(PAGE_H * MM),
        windowWidth: Math.round(PAGE_W * MM), windowHeight: Math.round(PAGE_H * MM)
      }).then(function (canvas) {
        out.push(canvas);
        return next(i + 1);
      });
    }
    return next(0);
  }

  /* 지면 여러 장을 한 PDF 파일로 (PDF 라이브러리 없이) */
  function buildPdfPages(images) {
    var enc = new TextEncoder();
    var chunks = [], offsets = {}, size = 0;
    var PW = '595.28', PH = '841.89';
    function put(x) {
      var b = (typeof x === 'string') ? enc.encode(x) : x;
      chunks.push(b); size += b.length;
    }
    function obj(n, body) { offsets[n] = size; put(n + ' 0 obj\n' + body + '\nendobj\n'); }
    function pad(n) { var s = String(n); while (s.length < 10) s = '0' + s; return s; }

    var n = images.length;
    var kids = [], i;
    for (i = 0; i < n; i++) kids.push((3 + i * 3) + ' 0 R');

    put('%PDF-1.4\n');
    obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
    obj(2, '<< /Type /Pages /Kids [' + kids.join(' ') + '] /Count ' + n + ' >>');

    for (i = 0; i < n; i++) {
      var pageObj = 3 + i * 3, imgObj = pageObj + 1, cntObj = pageObj + 2;
      obj(pageObj, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + PW + ' ' + PH + '] ' +
        '/Resources << /XObject << /Im0 ' + imgObj + ' 0 R >> >> /Contents ' + cntObj + ' 0 R >>');
      offsets[imgObj] = size;
      put(imgObj + ' 0 obj\n<< /Type /XObject /Subtype /Image /Width ' + images[i].w +
        ' /Height ' + images[i].h + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 ' +
        '/Filter /DCTDecode /Length ' + images[i].bytes.length + ' >>\nstream\n');
      put(images[i].bytes);
      put('\nendstream\nendobj\n');
      var content = 'q ' + PW + ' 0 0 ' + PH + ' 0 0 cm /Im0 Do Q\n';
      obj(cntObj, '<< /Length ' + content.length + ' >>\nstream\n' + content + 'endstream');
    }

    var xref = size;
    var total = 2 + n * 3 + 1;
    var table = 'xref\n0 ' + total + '\n0000000000 65535 f \n';
    for (i = 1; i < total; i++) table += pad(offsets[i] || 0) + ' 00000 n \n';
    put(table);
    put('trailer\n<< /Size ' + total + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n');

    var out = new Uint8Array(size), pos = 0;
    chunks.forEach(function (b) { out.set(b, pos); pos += b.length; });
    return out;
  }

  function canvasesToPdf(images) {
    var list = images.map(function (c) {
      var url = c.toDataURL('image/jpeg', 0.9);
      return { bytes: A.dataUrlBytes(url), w: c.width, h: c.height };
    });
    return new Blob([buildPdfPages(list)], { type: 'application/pdf' });
  }

  function docBaseName(ext) {
    var no = String(D.no || '문서번호').replace(/[\\/:*?"<>|]/g, '');
    var t = String(D.title || '공문').replace(/[\\/:*?"<>|]/g, '');
    return no + '_' + t + '.' + ext;
  }

  function pdfFileBase() {
    var d = (D.date || A.todayISO()).replace(/-/g, '');
    var no = String(D.no || '').replace(/\s+/g, '');
    var t = String(D.title || '공문').replace(/\s+/g, '');
    return d + '_' + no + '_' + t;
  }

  function exportPages(kind) {
    if (typeof window.html2canvas !== 'function') { A.toast('이미지 도구를 불러오지 못했습니다.'); return; }
    var host = $('ntHost'), pages = $('ntPages');
    var keep = pages.style.transform;
    pages.style.transform = 'none';
    A.toast('지면을 만드는 중…');
    capturePages(pages, 2.2).then(function (canvases) {
      pages.style.transform = keep;
      if (kind === 'jpg') {
        var c = canvases[0];
        c.toBlob(function (blob) {
          if (!blob) { A.toast('그림을 만들지 못했습니다.'); return; }
          var url = URL.createObjectURL(blob);
          A.openSheet({
            title: '이미지 저장',
            msg: canvases.length > 1 ? ('지면 ' + canvases.length + '장 중 첫 장을 그림으로 만들었습니다. 전체는 PDF로 받아 주세요.')
              : '공문 지면을 그림(JPG)으로 만들었습니다.',
            blob: blob, url: url, name: docBaseName('jpg'), preview: true, kind: 'jpg',
            hint: '<b>저장</b>을 누르면 휴대폰 다운로드 폴더에 들어갑니다.'
          });
        }, 'image/jpeg', 0.92);
        return;
      }
      var blob = canvasesToPdf(canvases);
      var purl = URL.createObjectURL(blob);
      A.openSheet({
        title: 'PDF 저장',
        msg: 'A4 ' + canvases.length + '장짜리 PDF를 만들었습니다.',
        blob: blob, url: purl, name: docBaseName('pdf'), file: true, kind: 'pdf',
        fileNote: 'A4 ' + canvases.length + '장 · ' + Math.round(blob.size / 1024) + 'KB',
        print: true,
        warn: A.inAppBrowser() ? '앱 안의 브라우저에서는 파일 저장이 막힐 수 있습니다. 오른쪽 위 ⋮ → ‘다른 브라우저로 열기’로 크롬에서 열면 확실합니다.' : '',
        hint: '<b>저장</b>을 누르면 휴대폰 다운로드 폴더에 들어갑니다. 안 되면 <b>새 창에서 열기</b>를 써 보세요.'
      });
    }).catch(function (e) {
      pages.style.transform = keep;
      console.error(e);
      A.toast('지면을 만들지 못했습니다. [인쇄]에서 PDF 저장을 골라 주세요.');
    });
  }

  function doPrint() {
    if (!D.title && !D.body) { A.toast('내용을 먼저 적어 주세요.'); return; }
    window.print();
  }

  /* ================================================================ 드라이브 저장 */
  function saveCloud() {
    if (!A.apiKey()) {
      chip('warn', '드라이브 연결 키가 없습니다 · 공문 관리자 › 드라이브 저장');
      return;
    }
    if (!trim(D.no) || !trim(D.title)) {
      chip('warn', '문서번호와 제목을 먼저 적어 주세요.');
      A.toast('문서번호와 제목을 먼저 적어 주세요.');
      return;
    }
    var btn = $('ntSaveBtn');
    if (btn) btn.disabled = true;
    chip('busy', '지면 PDF를 만드는 중…');
    var host = $('ntHost'), pages = $('ntPages');
    var keep = pages.style.transform;
    pages.style.transform = 'none';

    capturePages(pages, 2.0).then(function (canvases) {
      pages.style.transform = keep;
      var blob = canvasesToPdf(canvases);
      return fileToBase64(blob).then(function (b64) {
        chip('busy', '드라이브에 올리는 중…');
        return A.apiPost({
          action: 'notice-upload', dataBase64: b64, mimeType: 'application/pdf',
          fileName: pdfFileBase() + '.pdf', no: D.no, title: D.title, date: D.date
        });
      });
    }).then(function (r) {
      if (!r || !r.ok) throw new Error((r && r.error) || 'PDF를 올리지 못했습니다.');
      var pdfFile = r;
      chip('busy', '첨부 원본도 올리는 중…');
      var attJob = Promise.resolve(null);
      if (ATT && ATT.file) {
        attJob = fileToBase64(ATT.file).then(function (b64) {
          return A.apiPost({
            action: 'notice-upload', dataBase64: b64, mimeType: ATT.file.type || 'application/octet-stream',
            fileName: ATT.name, no: D.no, title: D.title, date: D.date
          });
        }).catch(function (e) { console.warn(e); return null; });
      }
      return attJob.then(function (att) {
        var notice = {
          id: D.id || '',
          no: D.no,
          effectiveDate: D.date,
          date: D.date,
          recipient: D.recipient || '',
          title: D.title,
          body: D.body || '',
          chair: D.chair || '',
          secretary: D.secretary || '',
          contact: [S.postal, S.address, (S.tel ? '전화 ' + S.tel : ''), (S.email ? 'E-mail ' + S.email : '')]
            .filter(Boolean).join(' · '),
          fileId: pdfFile.fileId || '',
          fileUrl: pdfFile.url || '',
          attachmentId: (att && att.fileId) || '',
          attachmentUrl: (att && att.url) || ''
        };
        return A.apiPost({ action: D.id ? 'notice-update' : 'notice-add', notice: notice }).then(function (res) {
          if (!res || !res.ok) throw new Error((res && res.error) || '공문 기록을 남기지 못했습니다.');
          if (res.notice && res.notice.id) D.id = res.notice.id;
          saveDraft();
          var attNote = att ? ' · 첨부 ' + ATT.name : '';
          chip('ok', '드라이브 저장됨 · ' + (pdfFile.fileName || D.no) + attNote);
          A.toast('공문을 드라이브 ' + FOLDER + ' 폴더에 저장했습니다.');
          /* 다음 번호로 넘긴다 */
          S.noNext = nextNoText(S.noNext);
          saveSettings();
          renderAdminForm();
          if ($('ntDraftBadge')) $('ntDraftBadge').hidden = false;
          loadList(true);
        });
      });
    }).catch(function (e) {
      pages.style.transform = keep;
      console.error(e);
      chip('warn', '저장하지 못했습니다 · ' + ((e && e.message) || '연결 실패'));
    }).then(function () {
      if (btn) btn.disabled = false;
    });
  }

  /* ================================================================ 목록 */
  function loadList(force) {
    if (LIST_LOADED && !force) return Promise.resolve(LIST);
    if (!A.apiKey()) {
      LIST = [];
      LIST_LOADED = true;
      renderLists('드라이브에 연결하면 지난 공문이 여기에 나옵니다. 공문 관리자 › 드라이브 저장에서 연결 키를 넣어 주세요.');
      return Promise.resolve([]);
    }
    setStateText('불러오는 중…');
    return A.apiGet({ action: 'notice-list' }).then(function (r) {
      if (!r || !r.ok) throw new Error((r && r.error) || '불러오지 못했습니다.');
      LIST = (r.items || []).slice();
      LIST_LOADED = true;
      buildYearOptions();
      renderLists('');
      return LIST;
    }).catch(function (e) {
      LIST_LOADED = true;
      renderLists('불러오지 못했습니다 · ' + ((e && e.message) || '연결 실패'));
      return [];
    });
  }

  function setStateText(msg) {
    ['ntaState', 'ntPickState'].forEach(function (id) {
      var n = $(id);
      if (!n) return;
      n.textContent = msg || '';
      n.hidden = !msg;
    });
  }

  function buildYearOptions() {
    var years = {}, i, y;
    LIST.forEach(function (it) {
      var d = String(it.effectiveDate || it.date || '');
      var m = /^(\d{4})/.exec(d);
      if (m) years[m[1]] = 1;
    });
    var list = Object.keys(years).sort().reverse();
    ['ntaYear', 'ntPickYear'].forEach(function (id) {
      var sel = $(id);
      if (!sel) return;
      var cur = sel.value;
      sel.innerHTML = '<option value="">전체 연도</option>' + list.map(function (y) {
        return '<option value="' + y + '">' + y + '년</option>';
      }).join('');
      sel.value = cur && years[cur] ? cur : '';
    });
  }

  function filtered(q, year) {
    var kw = String(q || '').replace(/\s+/g, '').toLowerCase();
    return LIST.filter(function (it) {
      var d = String(it.effectiveDate || it.date || '');
      if (year && d.slice(0, 4) !== year) return false;
      if (!kw) return true;
      var hay = (String(it.title || '') + String(it.no || '') + String(it.recipient || ''))
        .replace(/\s+/g, '').toLowerCase();
      return hay.indexOf(kw) > -1;
    }).sort(function (a, b) {
      var x = String(a.effectiveDate || '') + (a.updatedAt || '');
      var y = String(b.effectiveDate || '') + (b.updatedAt || '');
      return x < y ? 1 : x > y ? -1 : 0;
    });
  }

  var LIST_MSG = '';
  function renderLists(msg) {
    if (msg !== undefined) LIST_MSG = msg;
    var pairs = [['ntaList', $('ntaQ'), $('ntaYear')], ['ntPickList', $('ntPickQ'), $('ntPickYear')]];
    pairs.forEach(function (p) {
      var box = $(p[0]);
      if (!box) return;
      var q = p[1] ? p[1].value : '';
      var year = p[2] ? p[2].value : '';
      var rows = filtered(q, year);
      var cnt = $('ntaCnt');
      if (cnt && p[0] === 'ntaList') cnt.textContent = rows.length + '건';
      if (!rows.length) {
        box.innerHTML = '<p class="empty">' + esc(LIST_MSG || '아직 등록된 공문이 없습니다.') + '</p>';
        return;
      }
      box.innerHTML = rows.map(function (it, i) {
        var no = String(it.no || '');
        var t = String(it.title || '');
        var d = String(it.effectiveDate || it.date || '');
        var thumb = it.fileId
          ? '<img class="hthumb" loading="lazy" src="https://drive.google.com/thumbnail?id=' +
            encodeURIComponent(it.fileId) + '&sz=w200" alt="" onerror="this.classList.add(\'none\')">'
          : '<span class="hthumb ph">문서</span>';
        return '<div class="hitem nt-item" data-item="' + esc(it.id) + '">' + thumb +
          '<span class="hmain"><b>' + esc(t || '(제목 없음)') + '</b>' +
          '<em>' + esc(no) + '</em>' +
          '<small>' + esc(d) + (it.recipient ? ' · ' + esc(String(it.recipient).slice(0, 22)) : '') + '</small>' +
          (it.attachmentUrl ? '<small class="ttl">첨부 원본 있음</small>' : '') +
          '</span>' +
          '<span class="nt-acts">' +
            '<button type="button" class="mini" data-act="pdf">PDF로 보기</button>' +
            '<button type="button" class="mini" data-act="use">이어 쓰기</button>' +
            '<button type="button" class="mini del" data-act="del" aria-label="공문 지우기">✕</button>' +
          '</span></div>';
      }).join('');
    });
  }

  function findItem(id) {
    return LIST.filter(function (x) { return String(x.id) === String(id); })[0] || null;
  }

  function doDelete(item) {
    if (!item) return;
    if (!window.confirm('이 공문을 목록에서 지울까요?\n' + (item.no || '') + ' ' + (item.title || '') + '\n(드라이브의 파일은 그대로 남습니다)')) return;
    A.apiPost({ action: 'notice-delete', id: item.id }).then(function (r) {
      if (!r || !r.ok) throw new Error((r && r.error) || '지우지 못했습니다.');
      A.toast('목록에서 지웠습니다.');
      loadList(true);
    }).catch(function (e) { A.toast('지우지 못했습니다 · ' + e.message); });
  }

  function useItem(item) {
    if (!item) return;
    D = docOf(item);
    if (item.contact) { /* 발신 연락은 서식 설정을 쓴다 */ }
    ATT = null;
    clearAttach();
    saveDraft();
    fillForm();
    renderPages();
    if ($('ntDraftBadge')) $('ntDraftBadge').hidden = false;
    closePick();
    A.switchView('notice');
    A.toast('지난 공문을 이어 씁니다. 고친 뒤 ‘드라이브에 저장’을 누르면 같은 공문이 갱신됩니다.');
  }

  /* ================================================================ PDF 보기 */
  var PDF_STATE = { pages: [], zoom: 1, name: '', blob: null, title: '' };

  function openPdfModal() {
    var m = $('ntPdfModal');
    if (!m) return;
    m.hidden = false;
    document.documentElement.classList.add('ntlock');
    document.body.classList.add('ntlock');
  }
  function closePdfModal() {
    var m = $('ntPdfModal');
    if (m) m.hidden = true;
    document.documentElement.classList.remove('ntlock');
    document.body.classList.remove('ntlock');
    $('ntPdfBody').innerHTML = '';
    PDF_STATE = { pages: [], zoom: 1, name: '', blob: null, title: '' };
  }

  function showPdfPages(title, urls) {
    PDF_STATE.pages = urls;
    PDF_STATE.title = title;
    $('ntPdfTitle').innerHTML = esc(title) + ' <small>' + urls.length + '쪽</small>';
    applyPdfZoom();
    openPdfModal();
    $('ntPdfBody').scrollTop = 0;
  }

  function applyPdfZoom() {
    var body = $('ntPdfBody');
    if (!body) return;
    var w = Math.max(220, body.clientWidth - 20);
    var base = Math.min(w, 720);
    var wid = Math.round(base * PDF_STATE.zoom);
    body.innerHTML = PDF_STATE.pages.map(function (u, i) {
      return '<figure class="ntpdf-page" style="width:' + wid + 'px">' +
        '<img src="' + u + '" alt="공문 ' + (i + 1) + '쪽">' +
        '<figcaption>' + (i + 1) + ' / ' + PDF_STATE.pages.length + '</figcaption></figure>';
    }).join('');
    var info = $('ntPdfPageInfo');
    if (info) info.textContent = Math.round(PDF_STATE.zoom * 100) + '%';
  }

  function imageToA4(url) {
    return new Promise(function (res, rej) {
      var im = new Image();
      im.onload = function () {
        var c = document.createElement('canvas');
        c.width = 1654; c.height = 2339;
        var ctx = c.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, c.width, c.height);
        var r = Math.min(c.width / im.width, c.height / im.height);
        var w = im.width * r, h = im.height * r;
        ctx.drawImage(im, (c.width - w) / 2, (c.height - h) / 2, w, h);
        res(c);
      };
      im.onerror = function () { rej(new Error('그림을 읽지 못했습니다.')); };
      im.src = url;
    });
  }

  function openNoticePdf(item) {
    if (!item) return;
    var title = (item.no || '공문') + ' · ' + (item.title || '');
    if (!A.apiKey()) { A.toast('드라이브 연결 키가 필요합니다. 공문 관리자 › 드라이브 저장.'); return; }
    A.toast('공문을 여는 중…');

    if (item.fileId) {
      A.apiPost({ action: 'file', id: item.fileId }).then(function (r) {
        if (!r || !r.ok) throw new Error((r && r.error) || '파일을 불러오지 못했습니다.');
        var mime = String(r.mimeType || '');
        var data = 'data:' + (mime || 'image/jpeg') + ';base64,' + r.dataBase64;
        if (/^image\//.test(mime)) {
          return imageToA4(data).then(function (canvas) {
            PDF_STATE.source = 'image';
            PDF_STATE.canvases = [canvas];
            showPdfPages(title, [canvas.toDataURL('image/jpeg', 0.92)]);
          });
        }
        if (/pdf/.test(mime)) {
          /* 이미 PDF인 원본은 그대로 저장·인쇄할 수 있게 한다 */
          var bin = atob(r.dataBase64), bytes = new Uint8Array(bin.length), i;
          for (i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          PDF_STATE.blob = new Blob([bytes], { type: 'application/pdf' });
          PDF_STATE.source = 'pdf';
          PDF_STATE.canvases = [];
          $('ntPdfTitle').innerHTML = esc(title) + ' <small>PDF 원본</small>';
          $('ntPdfBody').innerHTML = '<div class="ntpdf-note"><b>PDF 파일로 저장된 공문입니다.</b>' +
            '<p>아래 ‘기기에 PDF 저장’을 누르면 이 파일을 그대로 내려받습니다.</p></div>';
          $('ntPdfPageInfo').textContent = '';
          openPdfModal();
          return;
        }
        throw new Error('이 파일은 화면으로 열 수 없습니다(' + mime + '). 드라이브에서 직접 열어 주세요.');
      }).catch(function (e) {
        console.error(e);
        A.toast((e && e.message) || '공문을 열지 못했습니다.');
      });
      return;
    }

    /* 파일이 없는 공문은 서식으로 다시 그려서 보여 준다 */
    renderDocToCanvases(docOf(item)).then(function (canvases) {
      PDF_STATE.source = 'render';
      PDF_STATE.canvases = canvases;
      showPdfPages(title, canvases.map(function (c) { return c.toDataURL('image/jpeg', 0.9); }));
    }).catch(function (e) {
      console.error(e);
      A.toast('공문 지면을 만들지 못했습니다.');
    });
  }

  function renderDocToCanvases(doc) {
    var keepD = D;
    D = doc;
    var box = document.createElement('div');
    box.className = 'nt-pages nt-offscreen';
    document.body.appendChild(box);
    try {
      renderInto(box);
    } catch (e) {
      document.body.removeChild(box);
      D = keepD;
      return Promise.reject(e);
    }
    return capturePages(box, 2.0).then(function (canvases) {
      document.body.removeChild(box);
      D = keepD;
      return canvases;
    }).catch(function (e) {
      if (box.parentNode) document.body.removeChild(box);
      D = keepD;
      throw e;
    });
  }

  function savePdfToDevice() {
    if (PDF_STATE.blob) {
      var url = URL.createObjectURL(PDF_STATE.blob);
      A.openSheet({
        title: 'PDF 저장', msg: '원본 PDF 파일을 내려받습니다.',
        blob: PDF_STATE.blob, url: url, name: (PDF_STATE.title || '공문') + '.pdf',
        file: true, kind: 'pdf', fileNote: 'PDF · ' + Math.round(PDF_STATE.blob.size / 1024) + 'KB',
        print: true,
        hint: '<b>저장</b>을 누르면 휴대폰 다운로드 폴더에 들어갑니다.'
      });
      return;
    }
    if (!PDF_STATE.canvases || !PDF_STATE.canvases.length) { A.toast('저장할 지면이 없습니다.'); return; }
    var blob = canvasesToPdf(PDF_STATE.canvases);
    var u = URL.createObjectURL(blob);
    A.openSheet({
      title: 'PDF 저장',
      msg: 'A4 ' + PDF_STATE.canvases.length + '장짜리 PDF를 만들었습니다.',
      blob: blob, url: u, name: (PDF_STATE.title || '공문') + '.pdf', file: true, kind: 'pdf',
      fileNote: 'A4 ' + PDF_STATE.canvases.length + '장 · ' + Math.round(blob.size / 1024) + 'KB',
      print: true,
      hint: '<b>저장</b>을 누르면 휴대폰 다운로드 폴더에 들어갑니다. 안 되면 <b>새 창에서 열기</b>를 써 보세요.'
    });
  }

  /* ================================================================ 공문 관리자 */
  function renderAdminForm() {
    if (!$('view-notice-admin')) return;
    var map = ['hq', 'org', 'presbytery', 'slogan', 'chair', 'secretary', 'postal', 'address', 'tel', 'email', 'noPrefix', 'noNext'];
    map.forEach(function (k) {
      var el = document.querySelector('[data-nta="' + k + '"]');
      if (el) el.value = S[k] == null ? '' : S[k];
    });
    var seg = document.querySelectorAll('input[name="ntaSeal"]');
    Array.prototype.forEach.call(seg, function (r) { r.checked = (r.value === (S.seal === 'off' ? 'off' : 'on')); });
    var att = document.querySelectorAll('input[name="ntaAttach"]');
    Array.prototype.forEach.call(att, function (r) { r.checked = (r.value === (S.attachOn === 'off' ? 'off' : 'on')); });
    var wm = document.querySelectorAll('input[name="ntaWm"]');
    Array.prototype.forEach.call(wm, function (r) { r.checked = String(r.value) === String(S.watermark || '0'); });
    var th = $('ntaSealThumb');
    if (th) th.innerHTML = SEAL ? '<img src="' + SEAL + '" alt="직인">' : '기본';
    var pv = $('ntaNoPreview');
    if (pv) pv.textContent = '다음 문서번호: ' + fullNo();
    var ks = $('ntaKeyState');
    if (ks) {
      ks.textContent = A.apiKey()
        ? ('연결됨 (키 ' + A.apiKey().slice(0, 4) + '…' + A.apiKey().slice(-4) + ')')
        : '아직 연결하지 않았습니다';
    }
  }

  /* ================================================================ 화면 넣기/빼기 */
  function enter() {
    loadSettings();
    if (!D) loadDraft();
    fillForm();
    renderPages();
    setTimeout(fitPages, 60);
  }
  function enterAdmin() {
    loadSettings();
    renderAdminForm();
    loadList();
  }

  function closePick() {
    var m = $('ntPick');
    if (m) m.hidden = true;
    document.documentElement.classList.remove('ntlock');
    document.body.classList.remove('ntlock');
  }
  function openPick() {
    var m = $('ntPick');
    if (!m) return;
    m.hidden = false;
    document.documentElement.classList.add('ntlock');
    document.body.classList.add('ntlock');
    loadList().then(function () { renderLists(''); });
  }

  /* ================================================================ 연결 */
  function bind() {
    if (!$('ntForm')) return;

    /* 표지 / 화면 이동 */
    if ($('ntCoverBtn')) $('ntCoverBtn').addEventListener('click', function () { A.switchView('cover'); });
    if ($('ntAdminBtn')) $('ntAdminBtn').addEventListener('click', function () { A.switchView('notice-admin'); });
    if ($('ntaBackBtn')) $('ntaBackBtn').addEventListener('click', function () { A.switchView('notice'); });
    if ($('ntPastBtn')) $('ntPastBtn').addEventListener('click', openPick);
    if ($('ntPickClose')) $('ntPickClose').addEventListener('click', closePick);

    /* 입력 */
    Array.prototype.forEach.call(document.querySelectorAll('[data-nt]'), function (inp) {
      var name = inp.getAttribute('data-nt');
      inp.addEventListener('input', function () {
        setField(name, inp.value);
        if (name === 'body') { countBody(); scheduleRender(); }
        else renderPages();
      });
      inp.addEventListener('change', function () {
        setField(name, inp.value);
        renderPages();
      });
    });

    /* 지면 글자를 누르면 그 칸으로 */
    var pagesBox = $('ntPages');
    if (pagesBox) {
      pagesBox.addEventListener('click', function (e) {
        var sel = window.getSelection ? String(window.getSelection()) : '';
        if (sel) return;                       /* 드래그로 고른 글자는 그대로 둔다(복사용) */
        var x = e.target.closest ? e.target.closest('.nt-x') : null;
        if (x) {
          var i = Number(x.getAttribute('data-rx'));
          var list = recipients();
          list.splice(i, 1);
          D.recipient = list.join('\n');
          saveDraft();
          if ($('ntTo')) $('ntTo').value = D.recipient;
          renderPages();
          return;
        }
        var t = e.target;
        while (t && t !== pagesBox && !(t.getAttribute && t.getAttribute('data-f'))) t = t.parentNode;
        if (t && t.getAttribute) {
          var f = t.getAttribute('data-f');
          if (f) focusField(f);
        }
      });
    }

    /* 전체 텍스트 복사 — 제목·수신·본문·문서번호·시행일자를 줄바꿈 그대로 */
    if ($('ntCopyBtn')) $('ntCopyBtn').addEventListener('click', function () {
      var rec = recipients();
      var lines = [];
      if (D.no) lines.push('[문서번호] ' + D.no);
      if (rec.length) lines.push('[수신] ' + rec[0]);
      for (var i = 1; i < rec.length; i++) lines.push('       ' + rec[i]);
      if (D.title) lines.push('[제목] ' + D.title);
      lines.push('');
      lines.push(String(D.body || ''));
      lines.push('');
      lines.push(String(D.refDate || dateKo(D.date)));
      lines.push(String(S.org || '') + ' ' + String(S.presbytery || ''));
      lines.push('노회장 ' + (D.chair || S.chair || '이용동') + '   서기 ' + (D.secretary || S.secretary || '박재용'));
      var text = lines.join('\n');
      var done = function (ok) {
        A.toast(ok ? '공문 전체 글자를 복사했습니다. 메일·한글·워드에 붙여넣으세요.' : '복사가 막혔습니다. 지면 글자를 길게 눌러 직접 복사해 주세요.');
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { done(true); }, function () {
          legacyCopy(text) ? done(true) : done(false);
        });
      } else {
        legacyCopy(text) ? done(true) : done(false);
      }
    });

    /* 크게 보기 */
    if ($('ntZoomBtn')) $('ntZoomBtn').addEventListener('click', function () {
      var on = document.body.classList.toggle('nt-big');
      this.textContent = on ? '작게 보기' : '크게 보기';
      setTimeout(fitPages, 30);
    });

    /* 파일 첨부 */
    if ($('ntFileBtn')) $('ntFileBtn').addEventListener('click', function () { $('ntFile').click(); });
    if ($('ntFile')) $('ntFile').addEventListener('change', function () {
      var f = this.files && this.files[0];
      if (f) attachBody(f);
    });
    if ($('ntFileUndo')) $('ntFileUndo').addEventListener('click', function () {
      D.body = LAST_BODY || '';
      $('ntBody').value = D.body;
      saveDraft();
      countBody();
      renderPages();
      clearAttach();
      A.toast('첨부로 바꾸기 전 본문으로 돌렸습니다.');
    });

    /* 저장·출력 */
    if ($('ntPdfBtn')) $('ntPdfBtn').addEventListener('click', function () { exportPages('pdf'); });
    if ($('ntJpgBtn')) $('ntJpgBtn').addEventListener('click', function () { exportPages('jpg'); });
    if ($('ntPrintBtn')) $('ntPrintBtn').addEventListener('click', doPrint);
    if ($('ntSaveBtn')) $('ntSaveBtn').addEventListener('click', saveCloud);

    /* 새 공문 */
    if ($('ntNewBtn')) $('ntNewBtn').addEventListener('click', function () {
      if (!window.confirm('지금 쓰던 내용을 지우고 새 공문을 시작할까요?')) return;
      var keepNo = S.noPrefix + S.noNext + '호';
      D = blankDoc();
      D.no = keepNo;
      ATT = null;
      clearAttach();
      saveDraft();
      fillForm();
      renderPages();
      chip('', '');
      if ($('ntDraftBadge')) $('ntDraftBadge').hidden = true;
      A.toast('새 공문을 시작합니다.');
    });

    /* 목록 안의 버튼 */
    ['ntaList', 'ntPickList'].forEach(function (id) {
      var box = $(id);
      if (!box) return;
      box.addEventListener('click', function (e) {
        var btn = e.target.closest ? e.target.closest('button[data-act]') : null;
        if (!btn) return;
        var row = btn.closest('.nt-item');
        var item = row ? findItem(row.getAttribute('data-item')) : null;
        if (!item) return;
        var act = btn.getAttribute('data-act');
        if (act === 'pdf') openNoticePdf(item);
        else if (act === 'use') useItem(item);
        else if (act === 'del') doDelete(item);
      });
    });

    /* 검색 */
    ['ntaQ', 'ntPickQ'].forEach(function (id) {
      var el = $(id);
      if (el) el.addEventListener('input', function () {
        clearTimeout(el._t);
        el._t = setTimeout(function () { renderLists(); }, 250);
      });
    });
    ['ntaYear', 'ntPickYear'].forEach(function (id) {
      var el = $(id);
      if (el) el.addEventListener('change', function () { renderLists(); });
    });
    if ($('ntaReload')) $('ntaReload').addEventListener('click', function () { loadList(true); });
    if ($('ntaListLoad')) $('ntaListLoad').addEventListener('click', function () { loadList(true); });

    /* 공문 관리자 서식 */
    Array.prototype.forEach.call(document.querySelectorAll('[data-nta]'), function (inp) {
      var name = inp.getAttribute('data-nta');
      inp.addEventListener('input', function () {
        S[name] = inp.value;
        if (name === 'noNext' || name === 'noPrefix') {
          var pv = $('ntaNoPreview');
          if (pv) pv.textContent = '다음 문서번호: ' + fullNo();
        }
      });
      inp.addEventListener('change', function () { S[name] = inp.value; saveSettings(); renderPages(); });
    });
    if ($('ntaSave')) $('ntaSave').addEventListener('click', function () {
      saveSettings();
      renderPages();
      A.toast('공문 서식을 저장했습니다.');
      if (A.pushSettings) A.pushSettings();
    });
    if ($('ntaReset')) $('ntaReset').addEventListener('click', function () {
      if (!window.confirm('공문 서식을 처음 값으로 되돌릴까요?')) return;
      S = defaults();
      saveSettings();
      renderAdminForm();
      renderPages();
      A.toast('공문 서식을 기본값으로 되돌렸습니다.');
    });

    Array.prototype.forEach.call(document.querySelectorAll('input[name="ntaSeal"]'), function (r) {
      r.addEventListener('change', function () {
        S.seal = r.value === 'off' ? 'off' : 'on';
        saveSettings();
        renderPages();
      });
    });
    Array.prototype.forEach.call(document.querySelectorAll('input[name="ntaAttach"]'), function (r) {
      r.addEventListener('change', function () {
        S.attachOn = (r.value === 'off' ? 'off' : 'on');
        saveSettings();
        renderPages();
      });
    });
    Array.prototype.forEach.call(document.querySelectorAll('input[name="ntaWm"]'), function (r) {
      r.addEventListener('change', function () {
        S.watermark = r.value;
        saveSettings();
        renderPages();
      });
    });
    if ($('ntaSealBtn')) $('ntaSealBtn').addEventListener('click', function () { $('ntaSealFile').click(); });
    if ($('ntaSealDel')) $('ntaSealDel').addEventListener('click', function () {
      try { localStorage.removeItem(KEY_SEAL); } catch (e) {}
      SEAL = '';
      renderAdminForm();
      renderPages();
      A.toast('기본 직인으로 돌렸습니다.');
    });
    if ($('ntaSealFile')) $('ntaSealFile').addEventListener('change', function () {
      var f = this.files && this.files[0];
      if (!f) return;
      var reader = new FileReader();
      reader.onload = function () {
        var im = new Image();
        im.onload = function () {
          var c = document.createElement('canvas');
          var r = Math.min(1, 480 / Math.max(im.width, im.height));
          c.width = Math.round(im.width * r);
          c.height = Math.round(im.height * r);
          c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
          SEAL = c.toDataURL('image/png');
          try { localStorage.setItem(KEY_SEAL, SEAL); } catch (e) {}
          renderAdminForm();
          renderPages();
          A.toast('직인 사진을 넣었습니다.');
        };
        im.onerror = function () { A.toast('그림을 읽지 못했습니다.'); };
        im.src = String(reader.result);
      };
      reader.readAsDataURL(f);
      this.value = '';
    });

    /* 드라이브 연결 키 */
    if ($('ntaKeySave')) $('ntaKeySave').addEventListener('click', function () {
      var v = String($('ntaKeyInput').value || '').trim();
      if (v.length < 20) { A.toast('연결 키가 너무 짧습니다. 40자짜리 키를 그대로 붙여 넣어 주세요.'); return; }
      A.setApiKey(v);
      $('ntaKeyInput').value = '';
      renderAdminForm();
      loadList(true);
      A.toast('드라이브 연결을 저장했습니다.');
    });

    /* PDF 보기 창 */
    if ($('ntPdfClose')) $('ntPdfClose').addEventListener('click', closePdfModal);
    if ($('ntPdfZoomIn')) $('ntPdfZoomIn').addEventListener('click', function () {
      PDF_STATE.zoom = Math.min(2.4, PDF_STATE.zoom + 0.25);
      applyPdfZoom();
    });
    if ($('ntPdfZoomOut')) $('ntPdfZoomOut').addEventListener('click', function () {
      PDF_STATE.zoom = Math.max(0.4, PDF_STATE.zoom - 0.25);
      applyPdfZoom();
    });
    if ($('ntPdfSave')) $('ntPdfSave').addEventListener('click', savePdfToDevice);
    if ($('ntPdfPrint')) $('ntPdfPrint').addEventListener('click', function () { window.print(); });

    /* 화면 크기가 바뀌면 지면 배율을 다시 맞춘다 */
    var rt = null;
    window.addEventListener('resize', function () {
      clearTimeout(rt);
      rt = setTimeout(function () {
        if (document.body.classList.contains('notice-mode')) fitPages();
      }, 160);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      if ($('ntPdfModal') && !$('ntPdfModal').hidden) closePdfModal();
      else if ($('ntPick') && !$('ntPick').hidden) closePick();
    });
  }

  /* ================================================================ 시작 */
  function init() {
    if (started) return;
    started = true;
    loadSettings();
    loadDraft();
    ensureMeasure();
    bind();
    renderAdminForm();
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () { LH = null; renderPages(); });
    }
  }

  function legacyCopy(text) {
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      var ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch (e) { return false; }
  }

  window.CertNotice = {
    enter: enter,
    enterAdmin: enterAdmin,
    openPdf: openNoticePdf,
    loadList: loadList,
    settings: function () { return S; },
    applySettings: function (obj) {
      if (!obj || typeof obj !== 'object') return;
      Object.keys(obj).forEach(function (k) {
        if (k.charAt(0) === '_') return;
        S[k] = obj[k];
      });
      saveSettings();
      renderAdminForm();
      if (document.body.classList.contains('notice-mode')) renderPages();
    }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
