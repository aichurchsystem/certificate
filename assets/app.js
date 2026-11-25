/* ==========================================================================
   노회 문서 앱 (대한예수교장로회(백석) 서울강동노회)
   - 표지: 증명서 발급 / 노회 공문 발급 두 갈래
   - 증명서 종류별 정의: data/types.json (제목·항목·본문·추가 입력·워터마크)
   - 지면에 찍히는 고정 글자: state.fmt (관리자 화면에서 고치고 이 기기에 저장)
   - 사람·교회 명단: data/people.json + 이 기기 저장값(cert.v1.people)
   - 직인 이미지: 기본 직인은 assets/seals/, 바꾼 직인은 이 기기(localStorage)
   - 증명사진: 이 기기(localStorage)에만 저장 — 저장소에는 올리지 않는다
   ========================================================================== */
(function () {
  'use strict';

  var A4W = 793.7, A4H = 1122.5, MM = 3.7795;
  var FIELDS_TOP = 80, DATE_TOP = 221.5;   /* 지면 조판 기준점(mm) */

  var SEALS = [
    { key: 'chair',      name: '노회장 인',    def: 'assets/seals/seal-chair-round.png' },
    { key: 'secretary',  name: '서기 인',      def: 'assets/seals/seal-secretary-round.png' },
    { key: 'presbytery', name: '노회 사각 인', def: 'assets/seals/seal-presbytery-square.png' }
  ];
  var SEAL_IMG = { chair: 'sealChair', secretary: 'sealSecretary', presbytery: 'sealOrg' };
  var WM_VARIANTS = ['navy', 'slate', 'ink', 'none'];

  var DEFAULTS = {
    church: '글로벌비전교회',
    churchAddress: '서울특별시 광진구 구의강변로3가길 33, 상가 2층(구의동)',
    representative: '박재용',
    address: '서울특별시 광진구 구의강변로3가길 33, 상가 2층(구의동)',
    position: '목사'
  };

  function defaultFmt() {
    return {
      org: '대한예수교장로회(백석)',
      presbytery: '서울강동노회',
      hqAddress: '',
      postalCode: '05048',
      presbyteryAddress: '서울특별시 광진구 구의강변로3가길 33, 2층',
      tel: 'Tel: 02-429-1318',
      fax: 'Fax: 02-429-1319',
      chairTitle: '노회장',
      chairName: '이용동',
      signerTitle: '서기',
      signerName: '박재용',
      noPrefix: '노회(증)',
      watermark: 'slate',
      signSeal: '1',
      slogan: '',
      logoSize: '16',
      ruleColor: '#1B3A5A',
      photoStamp: 'on',
      photoStampSize: '15',
      photoStampCorner: 'br',
      photoStampTone: '0.32',
      note1: '본 증명서의 진위 여부는 대한예수교장로회(백석) 서울강동노회로 문의하시기 바랍니다',
      note2: '발급일로부터 90일까지 유효합니다',
      types: {}
    };
  }

  var $ = function (id) { return document.getElementById(id); };
  var el = {
    type: $('fType'), person: $('fPerson'), name: $('fName'), position: $('fPosition'),
    birth: $('fBirth'), church: $('fChurch'), churchAddr: $('fChurchAddr'), addr: $('fAddr'),
    sender: $('fSender'), recipient: $('fRecipient'),
    date: $('fDate'), no: $('fNo'), inet: $('fInet'),
    extraBox: $('extraBox'), nameLabel: $('nameLabel'),
    peopleList: $('peopleList'), nameHint: $('nameHint'), warn: $('formWarn'),
    paper: $('paper'), host: $('paperHost'),
    pOrg: $('pOrg'), pHq: $('pHq'), pTel: $('pTel'), pFax: $('pFax'),
    pPresb: $('pPresb'), pNohoeAddr: $('pNohoeAddr'),
    pNo: $('pNo'), pTitle: $('pTitle'), pFields: $('pFields'), pBody: $('pBody'),
    pNohoeAddrRow: $('pAddrRow'), pTelRow: $('pAddrRow'), pNoteLine: $('pNoteLine'), pMark: $('pMark'),
    pDate: $('pDate'), pSignOrg: $('pSignOrg'),
    pSignChairTitle: $('pSignChairTitle'), pSignChair: $('pSignChair'),
    pSignTitle: $('pSignTitle'), pSigner: $('pSigner'),
    pNote1: $('pNote1'), pNote2: $('pNote2'), pInet: $('pInet'), pPhoto: $('pPhoto'),
    pFrom: $('pFrom'), pTo: $('pTo'), pFromRow: $('pFromRow'), pToRow: $('pToRow'),
    sealSlots: $('sealSlots'), sealSlotsAdmin: $('sealSlotsAdmin'),
    hList: $('hList'), hCnt: $('hCnt'), hSearch: $('hSearch'), hType: $('hType'), hPeriod: $('hPeriod'),
    hState: $('hState'), noticeSel: $('fNotice'),
    toast: $('toast'), tabDot: $('tabDot'), actionBar: $('actionBar')
  };

  var KEY_STATE = 'cert.v1.state';
  var KEY_HIST = 'cert.v1.history';
  var KEY_PEOPLE = 'cert.v1.people';
  var KEY_SEAL = 'cert.v1.seal.';
  var KEY_PHOTO = 'cert.v1.photo.';

  var TYPES = [], TYPE_BY_ID = Object.create(null);
  var people = [], basePeople = [];
  var state = null;
  var pendingSealKey = null, pendingSealInput = null, editingPersonId = null, newPhotoData = null;

  /* ------------------------------------------------------------------ 저장 */
  function loadJSON(key, fallback) {
    try { var v = JSON.parse(localStorage.getItem(key) || 'null'); return v === null ? fallback : v; }
    catch (e) { return fallback; }
  }
  function saveState() { try { localStorage.setItem(KEY_STATE, JSON.stringify(state)); } catch (e) {} }
  function loadHistory() { return loadJSON(KEY_HIST, []); }
  function saveHistory(list) { try { localStorage.setItem(KEY_HIST, JSON.stringify(list)); } catch (e) {} }
  function savePeople() { try { localStorage.setItem(KEY_PEOPLE, JSON.stringify(people)); } catch (e) {} }

  /* ------------------------------------------------------------------ 날짜 */
  function todayISO() {
    try {
      return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit'
      }).format(new Date());
    } catch (e) {
      var d = new Date();
      return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
    }
  }
  function isoToParts(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
    return m ? { y: +m[1], m: +m[2], d: +m[3] } : null;
  }
  function fmtDate(iso) {
    var p = isoToParts(iso);
    return p ? p.y + '년 ' + p.m + '월 ' + p.d + '일' : '';
  }
  function fmtDateWide(iso) {
    return fmtDate(iso);
  }
  function fmtStamp(isoTs) {
    var d = new Date(isoTs), p = function (n) { return (n < 10 ? '0' : '') + n; };
    return (d.getMonth() + 1) + '.' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }
  function fmtStampFull(isoTs) {
    var d = new Date(isoTs), p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  /* ------------------------------------------------------------------ 번호 */
  function nextNo(iso) {
    var p = isoToParts(iso) || { y: new Date().getFullYear() };
    var yy = String(p.y).slice(2), max = 0;
    loadHistory().forEach(function (h) {
      var m = /제(\d{2})-(\d{5})호/.exec(h.no || '');
      if (m && m[1] === yy) max = Math.max(max, parseInt(m[2], 10));
    });
    var prefix = (state && state.fmt && state.fmt.noPrefix) || '노회(증)';
    return prefix + ' 제' + yy + '-' + ('00000' + (max + 1)).slice(-5) + '호';
  }
  function makeInet() {
    var L = 'ABCDEFGHJKLMNPQRSTUVWXYZ', s = '';
    for (var i = 0; i < 4; i++) s += L[Math.floor(Math.random() * L.length)];
    var n = String(Math.floor(Math.random() * 1e9));
    while (n.length < 9) n = '0' + n;
    return s + n;
  }

  /* ------------------------------------------------------------------ 자료 */
  function normalize(v) { return (v || '').replace(/\s+/g, '').replace(/[·.]/g, ''); }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function deepCopy(o) { return JSON.parse(JSON.stringify(o)); }

  function loadTypes() {
    return fetch('data/types.json', { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        TYPES = ((data && data.types) || []).map(function (t) {
          t.rows = t.rows || []; t.extra = t.extra || []; t.body = t.body || [''];
          return t;
        });
        TYPE_BY_ID = Object.create(null);
        TYPES.forEach(function (t) { TYPE_BY_ID[t.id] = t; });
      })
      .catch(function () { TYPES = []; });
  }

  function loadPeople() {
    return fetch('data/people.json', { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        basePeople = ((data && data.people) || []).filter(function (p) { return p && p.name; });
        basePeople.forEach(function (p, i) { if (!p.id) p.id = 'p' + (i + 1); });
        var saved = loadJSON(KEY_PEOPLE, null);
        people = Array.isArray(saved) && saved.length ? saved : deepCopy(basePeople);
        renderPeopleOptions();
      })
      .catch(function () { basePeople = []; people = []; });
  }

  function syncPeople() {
    people = people.filter(function (p) { return p && p.name; });
    people.forEach(function (p, i) { if (!p.id) p.id = 'p' + Date.now() + i; });
    savePeople();
    renderPeopleOptions();
    renderPeopleList();
    renderPaper();
  }

  function renderPeopleOptions() {
    var opts = people.map(function (p) {
      var tail = [p.position, p.church].filter(Boolean).join(' · ');
      return '<option value="' + esc(p.id) + '">' + esc(p.name + (tail ? ' — ' + tail : '')) + '</option>';
    }).join('');
    if (el.person) {
      el.person.innerHTML = '<option value="">— 직접 입력 —</option>' + opts;
      el.person.value = state && state.personId ? state.personId : '';
      if (!el.person.value) el.person.value = '';
    }
    if (el.peopleList) {
      el.peopleList.innerHTML = people.map(function (p) {
        return '<option value="' + esc(p.name) + '"></option>';
      }).join('');
    }
  }

  /* --------------------------------------------------------------- 서명부 직인 */
  function sealSrc(key) {
    var own = null;
    try { own = localStorage.getItem(KEY_SEAL + key); } catch (e) {}
    if (own) return own;
    var s = SEALS.filter(function (x) { return x.key === key; })[0];
    return s ? s.def : '';
  }
  function hasOwnSeal(key) {
    try { return !!localStorage.getItem(KEY_SEAL + key); } catch (e) { return false; }
  }
  function setSeal(key, data) {
    try {
      if (data) localStorage.setItem(KEY_SEAL + key, data);
      else localStorage.removeItem(KEY_SEAL + key);
      return true;
    } catch (e) { return false; }
  }

  function applySeal() {
    SEALS.forEach(function (s) {
      var img = $(SEAL_IMG[s.key]);
      if (!img) return;
      var hold = img.closest ? img.closest('.seal-hold') : null;   /* 직인 자리(줄 높이를 차지하지 않는 상자) */
      if (!state.sealsOn) { img.hidden = true; if (hold) hold.hidden = true; return; }
      img.hidden = false;
      if (hold) hold.hidden = false;
      var src = sealSrc(s.key);
      if (img.getAttribute('src') !== src) img.setAttribute('src', src);
    });
  }

  function renderSealSlots() {
    var html = SEALS.map(function (s) {
      var own = hasOwnSeal(s.key);
      return '<div class="seal-slot">' +
        '<div class="st"><img src="' + esc(sealSrc(s.key)) + '" alt=""></div>' +
        '<div class="sn">' + esc(s.name) + '<small>' + (own ? '내가 넣은 직인' : '기본 직인') + '</small></div>' +
        '<button type="button" class="mini" data-pick="' + s.key + '">' + (own ? '바꾸기' : '넣기') + '</button>' +
        (own ? '<button type="button" class="mini" data-drop="' + s.key + '">지우기</button>' : '') +
        '</div>';
    }).join('');
    if (el.sealSlots) el.sealSlots.innerHTML = html;
    if (el.sealSlotsAdmin) el.sealSlotsAdmin.innerHTML = html;
  }

  function saveSealFromFile(key, file) {
    if (!file) return;
    if (file.type.indexOf('image/') !== 0) { toast('이미지 파일을 골라 주세요.'); return; }
    var reader = new FileReader();
    reader.onload = function () {
      var im = new Image();
      im.onload = function () {
        var max = 480, r = Math.min(1, max / Math.max(im.width, im.height));
        var cv = document.createElement('canvas');
        cv.width = Math.max(1, Math.round(im.width * r));
        cv.height = Math.max(1, Math.round(im.height * r));
        cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height);
        var data = cv.toDataURL('image/png');
        if (!setSeal(key, data)) { toast('저장 공간이 부족해 직인을 저장하지 못했습니다.'); return; }
        renderSealSlots();
        applySeal();
        toast('직인을 넣었습니다. 이 기기에만 저장됩니다.');
      };
      im.onerror = function () { toast('이미지를 읽지 못했습니다.'); };
      im.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  /* --------------------------------------------------------------- 증명사진 */
  function photoKey(id) { return KEY_PHOTO + (id || ''); }
  function photoFor(id) {
    if (!id) return '';
    try { return localStorage.getItem(photoKey(id)) || ''; } catch (e) { return ''; }
  }
  function setPhoto(id, data) {
    if (!id) return false;
    try {
      if (data) localStorage.setItem(photoKey(id), data);
      else localStorage.removeItem(photoKey(id));
      return true;
    } catch (e) { return false; }
  }
  function savePhotoFromFile(id, file) {
    if (!file) return;
    if (file.type.indexOf('image/') !== 0) { toast('이미지 파일을 골라 주세요.'); return; }
    var reader = new FileReader();
    reader.onload = function () {
      var im = new Image();
      im.onload = function () {
        // 3:4 증명사진 비율로 가운데를 잘라 360×480으로 줄인다
        var tw = 360, th = 480, ratio = tw / th;
        var sw = im.width, sh = im.height, cw = sw, ch = sh;
        if (sw / sh > ratio) { cw = sh * ratio; } else { ch = sw / ratio; }
        var sx = (sw - cw) / 2, sy = (sh - ch) / 2;
        var cv = document.createElement('canvas');
        cv.width = tw; cv.height = th;
        cv.getContext('2d').drawImage(im, sx, sy, cw, ch, 0, 0, tw, th);
        var data = cv.toDataURL('image/jpeg', 0.82);
        if (!setPhoto(id, data)) { toast('저장 공간이 부족해 사진을 저장하지 못했습니다.'); return; }
        newPhotoData = data;
        renderPersonForm();
        renderPaper();
        renderPeopleList();
        toast('사진을 넣었습니다. 이 기기에만 저장됩니다.');
      };
      im.onerror = function () { toast('이미지를 읽지 못했습니다.'); };
      im.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  /* --------------------------------------------------------------- 양식 글자 */
  function typeText(def) {
    var o = (state.fmt.types && state.fmt.types[def.id]) || {};
    return {
      title: o.title || def.title || def.name,
      body: (o.body && o.body.length) ? o.body : def.body,
      labels: o.labels || {},
      signTitle: o.signTitle || state.fmt.signerTitle,
      signerName: o.signerName || state.fmt.signerName
    };
  }

  function typeOverride(id, create) {
    state.fmt.types = state.fmt.types || {};
    if (!state.fmt.types[id] && create) state.fmt.types[id] = {};
    return state.fmt.types[id];
  }

  /* --------------------------------------------------------------- 상태 */
  function blankState() {
    var iso = todayISO();
    var p = people[0] || null;
    return {
      typeId: 'membership',
      personId: p ? p.id : '',
      name: p ? (p.name || '') : '',
      position: (p && p.position) || DEFAULTS.position,
      birth: (p && p.birth) || '',
      church: (p && p.church) || DEFAULTS.church,
      churchAddress: (p && p.churchAddress) || DEFAULTS.churchAddress,
      representative: (p && p.representative) || DEFAULTS.representative,
      address: (p && p.address) || DEFAULTS.address,
      sender: '서울강동노회', recipient: '',
      date: iso, no: '', inet: makeInet(), docNo: '', title: '', noticeId: '',
      noEdited: false, inetEdited: false,
      sealsOn: true,
      extras: {}, bodies: {}, fmt: defaultFmt()
    };
  }

  /* 이 기기에 남은 예전 기본값을 새 기본값으로 옮긴다(한 번만) */
  var LEGACY_FMT = {
    hqAddress: ['서울특별시 서초구 남부순환로 2221'],
    tel: ['Tel: 584-6885.9845', 'Tel: 584-6885.9845  Fax: 521-2729'],
    fax: ['Fax: 521-2729']
  };
  function migrateFmt(fmt, saved) {
    var def = defaultFmt();
    Object.keys(LEGACY_FMT).forEach(function (k) {
      var v = String(fmt[k] == null ? '' : fmt[k]).trim();
      if (LEGACY_FMT[k].indexOf(v) > -1) fmt[k] = def[k];
    });
    /* 새 지면(2026-11-25)에서 한 번만 옮긴다 — 이후에 관리자에서 고른 값은 그대로 둔다 */
    if (saved && saved.mig !== 6) {
      /* 옛 기본 안내문은 새 문구로 옮긴다(직접 고친 값은 그대로 둔다) */
      if (String(fmt.note1 || '').trim() === '본 증명서의 진위는 대한예수교장로회(백석) 서울강동노회로 문의하시기 바랍니다.')
        fmt.note1 = def.note1;
      if (String(fmt.note2 || '').trim() === '발급일로부터 90일까지만 효력이 있습니다.')
        fmt.note2 = def.note2;
    }
    if (!saved || saved.mig !== 5) {
      if (String(fmt.signerTitle || '').trim() === '노회 서기') fmt.signerTitle = def.signerTitle;
      if (String(fmt.watermark || '').trim() === 'navy') fmt.watermark = def.watermark;
      /* 종류별 문구에 남은 옛 직함도 함께 옮긴다 */
      Object.keys(fmt.types || {}).forEach(function (id) {
        var o = fmt.types[id];
        if (o && typeof o === 'object' && String(o.signTitle || '').trim() === '노회 서기') delete o.signTitle;
      });
      if (!String(fmt.tel || '').trim()) fmt.tel = def.tel;
      if (!String(fmt.fax || '').trim()) fmt.fax = def.fax;
      if (!String(fmt.postalCode || '').trim()) fmt.postalCode = def.postalCode;
      if (!String(fmt.chairTitle || '').trim() && !String(fmt.chairName || '').trim()) {
        fmt.chairTitle = def.chairTitle; fmt.chairName = def.chairName;
      }
    }
  }

  function initState() {
    var saved = loadJSON(KEY_STATE, {});
    var base = blankState();
    Object.keys(base).forEach(function (k) {
      if (saved[k] !== undefined && saved[k] !== null) base[k] = saved[k];
    });
    // 발급일은 열 때마다 오늘(한국 시간)로 다시 계산한다
    base.date = todayISO();
    base.extras = base.extras || {};
    base.bodies = base.bodies || {};
    base.fmt = base.fmt || defaultFmt();
    var fmt = defaultFmt();
    if (saved.fmt && typeof saved.fmt === 'object') {
      Object.keys(fmt).forEach(function (k) {
        if (k !== 'types' && saved.fmt[k] !== undefined && saved.fmt[k] !== null) fmt[k] = saved.fmt[k];
      });
      if (saved.fmt.types && typeof saved.fmt.types === 'object') fmt.types = saved.fmt.types;
    }
    migrateFmt(fmt, saved);
    base.fmt = fmt;
    // 예전 '본문 문구 수정' 저장값을 종류별 문구로 옮긴다
    Object.keys(base.bodies || {}).forEach(function (id) {
      if (base.bodies[id] && base.bodies[id].length) {
        var o = fmt.types[id] || (fmt.types[id] = {});
        if (!o.body) o.body = base.bodies[id].slice();
      }
    });
    if (typeof saved.sealsOn === 'boolean') base.sealsOn = saved.sealsOn;
    else if (saved.sealChoice === 'none') base.sealsOn = false;
    state = base;
    state.mig = 6;
    state.no = state.no || nextNo(state.date);
    saveState();
  }

  function currentDef() {
    return TYPE_BY_ID[state.typeId] || TYPES[0] || {
      id: 'membership', name: '소속증명서', kind: 'church', title: '소속증명서',
      rows: [{ label: '교회명', src: 'church' }, { label: '주소', src: 'churchAddress' },
             { label: '대표자', src: 'rep' }, { label: '직분', src: 'position' }],
      body: ['위 교회는 대한예수교장로회(백석) 서울강동노회 산하에', '속한 교회임을 증명합니다.'], extra: []
    };
  }
  function extraOf(typeId) {
    if (!state.extras[typeId]) state.extras[typeId] = {};
    return state.extras[typeId];
  }

  function personById(id) {
    return people.filter(function (p) { return p.id === id; })[0] || null;
  }
  function personByName(q) {
    var n = normalize(q);
    if (!n) return null;
    var exact = people.filter(function (p) { return normalize(p.name) === n; })[0];
    if (exact) return exact;
    if (n.length >= 2) {
      var cands = people.filter(function (p) { return normalize(p.name).indexOf(n) > -1; });
      if (cands.length === 1) return cands[0];
    }
    return null;
  }
  function personByPosition(pos) {
    var n = normalize(pos);
    if (!n) return null;
    var cands = people.filter(function (p) { return normalize(p.position) === n; });
    return cands.length === 1 ? cands[0] : null;
  }

  function applyPerson(p, keepTypedName) {
    if (!p) return;
    state.personId = p.id || '';
    if (!keepTypedName) state.name = p.name || '';
    state.position = p.position || '';
    state.birth = p.birth || '';
    state.church = p.church || '';
    state.churchAddress = p.churchAddress || '';
    state.representative = p.representative || '';
    state.address = p.address || '';
    if (p.plantDate) extraOf('church-plant').plantDate = p.plantDate;
    if (p.foundDate) extraOf('church-found').foundDate = p.foundDate;
    if (p.ordainDate) extraOf('ordination').ordainDate = p.ordainDate;
    saveState();
    render();
    if (el.person) el.person.value = state.personId;
  }

  /* 사람 종류(재직·노회 참석·노회비)로 바꿨을 때 성명이 비어 있으면 명단에서 채운다 */
  function fillPersonName() {
    if (currentDef().kind === 'church') return;
    if (String(state.name || '').trim()) return;
    var p = personById(state.personId) || personByName(state.representative) || (people.length === 1 ? people[0] : null);
    if (!p || !p.name) return;
    state.name = p.name;
    /* 비어 있는 칸만 명단 값으로 함께 채운다 */
    if (!String(state.birth || '').trim()) state.birth = p.birth || '';
    if (!String(state.address || '').trim()) state.address = p.address || '';
    if (!String(state.church || '').trim()) state.church = p.church || '';
    if (!String(state.position || '').trim()) state.position = p.position || '';
    saveState();
  }

  /* --------------------------------------------------------------- 값 채우기 */
  /* 받침에 맞춰 조사를 고른다: {name:은} → 박재용은 / 이용동은 */
  function josa(word, kind) {
    var w = String(word || '');
    var c = w.charCodeAt(w.length - 1);
    var hasJong = false;
    if (c >= 0xAC00 && c <= 0xD7A3) hasJong = ((c - 0xAC00) % 28) !== 0;
    var jong = (c >= 0xAC00 && c <= 0xD7A3) ? ((c - 0xAC00) % 28) : 0;
    switch (kind) {
      case '은': case '는': return hasJong ? '은' : '는';
      case '이': case '가': return hasJong ? '이' : '가';
      case '을': case '를': return hasJong ? '을' : '를';
      case '과': case '와': return hasJong ? '과' : '와';
      case '으로': case '로': return (!hasJong || jong === 8) ? '로' : '으로';
      default: return '';
    }
  }

  function fillMap() {
    var ex = extraOf(currentDef().id);
    var m = {
      church: state.church,
      churchAddress: state.churchAddress,
      rep: state.representative,
      representative: state.representative,
      position: state.position,
      name: state.name,
      birth: fmtDate(state.birth),
      address: state.address,
      presbytery: state.fmt.presbytery,
      date: fmtDate(state.date)
    };
    Object.keys(ex).forEach(function (k) {
      var v = ex[k];
      m[k] = /^\d{4}-\d{2}-\d{2}$/.test(v || '') ? fmtDate(v) : (v || '');
    });
    return m;
  }

  function fill(text) {
    var map = fillMap();
    return String(text).replace(/\{(\w+)(?::([가-힣]+))?\}/g, function (m, k, j) {
      var v = map[k];
      if (v === undefined || v === null) return m;
      v = String(v);
      return j ? v + josa(v, j) : v;
    });
  }

  /* --------------------------------------------------------------- 지면 */
  function setFit(node, minPx) {
    node.style.fontSize = '';
    var fs = parseFloat(getComputedStyle(node).fontSize), guard = 0;
    while (node.scrollWidth > node.clientWidth + 1 && fs > (minPx || 10) && guard < 60) {
      fs -= 0.5;
      node.style.fontSize = (fs / MM).toFixed(2) + 'mm';
      guard++;
    }
  }

  /* 한 줄로만 찍히는 머리글 줄이 폭을 넘으면 그 줄만 조금씩 줄인다(두 줄로 접히지 않게) */
  function fitOneLine(node, minMm) {
    if (!node) return;
    node.style.fontSize = '';
    node.style.letterSpacing = '';
    for (var i = 0; i < 40; i++) {
      if (node.scrollWidth <= node.clientWidth + 1) return;
      var fs = parseFloat(getComputedStyle(node).fontSize) / MM;   /* mm */
      if (fs <= minMm) return;
      /* 넘침 비율만큼 한 번에 줄인다(한 번에 14% 넘게 줄이지 않아 크기가 튀지 않는다) */
      var ratio = node.clientWidth / node.scrollWidth;
      var next = Math.max(minMm, fs * Math.max(ratio, 0.86));
      node.style.fontSize = next.toFixed(2) + 'mm';
    }
  }
  function fitHead() {
    fitOneLine($('pOrgLine'), 3.6);
    fitOneLine($('pAddrRow'), 2.6);
    fitOneLine(el.pNoteLine, 1.8);
  }

  function layoutTitle() {
    var t = el.pTitle;
    t.style.letterSpacing = ''; t.style.paddingLeft = ''; t.style.fontSize = '';
    if (!t.offsetWidth) return;          /* 지면이 화면에 없을 때는 폭을 재지 않는다(다시 그릴 때 계산) */
    /* 제목이 지면 폭을 넘을 때만 글자를 조금 줄인다(자간은 0.8mm로 고정) */
    var maxPx = 166 * MM;
    if (t.offsetWidth > maxPx) {
      var fs = parseFloat(getComputedStyle(t).fontSize);
      while (t.offsetWidth > maxPx && fs > 20) { fs -= 0.5; t.style.fontSize = (fs / MM).toFixed(2) + 'mm'; }
    }
  }

  function rowValue(row) {
    var map = {
      birth: fmtDate(state.birth),
      church: state.church,
      churchAddress: state.churchAddress,
      address: state.address,
      name: state.name,
      position: state.position,
      rep: state.representative,
      representative: state.representative,
      presbytery: state.fmt.presbytery
    };
    if (map[row.src] !== undefined) return map[row.src];
    var v = extraOf(currentDef().id)[row.src] || '';
    if (row.fmt === 'date' || /^\d{4}-\d{2}-\d{2}$/.test(v)) return fmtDate(v);
    return v;
  }

  /* 사진 압인 — 사진 폭의 절반 크기로 모서리에 절반씩 걸치게 놓는다 */
  function applyPhotoStamp(hasPhoto) {
    var img = $('pStamp');
    if (!img) return;
    var F = state.fmt || {};
    if (!hasPhoto || F.photoStamp === 'off') { img.hidden = true; img.removeAttribute('src'); return; }
    var size = Number(F.photoStampSize) || 15;
    var corner = String(F.photoStampCorner || 'br');
    var PL = 162, PT = 84.6, PWd = 30, PHt = 40;    /* 지면의 사진 자리(mm) */
    var inset = 1.6;
    var cx = (corner === 'tl' || corner === 'bl') ? PL + inset : PL + PWd - inset;
    var cy = (corner === 'tl' || corner === 'tr') ? PT + inset : PT + PHt - inset;
    if (img.getAttribute('src') !== 'assets/seals/seal-blind-emboss.png') {
      img.setAttribute('src', 'assets/seals/seal-blind-emboss.png');
    }
    img.style.width = size + 'mm';
    img.style.height = size + 'mm';
    img.style.left = (cx - size / 2).toFixed(2) + 'mm';
    img.style.top = (cy - size / 2).toFixed(2) + 'mm';
    img.style.opacity = String(F.photoStampTone || '0.32');
    img.hidden = false;
  }

  function renderPaper() {
    var F = state.fmt, def = currentDef(), T = typeText(def);

    el.pOrg.textContent = F.org || '';
    el.pPresb.textContent = F.presbytery || '';
    el.pPresb.hidden = !String(F.presbytery || '').trim();
    $('pOrgGap').hidden = el.pPresb.hidden || !String(F.org || '').trim();
    el.pHq.textContent = F.hqAddress || '';
    el.pHq.hidden = !String(F.hqAddress || '').trim();
    el.paper.classList.toggle('has-hq', !el.pHq.hidden);
    el.pNohoeAddr.textContent = '';
    el.pNohoeAddr.hidden = true;                       /* 상단에는 주소를 찍지 않는다(아래 한 번만) */
    var postal = String(F.postalCode || '').trim();
    $('pPostal').textContent = postal ? '(' + postal + ')' : '';
    $('pPostal').hidden = !postal;
    var tel = String(F.tel || '').trim(), fax = String(F.fax || '').trim();
    el.pTel.textContent = tel;
    el.pFax.textContent = fax;
    el.pTel.hidden = !tel;
    el.pFax.hidden = !fax;
    /* 주소·전화·팩스는 한 줄 — 값이 빠진 칸 앞의 간격도 함께 빠진다 */
    $('pTelGap').hidden = !(tel && !el.pNohoeAddr.hidden);
    $('pFaxGap').hidden = !(fax && tel);
    el.pNohoeAddrRow.hidden = true;                    /* 상단 주소·전화 줄은 쓰지 않는다 */
    var cLine = $('pContact');
    if (cLine) {
      var bits = [];
      if (postal) bits.push('(' + postal + ')');
      if (String(F.presbyteryAddress || '').trim()) bits.push(String(F.presbyteryAddress).trim());
      if (tel) bits.push(tel.replace(/^Tel:\s*/i, ''));       /* 주소 옆에 핸드폰 번호, 이메일은 지면에 넣지 않는다 */
      cLine.textContent = bits.join(' · ');
      cLine.hidden = !bits.length;
      /* 한 줄에 담기게 10pt → 9pt → 8.5pt → 8pt */
      var steps = ['3.53mm', '3.175mm', '3.0mm', '2.82mm'];
      cLine.style.fontSize = '';
      for (var si = 0; si < steps.length; si++) {
        cLine.style.fontSize = steps[si];
        if (cLine.scrollWidth <= cLine.clientWidth + 1) break;
      }
    }

    /* 성구 한 줄(비우면 빠짐)과 로고 크기 */
    var holy = $('pHolyline');
    if (holy) {
      holy.textContent = F.slogan || '';
      holy.hidden = !String(F.slogan || '').trim();
      el.paper.classList.toggle('has-holy', !holy.hidden);
    }
    el.paper.style.setProperty('--rule', F.ruleColor || '#1B3A5A');
    el.paper.style.setProperty('--rule-lite', F.ruleColor || '#42618A');
    var logo = Number(F.logoSize) || 16;
    el.paper.style.setProperty('--logo', logo + 'mm');
    el.paper.style.setProperty('--logo-half', (logo / 2) + 'mm');

    el.pNo.textContent = state.no || '';
    /* 서명부 직인 배치: 1안(글자 위) / 2안(이름 어깨) */
    el.paper.dataset.sg = F.signSeal === '2' ? '2' : '1';
    el.pTitle.textContent = T.title;
    layoutTitle();
    el.pDate.textContent = fmtDateWide(state.date);
    el.pSignOrg.textContent = F.org + ' ' + (F.presbytery || '');
    el.pSignChairTitle.textContent = F.chairTitle || '';
    el.pSignChair.textContent = F.chairName || '이용동';
    el.pSignTitle.textContent = T.signTitle;
    el.pSigner.textContent = T.signerName || '박재용';
    /* 안내문 두 줄을 한 줄로 이어 찍는다(폭이 모자라면 fitHead가 그 줄만 줄인다) */
    var n1 = String(F.note1 || '').trim(), n2 = String(F.note2 || '').trim();
    if (n1 && n2 && !/[.!?]$/.test(n1)) n1 += '.';
    el.pNoteLine.textContent = [n1, n2].filter(Boolean).join(' ');
    el.pInet.textContent = state.inet || '';

    // 엠블럼 워터마크: 종류별 켜기·끄기 + 지면 전체 시안(네이비·회청·먹색·없음)
    var wmVariant = WM_VARIANTS.indexOf(F.watermark) < 0 ? 'slate' : F.watermark;
    var wm = el.paper.querySelector('.wm');
    if (wm) {
      el.paper.dataset.wm = wmVariant;
      var wsrc = 'assets/logo-sky.svg';
      if (wm.getAttribute('src') !== wsrc) wm.setAttribute('src', wsrc);
      wm.style.display = (def.watermark === false || wmVariant === 'none') ? 'none' : '';
    }

    // 증명사진 (있을 때만 자리를 차지한다)
    var photo = photoFor(state.personId);
    if (photo) {
      el.pPhoto.src = photo;
      el.pPhoto.hidden = false;
      el.paper.classList.add('has-photo');
    } else {
      el.pPhoto.hidden = true;
      el.pPhoto.removeAttribute('src');
      el.paper.classList.remove('has-photo');
    }
    /* 사진 압인(철인) — 사진 모서리에 걸쳐 눌린 자국만 남긴다 */
    applyPhotoStamp(!!photo);

    // 발신처 · 수신처 (빈 줄은 찍지 않는다)
    el.pFrom.textContent = state.sender || '';
    el.pTo.textContent = state.recipient || '';
    el.pFromRow.hidden = !String(state.sender || '').trim();
    el.pToRow.hidden = !String(state.recipient || '').trim();
    $('pMail').hidden = el.pFromRow.hidden && el.pToRow.hidden;

    // 항목
    el.pFields.innerHTML = def.rows.map(function (r) {
      var label = (T.labels && T.labels[r.src]) || r.label;
      var lb = String(label).replace(/\s+/g, '').split('').map(function (c) {
        return '<i>' + esc(c) + '</i>';
      }).join('');
      return '<div class="fld"><span class="lb">' + lb + '</span>' +
             '<span class="cl">:</span><span class="vl">' + esc(rowValue(r)) + '</span></div>';
    }).join('');
    var n = def.rows.length || 4;
    var rowH = n >= 5 ? 9.2 : 9.6;            /* 항목이 많은 종은 조금 좁혀 한 장에 담는다 */
    Array.prototype.forEach.call(el.pFields.children, function (f) { f.style.height = rowH + 'mm'; });
    el.pBody.style.top = (FIELDS_TOP + n * rowH + 12).toFixed(1) + 'mm';   /* 제목 ↔ 첫 항목 12mm */

    // 본문
    el.pBody.innerHTML = T.body.map(fill).map(function (l, i) {
      return '<span class="bl' + (i === 0 ? ' first' : '') + '">' + esc(l) + '</span>';
    }).join('');
    setFit(el.pBody, 12);
    /* 본문이 길어 날짜 줄을 침범하면 그 종만 줄 간격을 조금 줄인다(한 장 유지) */
    var lh = 13, guard = 0;
    el.pBody.style.lineHeight = lh + 'mm';
    while (el.pBody.getBoundingClientRect().height > (DATE_TOP - 8) * MM - (parseFloat(el.pBody.style.top) * MM) && guard < 12) {
      lh -= 0.4; guard++;
      el.pBody.style.lineHeight = lh.toFixed(1) + 'mm';
    }

    Array.prototype.forEach.call(el.pFields.querySelectorAll('.vl'), function (v) { setFit(v, 9.5); });
    applySeal();
    fitHead();
  }

  /* --------------------------------------------------------------- 폼 */
  function renderForm() {
    var def = currentDef();
    if (!el.type.options.length) {
      el.type.innerHTML = TYPES.map(function (t) {
        return '<option value="' + esc(t.id) + '">' + esc(t.name) + '</option>';
      }).join('');
    }
    el.type.value = def.id;
    var isChurch = def.kind === 'church';
    el.nameLabel.textContent = isChurch ? '대표자' : '성명';

    if (!def.extra.length) {
      el.extraBox.innerHTML = '';
    } else {
      el.extraBox.innerHTML = def.extra.map(function (f) {
        var v = extraOf(def.id)[f.key] || '';
        return '<div class="field">' +
          '<label for="ex_' + esc(f.key) + '">' + esc(f.label) + (f.required ? ' <span class="req">*</span>' : '') + '</label>' +
          '<input id="ex_' + esc(f.key) + '" data-extra="' + esc(f.key) + '" type="' + (f.type === 'date' ? 'date' : 'text') + '"' +
          ' value="' + esc(v) + '" placeholder="' + esc(f.placeholder || '') + '">' +
          '</div>';
      }).join('');
      Array.prototype.forEach.call(el.extraBox.querySelectorAll('[data-extra]'), function (inp) {
        inp.addEventListener('input', function () {
          extraOf(def.id)[inp.dataset.extra] = inp.value;
          saveState(); renderPaper();
        });
      });
    }

    var mainVal = isChurch ? state.representative : state.name;
    if (el.name.value !== mainVal) el.name.value = mainVal || '';
    if (el.position.value !== state.position) el.position.value = state.position || '';
    if (el.birth.value !== state.birth) el.birth.value = state.birth || '';
    if (el.church.value !== state.church) el.church.value = state.church;
    if (el.churchAddr.value !== state.churchAddress) el.churchAddr.value = state.churchAddress;
    if (el.addr.value !== state.address) el.addr.value = state.address;
    if (el.sender.value !== state.sender) el.sender.value = state.sender;
    if (el.recipient.value !== state.recipient) el.recipient.value = state.recipient;
    if (el.date.value !== state.date) el.date.value = state.date;
    if (el.no.value !== state.no) el.no.value = state.no;
    if (el.inet.value !== state.inet) el.inet.value = state.inet;
    if (el.person) el.person.value = state.personId || '';
    Array.prototype.forEach.call(document.querySelectorAll('input[name="sealOnOff"]'), function (r) {
      r.checked = (r.value === 'on') === !!state.sealsOn;
    });
  }

  function render() {
    if ($('fDocNo') && document.activeElement !== $('fDocNo')) $('fDocNo').value = state.docNo || '';
    if ($('fTitle') && document.activeElement !== $('fTitle')) $('fTitle').value = state.title || '';
    renderNoticeOptions();
    renderForm(); renderPaper();
  }

  function typeNameOf(id) {
    var t = TYPE_BY_ID[id];
    return t ? t.name : (id || '증명서');
  }

  /* 관리자 화면 채우기 */
  function renderFmtForm() {
    var F = state.fmt;
    Array.prototype.forEach.call(document.querySelectorAll('[data-fmt]'), function (inp) {
      if (document.activeElement === inp) return;
      inp.value = F[inp.dataset.fmt] == null ? '' : F[inp.dataset.fmt];
    });
    var wmV = WM_VARIANTS.indexOf(F.watermark) > -1 ? F.watermark : 'navy';
    Array.prototype.forEach.call(document.querySelectorAll('input[name="wmChoice"]'), function (r) {
      r.checked = r.value === wmV;
    });
    Array.prototype.forEach.call(document.querySelectorAll('input[name="signSeal"]'), function (r) {
      r.checked = r.value === (F.signSeal === '2' ? '2' : '1');
    });
    Array.prototype.forEach.call(document.querySelectorAll('input[name="stOn"]'), function (r) {
      r.checked = r.value === (F.photoStamp === 'off' ? 'off' : 'on');
    });
    Array.prototype.forEach.call(document.querySelectorAll('input[name="stSize"]'), function (r) {
      r.checked = String(r.value) === String(F.photoStampSize || '15');
    });
    Array.prototype.forEach.call(document.querySelectorAll('input[name="stCorner"]'), function (r) {
      r.checked = r.value === String(F.photoStampCorner || 'br');
    });
    Array.prototype.forEach.call(document.querySelectorAll('input[name="stTone"]'), function (r) {
      r.checked = String(r.value) === String(F.photoStampTone || '0.32');
    });

    if (!TYPES.length) return;
    var sel = $('fmType');
    if (!sel.options.length) {
      sel.innerHTML = TYPES.map(function (t) { return '<option value="' + esc(t.id) + '">' + esc(t.name) + '</option>'; }).join('');
      sel.value = state.typeId;
    }
    var def = TYPE_BY_ID[sel.value] || currentDef();
    var T = typeText(def);
    if (document.activeElement !== $('fmTitle')) $('fmTitle').value = T.title;
    if (document.activeElement !== $('fmBody')) $('fmBody').value = T.body.join('\n');
    if (document.activeElement !== $('fmTSignTitle')) $('fmTSignTitle').value = T.signTitle;
    if (document.activeElement !== $('fmTSignName')) $('fmTSignName').value = T.signerName;

    $('fmLabels').innerHTML = def.rows.map(function (r) {
      var v = (T.labels && T.labels[r.src]) || r.label;
      return '<label class="lg"><span>' + esc(r.label) + '</span>' +
        '<input data-label-src="' + esc(r.src) + '" value="' + esc(v) + '"></label>';
    }).join('');
  }

  /* 사람 명단 (관리자) — 대표자·기도처 시작일·설립일·안수일을 한눈에 */
  function renderPeopleList() {
    var box = $('peList');
    if (!box) return;
    if (!people.length) {
      box.innerHTML = '<p class="empty">명단이 비어 있습니다. ‘새로 넣기’로 사람을 더해 두거나, 아래 ‘엑셀에서 명단 가져오기’로 한꺼번에 넣으세요.</p>';
      return;
    }
    box.innerHTML = people.map(function (p) {
      var sub = [p.position, p.church].filter(Boolean).join(' · ');
      var facts = [
        ['대표자', p.representative],
        ['기도처 시작일', p.plantDate],
        ['설립일', p.foundDate],
        ['안수일', p.ordainDate]
      ].map(function (f) {
        var v = String(f[1] || '');
        return '<div><dt>' + f[0] + '</dt><dd class="' + (v ? '' : 'none') + '">' + esc(v || '—') + '</dd></div>';
      }).join('');
      return '<div class="hitem" data-person="' + esc(p.id) + '">' +
        '<div class="who"><b>' + esc(p.name) + '</b>' +
        (sub ? '<small>' + esc(sub) + '</small>' : '') +
        '<dl class="pfacts">' + facts + '</dl></div>' +
        '<button type="button" class="mini" data-pedit="' + esc(p.id) + '">고치기</button>' +
        '<button type="button" class="del" data-pdel="' + esc(p.id) + '" aria-label="명단에서 지우기">✕</button>' +
        '</div>';
    }).join('');
  }

  /* ---------------------------------------------------------- 엑셀 명단 가져오기
     샘플 엑셀(data/명단-샘플.xlsx)과 같은 열 이름이면 순서가 달라도 읽는다.
     파일은 브라우저 안에서만 읽고 어디에도 올리지 않는다. */
  var PE_COLS = [
    { key: 'name', label: '이름', aliases: ['이름', '성명', '목사명'] },
    { key: 'position', label: '직분', aliases: ['직분', '직책'] },
    { key: 'birth', label: '생년월일', aliases: ['생년월일', '생일', '출생일'], date: true },
    { key: 'church', label: '교회명', aliases: ['교회명', '교회', '담임교회'] },
    { key: 'churchAddress', label: '교회 주소', aliases: ['교회주소', '교회 주소'] },
    { key: 'address', label: '주소(개인)', aliases: ['주소(개인)', '개인주소', '주소'] },
    { key: 'representative', label: '대표자', aliases: ['대표자', '대표'] },
    { key: 'plantDate', label: '기도처 시작일', aliases: ['기도처시작일', '기도처 시작일', '개척일'], date: true },
    { key: 'foundDate', label: '설립일', aliases: ['설립일'], date: true },
    { key: 'ordainDate', label: '안수일', aliases: ['안수일'], date: true }
  ];

  function peKey(s) { return String(s == null ? '' : s).replace(/[\s()·._-]/g, '').toLowerCase(); }

  function peYmd(y, m, d) {
    var yy = Number(y), mm = Number(m), dd = Number(d);
    if (!(yy >= 1900 && yy <= 2200) || !(mm >= 1 && mm <= 12) || !(dd >= 1 && dd <= 31)) return '';
    var dt = new Date(Date.UTC(yy, mm - 1, dd));
    if (dt.getUTCMonth() + 1 !== mm || dt.getUTCDate() !== dd) return '';
    return yy + '-' + (mm < 10 ? '0' : '') + mm + '-' + (dd < 10 ? '0' : '') + dd;
  }

  function peDate(v) {
    var s = String(v == null ? '' : v).replace(/^\s+|\s+$/g, '');
    if (!s) return '';
    var m;
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return peYmd(s.slice(0, 4), s.slice(5, 7), s.slice(8, 10));
    m = /^(\d{4})\s*[.\-\/년]\s*(\d{1,2})\s*[.\-\/월]\s*(\d{1,2})/.exec(s);
    if (m) return peYmd(m[1], m[2], m[3]);
    m = /^(\d{4})(\d{2})(\d{2})$/.exec(s);
    if (m) return peYmd(m[1], m[2], m[3]);
    if (/^\d+(\.\d+)?$/.test(s) && window.SheetRead) {
      var d = window.SheetRead.serialToDate(s);
      if (d) return d;
    }
    return '';
  }

  function readAsArrayBuffer(file) {
    return new Promise(function (res, rej) {
      var r = new FileReader();
      r.onload = function () { res(r.result); };
      r.onerror = function () { rej(new Error('파일을 읽지 못했습니다.')); };
      r.readAsArrayBuffer(file);
    });
  }
  function readAsTextFile(file) {
    return new Promise(function (res, rej) {
      var r = new FileReader();
      r.onload = function () { res(String(r.result || '')); };
      r.onerror = function () { rej(new Error('파일을 읽지 못했습니다.')); };
      r.readAsText(file);
    });
  }

  var PE_IMP = null;

  function pePreview(rows) {
    if (!window.SheetRead) { toast('엑셀 읽기 도구를 불러오지 못했습니다.'); return; }
    if (!rows || !rows.length) { toast('엑셀에서 내용을 찾지 못했습니다.'); return; }

    /* 머리글 줄 찾기(앞 6줄 안에서 이름·성명 열이 있는 줄) */
    var headAt = -1, colMap = {};
    for (var r = 0; r < Math.min(rows.length, 6); r++) {
      var map = {}, hit = 0;
      (rows[r] || []).forEach(function (cell, ci) {
        var k = peKey(cell);
        if (!k) return;
        PE_COLS.forEach(function (col) {
          if (map[col.key] !== undefined) return;
          for (var a = 0; a < col.aliases.length; a++) {
            if (k === peKey(col.aliases[a])) { map[col.key] = ci; hit++; return; }
          }
        });
      });
      if (map.name !== undefined) { headAt = r; colMap = map; break; }
    }
    if (headAt < 0) {
      toast('이름 열을 찾지 못했습니다. [샘플 엑셀 받기]로 받은 파일의 열 이름을 그대로 써 주세요.');
      return;
    }

    var recs = [], warn = [], seen = {};
    for (var i = headAt + 1; i < rows.length; i++) {
      var row = rows[i] || [], rec = {}, bad = [];
      PE_COLS.forEach(function (col) {
        var ci = colMap[col.key];
        var raw = ci === undefined ? '' : row[ci];
        var v = String(raw == null ? '' : raw).replace(/^\s+|\s+$/g, '');
        if (col.date) {
          var dv = peDate(v);
          if (v && !dv) bad.push(col.label);
          rec[col.key] = dv;
        } else rec[col.key] = v;
      });
      if (!rec.name) continue;
      if (seen[peKey(rec.name)]) warn.push((i + 1) + '번째 줄: 이름 ‘' + rec.name + '’이 파일 안에서 겹칩니다.');
      seen[peKey(rec.name)] = 1;
      if (bad.length) warn.push((i + 1) + '번째 줄 ' + rec.name + ': ' + bad.join('·') + ' 날짜를 읽지 못해 비웠습니다.');
      recs.push(rec);
    }
    if (!recs.length) { toast('이름이 적힌 줄이 없습니다.'); return; }

    PE_IMP = { recs: recs, warn: warn };
    var head = '<tr><th>이름</th><th>직분</th><th>교회명</th><th>대표자</th><th>기도처 시작일</th><th>설립일</th><th>안수일</th></tr>';
    var body = recs.map(function (p) {
      return '<tr><td class="n">' + esc(p.name) + '</td><td>' + esc(p.position || '') + '</td><td>' + esc(p.church || '') +
        '</td><td>' + esc(p.representative || '') + '</td><td class="d">' + esc(p.plantDate || '—') +
        '</td><td class="d">' + esc(p.foundDate || '—') + '</td><td class="d">' + esc(p.ordainDate || '—') + '</td></tr>';
    }).join('');
    $('pePrevTable').innerHTML = head + body;
    $('pePrevTitle').textContent = '미리 보기 · ' + recs.length + '명';
    $('pePrevSave').textContent = '이 ' + recs.length + '명을 명단에 넣기';
    var w = $('pePrevWarn');
    if (warn.length) {
      w.hidden = false;
      w.innerHTML = warn.slice(0, 6).map(function (t) { return '<span>' + esc(t) + '</span>'; }).join('') +
        (warn.length > 6 ? '<span>… 외 ' + (warn.length - 6) + '건</span>' : '');
    } else w.hidden = true;
    $('pePrev').hidden = false;
    if ($('pePrev').scrollIntoView) $('pePrev').scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  function peCommit() {
    if (!PE_IMP) return;
    var mode = $('peMerge') ? $('peMerge').value : 'skip';
    var added = 0, changed = 0, skipped = 0;
    PE_IMP.recs.forEach(function (rec, i) {
      var k = normalize(rec.name);
      var cur = people.filter(function (p) { return normalize(p.name) === k; })[0];
      if (cur && mode === 'skip') { skipped++; return; }
      if (cur) {
        PE_COLS.forEach(function (col) {
          var v = rec[col.key];
          if (v) cur[col.key] = v;
        });
        changed++;
        return;
      }
      var np = { id: 'p' + Date.now() + i, name: rec.name };
      PE_COLS.forEach(function (col) { if (rec[col.key]) np[col.key] = rec[col.key]; });
      people.push(np);
      added++;
    });
    savePeople();
    syncPeople();
    renderPeopleOptions();
    renderPeopleList();
    renderPersonForm();
    $('pePrev').hidden = true;
    PE_IMP = null;
    toast('엑셀에서 ' + added + '명을 넣었습니다' +
      (changed ? ' · ' + changed + '명 고침' : '') +
      (skipped ? ' · 같은 이름 ' + skipped + '명 건너뜀' : '') + '.');
  }

  var PE_FIELDS = ['Name', 'Position', 'Birth', 'Church', 'ChurchAddr', 'Address', 'Rep', 'Plant', 'Found', 'Ordain'];

  function renderPersonForm(open) {
    var f = $('peForm');
    if (!f) return;
    var p = editingPersonId ? personById(editingPersonId) : null;
    if (open === true) f.hidden = false;      /* '새로 넣기'·'고치기'로 열 때만 펼친다 */
    else if (open === false) f.hidden = true;
    $('peName').value = p ? (p.name || '') : '';
    $('pePosition').value = p ? (p.position || '') : '';
    $('peBirth').value = p ? (p.birth || '') : '';
    $('peChurch').value = p ? (p.church || '') : '';
    $('peChurchAddr').value = p ? (p.churchAddress || '') : '';
    $('peAddress').value = p ? (p.address || '') : '';
    $('peRep').value = p ? (p.representative || '') : '';
    $('pePlant').value = p ? (p.plantDate || '') : '';
    $('peFound').value = p ? (p.foundDate || '') : '';
    $('peOrdain').value = p ? (p.ordainDate || '') : '';
    newPhotoData = p ? photoFor(p.id) : '';
    var thumb = $('pePhotoThumb');
    thumb.innerHTML = newPhotoData ? '<img src="' + newPhotoData + '" alt="">' : '없음';
  }

  function savePersonFromForm() {
    var name = $('peName').value.trim();
    if (!name) { toast('이름을 먼저 적어 주세요.'); return; }
    var rec = {
      id: editingPersonId || '',
      name: name,
      position: $('pePosition').value.trim(),
      birth: $('peBirth').value,
      church: $('peChurch').value.trim(),
      churchAddress: $('peChurchAddr').value.trim(),
      representative: $('peRep').value.trim(),
      address: $('peAddress').value.trim(),
      plantDate: $('pePlant').value,
      foundDate: $('peFound').value,
      ordainDate: $('peOrdain').value
    };
    var idx = -1;
    if (rec.id) idx = people.map(function (p) { return p.id; }).indexOf(rec.id);
    if (idx < 0) {
      var same = people.map(function (p) { return normalize(p.name); }).indexOf(normalize(name));
      if (same > -1) idx = same;
    }
    if (idx > -1) {
      rec.id = people[idx].id;
      people[idx] = rec;
    } else {
      rec.id = 'p' + Date.now();
      people.push(rec);
    }
    if (newPhotoData) setPhoto(rec.id, newPhotoData);
    if (rec.id === state.personId) { state.name = rec.name; state.position = rec.position; state.birth = rec.birth; state.church = rec.church; state.churchAddress = rec.churchAddress; state.representative = rec.representative; state.address = rec.address; }
    editingPersonId = rec.id;
    syncPeople();
    renderPersonForm();
    render();
    toast('명단에 저장했습니다.');
  }

  /* --------------------------------------------------------------- 미리보기 배율 */
  function fitPreview() {
    var w = el.host.clientWidth;
    if (!w) return;
    var wide = window.matchMedia('(min-width:900px)').matches;
    var maxH = wide ? Math.max(window.innerHeight - 150, 520) : Math.min(window.innerHeight * 0.40, 420);
    var s = Math.min(w / A4W, maxH / A4H);
    el.paper.style.position = 'absolute';
    el.paper.style.top = '0';
    el.paper.style.left = Math.round((w - A4W * s) / 2) + 'px';
    el.paper.style.transform = 'scale(' + s + ')';
    el.host.style.height = Math.round(A4H * s) + 'px';
  }

  /* ------------------------------------------------------------------ 크게 보기
     오버레이는 화면(100dvh)을 꽉 채우고, 지면은 화면 너비에 꽉 맞춘다.
     화면보다 길면 오버레이 안에서 위아래로 스크롤되고, 뒤 화면은 잠근다. */
  var zoomBase = 1, zoomStep = 1;

  function lockScroll(on) {
    document.documentElement.classList.toggle('lock', on);
    document.body.classList.toggle('lock', on);
  }
  /* 열린 창이 하나라도 있으면 뒤 화면을 잠근다 */
  function syncLock() {
    var any = !$('zoomModal').hidden || !$('saveModal').hidden || !$('guideModal').hidden || !$('imgView').hidden;
    lockScroll(any);
  }

  function applyZoom() {
    var body = $('zoomBody');
    var stage = body.querySelector('.zoom-stage');
    if (!stage) return;
    var clone = stage.firstElementChild;
    var s = zoomBase * zoomStep;
    stage.style.width = (A4W * s) + 'px';
    stage.style.height = (A4H * s) + 'px';
    clone.style.transform = 'scale(' + s + ')';
    $('zoomPct').textContent = Math.round(s * 100) + '%';
  }

  function openZoom() {
    var body = $('zoomBody');
    body.innerHTML = '';
    $('zoomModal').hidden = false;
    lockScroll(true);

    var stage = document.createElement('div');
    stage.className = 'zoom-stage';
    var clone = el.paper.cloneNode(true);
    Array.prototype.forEach.call(clone.querySelectorAll('[id]'), function (n) { n.removeAttribute('id'); });
    clone.removeAttribute('id');
    /* 미리보기에서 쓰던 배율·위치를 지우고 오버레이 안에서 새로 놓는다 */
    clone.style.position = ''; clone.style.left = ''; clone.style.top = ''; clone.style.transform = '';
    stage.appendChild(clone);
    body.appendChild(stage);

    zoomBase = Math.max(0.2, body.clientWidth / A4W);   /* 가로를 꽉 채운다 */
    zoomStep = 1;
    applyZoom();
    syncLock();
    body.scrollTop = 0;
  }

  function closeZoom() {
    $('zoomModal').hidden = true;
    $('zoomBody').innerHTML = '';
    syncLock();
    fitPreview();
  }

  /* ------------------------------------------------------------------ 알림 */
  var toastTimer = null;
  function toast(msg) {
    el.toast.textContent = msg;
    el.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.toast.hidden = true; }, 2800);
  }
  function warnForm(msg) { el.warn.textContent = msg || ''; el.warn.hidden = !msg; }

  /* ------------------------------------------------------------------ 검사 */
  function ensure() {
    var def = currentDef();
    el.name.classList.remove('bad');
    var mainVal = def.kind === 'church' ? state.representative : state.name;
    if (!String(mainVal || '').trim()) {
      warnForm((def.kind === 'church' ? '대표자 이름' : '성명') + '을 먼저 적어 주세요.');
      el.name.classList.add('bad');
      el.name.focus();
      return false;
    }
    var missing = (def.extra || []).filter(function (f) {
      return f.required && !String(extraOf(def.id)[f.key] || '').trim();
    });
    if (missing.length) {
      warnForm(missing[0].label + '을(를) 적어 주세요.');
      var inp = el.extraBox.querySelector('#ex_' + missing[0].key);
      if (inp) inp.focus();
      return false;
    }
    warnForm('');
    return true;
  }

  /* ------------------------------------------------------------------ 이력 */
  function recordIssue() {
    var def = currentDef();
    var who = def.kind === 'church' ? state.representative : state.name;
    if (!String(who || '').trim()) return false;
    var list = loadHistory(), last = list[0];
    if (last && last.no === state.no && last.name === who && last.typeId === def.id &&
        (Date.now() - new Date(last.at).getTime()) < 60000) return true;
    var ex = {};
    Object.keys(extraOf(def.id)).forEach(function (k) { ex[k] = extraOf(def.id)[k]; });
    list.unshift({
      id: 'c' + Date.now() + Math.random().toString(36).slice(2, 6),
      at: new Date().toISOString(),
      date: state.date,
      no: state.no, typeId: def.id, type: typeText(def).title || def.name,
      name: who, birth: state.birth, address: state.address,
      church: state.church, position: state.position,
      sender: state.sender, recipient: state.recipient, inet: state.inet, extras: ex
    });
    saveHistory(list);
    renderHistory();
    return true;
  }

  function loadFromHistory(id) {
    var h = loadHistory().filter(function (x) { return x.id === id; })[0];
    if (!h) return;
    state.typeId = h.typeId || 'membership';
    state.name = h.name;
    state.birth = h.birth || '';
    state.address = h.address || '';
    state.church = h.church || state.church;
    state.position = h.position || state.position;
    state.sender = h.sender || state.sender;
    state.recipient = h.recipient || '';
    state.no = h.no; state.noEdited = true;
    state.date = h.date || todayISO();
    state.inet = makeInet();
    var p = personByName(h.name);
    state.personId = p ? p.id : '';
    extraOf(state.typeId);
    state.extras[state.typeId] = Object.assign({}, h.extras || {});
    saveState(); render(); switchView('issue'); fitPreview();
    toast('이력의 ' + (typeNameOf(state.typeId)) + '를 불러왔습니다. 그대로 다시 받을 수 있습니다.');
  }

  function csvDownload() {
    var list = loadHistory();
    if (!list.length) { toast('내려받을 이력이 없습니다.'); return; }
    var head = ['발급일시', '발급일', '증명서 종류', '증명서 번호', 'Internet No.', '이름', '생년월일', '주소', '교회명', '직분', '발신처', '수신처'];
    var lines = [head.join(',')];
    list.forEach(function (h) {
      lines.push([fmtStampFull(h.at), h.date || '', typeNameOf(h.typeId) || h.type, h.no, h.inet || '', h.name, h.birth || '', h.address || '',
                  h.church || '', h.position || '', h.sender || '', h.recipient || ''].map(csvCell).join(','));
    });
    var blob = new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    downloadBlob(blob, '증명서-발급이력-' + todayISO() + '.csv');
    toast('CSV로 내려받았습니다.');
  }
  function csvCell(v) {
    var s = String(v == null ? '' : v);
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function downloadBlob(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 60000);   /* 큰 PDF도 끝까지 내려받게 */
    return true;
  }

  /* ================================================================ 드라이브 연결
     발급할 때마다 지면을 JPG로 만들어 목사님 드라이브에 저장하고 발급대장에 한 줄 남긴다.
     - 연결 키(40자)는 저장소에 넣지 않고 이 기기(localStorage)에만 둔다.
     - 발급은 화면을 막지 않고 뒤에서 한다. 실패하면 큐에 넣고 다시 보낸다. */
  var KV_KEY = 'cert.v1.key';
  var KV_QUEUE = 'cert.drive.pending';
  var API_URL = 'https://script.google.com/macros/s/AKfycbyL7uvAFlx1Vgk2-WC8G3dDIGMRzpvqoqb90BVKe64DMd7qAdzNGqF4v-7-EKMQi0yP/exec';

  function apiKey() { try { return String(localStorage.getItem(KV_KEY) || '').trim(); } catch (e) { return ''; } }
  function setApiKey(k) { try { localStorage.setItem(KV_KEY, String(k || '').trim()); } catch (e) {} }

  function apiGet(params) {
    var q = Object.keys(params).map(function (k) {
      return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
    }).join('&');
    return fetch(API_URL + '?key=' + encodeURIComponent(apiKey()) + '&' + q, { cache: 'no-store' })
      .then(function (r) { return r.json(); });
  }

  function apiPost(payload) {
    var body = Object.assign({ key: apiKey() }, payload);
    return fetch(API_URL, {
      method: 'POST', cache: 'no-store',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body)
    }).then(function (r) { return r.json(); });
  }

  /* ---------------------------------------------------------- 발급 상태 표시 */
  function chip(kind, text, retry) {
    var c = $('cloudChip');
    if (!c) return;
    c.hidden = !text;
    c.className = 'cloud-chip' + (kind ? ' ' + kind : '');
    c.innerHTML = '<span class="dot"></span><span class="t">' + esc(text) + '</span>';
    if (retry) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'mini'; b.textContent = '다시 시도';
      b.addEventListener('click', function () { flushQueue(true); });
      c.appendChild(b);
    }
  }

  function pendingCount() { return (loadJSON(KV_QUEUE, []) || []).length; }
  function pendingChip() {
    var n = pendingCount();
    if (!n) return;
    chip('warn', '저장 대기 ' + n + '건 — 인터넷이 되면 자동으로 다시 보냅니다', true);
  }

  function blobsToBase64(blob) {
    return new Promise(function (res, rej) {
      var r = new FileReader();
      r.onload = function () { res(String(r.result).split(',')[1] || ''); };
      r.onerror = function () { rej(new Error('이미지를 읽지 못했습니다.')); };
      r.readAsDataURL(blob);
    });
  }

  /* 지면을 150dpi 정도의 JPG로 (1MB 이하로 줄인다) */
  function paperJpeg() {
    return paperCanvas().then(function (canvas) {
      function make(scale, q) {
        var w = Math.round(canvas.width * scale), h = Math.round(canvas.height * scale);
        var c2 = document.createElement('canvas');
        c2.width = w; c2.height = h;
        c2.getContext('2d').drawImage(canvas, 0, 0, w, h);
        return new Promise(function (res) { c2.toBlob(res, 'image/jpeg', q); });
      }
      return make(0.62, 0.92).then(function (b) {
        if (b && b.size <= 1000 * 1024) return b;
        return make(0.5, 0.86).then(function (b2) { return (b2 && b2.size < b.size) ? b2 : b; });
      });
    });
  }

  function ledgerMeta() {
    var def = currentDef();
    var notice = noticeById(state.noticeId);
    return {
      certType: typeText(def).title || def.name,
      personName: def.kind === 'church' ? state.representative : state.name,
      birth: state.birth || '',
      church: state.church || '',
      position: state.position || '',
      issueDate: state.date || todayISO(),
      docNo: notice ? String(notice.no || '') : String(state.docNo || ''),
      title: String(state.title || '') || (notice ? String(notice.title || '') : (typeText(def).title || def.name)),
      noticeNo: notice ? String(notice.no || '') : ''
    };
  }

  var issuing = false;
  function cloudIssue() {
    if (!apiKey()) {
      chip('warn', '드라이브 연결 키가 없어 저장하지 못했습니다 · 관리자 > 드라이브 연결');
      return;
    }
    if (issuing) return;
    issuing = true;
    var meta = ledgerMeta();
    chip('busy', '드라이브 저장 중…');
    paperJpeg().then(function (blob) {
      if (!blob) throw new Error('이미지를 만들지 못했습니다.');
      return blobsToBase64(blob).then(function (b64) {
        return apiPost(Object.assign({ action: 'issue', certNo: state.no, dataBase64: b64, mimeType: 'image/jpeg' }, meta));
      });
    }).then(function (r) {
      issuing = false;
      if (!r || !r.ok) throw new Error((r && r.error) || '저장하지 못했습니다.');
      if (r.no && r.no !== state.no) { state.no = r.no; saveState(); renderPaper(); }
      chip('ok', '드라이브 저장됨 · ' + r.no);
      refreshNextNo();
      if (pendingCount()) flushQueue();
    }).catch(function (e) {
      issuing = false;
      console.error(e);
      var list = loadJSON(KV_QUEUE, []) || [];
      if (list.length < 5) {
        paperJpeg().then(function (blob) {
          return blobsToBase64(blob).then(function (b64) {
            list.push(Object.assign({ certNo: state.no, dataBase64: b64, mimeType: 'image/jpeg', ts: Date.now() }, meta));
            localStorage.setItem(KV_QUEUE, JSON.stringify(list));
          });
        }).catch(function () {}).then(function () {
          chip('warn', '저장 안 됨 — ' + (e.message || '연결 실패') + ' (대기 ' + pendingCount() + '건)', true);
        });
      } else {
        chip('warn', '저장 안 됨 — ' + (e.message || '연결 실패'), true);
      }
    });
  }

  function flushQueue(force) {
    var list = loadJSON(KV_QUEUE, []) || [];
    if (!list.length) { toast('저장 대기 중인 발급이 없습니다.'); return Promise.resolve(); }
    if (!apiKey()) return Promise.resolve();
    if (!navigator.onLine && !force) return Promise.resolve();
    chip('busy', '저장 대기 ' + list.length + '건 보내는 중…');
    var left = [];
    return list.reduce(function (p, item) {
      return p.then(function () {
        return apiPost(Object.assign({ action: 'issue' }, item)).then(function (r) {
          if (!r || !r.ok) left.push(item);
        }).catch(function () { left.push(item); });
      });
    }, Promise.resolve()).then(function () {
      localStorage.setItem(KV_QUEUE, JSON.stringify(left));
      if (left.length) chip('warn', '저장 대기 ' + left.length + '건 — 다시 시도해 주세요', true);
      else { chip('ok', '드라이브 저장됨'); toast('대기 중이던 발급을 드라이브에 저장했습니다.'); }
    });
  }

  /* ---------------------------------------------------------- 번호·공문 목록 */
  function refreshNextNo() {
    if (!apiKey()) return Promise.resolve();
    return apiGet({ action: 'next-no' }).then(function (r) {
      if (r && r.ok && r.no && !pendingCount()) {
        state.no = r.no; state.serverNo = r.no; saveState();
        if (el.no) el.no.value = r.no;
        renderPaper();
      }
    }).catch(function () {});
  }

  var NOTICES = [];
  function noticeById(id) {
    if (!id) return null;
    return NOTICES.filter(function (n) { return n.id === id; })[0] || null;
  }
  function loadNotices() {
    if (!apiKey()) return Promise.resolve([]);
    return apiGet({ action: 'notice-list' }).then(function (r) {
      NOTICES = (r && r.ok && r.items) ? r.items : [];
      renderNoticeOptions();
      return NOTICES;
    }).catch(function () { NOTICES = []; renderNoticeOptions(); return []; });
  }
  function renderNoticeOptions() {
    var sel = el.noticeSel;
    if (!sel) return;
    var cur = state.noticeId || '';
    sel.innerHTML = '<option value="">— 연결 안 함 —</option>' + NOTICES.map(function (n) {
      return '<option value="' + esc(n.id) + '">' + esc(n.no) + ' · ' + esc(String(n.title || '').slice(0, 28)) + '</option>';
    }).join('');
    sel.value = noticeById(cur) ? cur : '';
  }

  /* --------------------------------------------------------------- 발급 이력 */
  var HROWS = [], HXLSX = '';

  function periodRange() {
    var p = el.hPeriod ? el.hPeriod.value : 'all';
    var d = new Date(), y = d.getFullYear(), m = d.getMonth();
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    var lastDay = function (yy, mm) { return new Date(yy, mm + 1, 0).getDate(); };
    if (p === 'this') return { from: y + '-' + pad(m + 1) + '-01', to: y + '-' + pad(m + 1) + '-' + pad(lastDay(y, m)) };
    if (p === 'last') {
      var ly = m === 0 ? y - 1 : y, lm = m === 0 ? 11 : m - 1;
      return { from: ly + '-' + pad(lm + 1) + '-01', to: ly + '-' + pad(lm + 1) + '-' + pad(lastDay(ly, lm)) };
    }
    if (p === 'custom') return { from: $('hFrom').value || '', to: $('hTo').value || '' };
    return { from: '', to: '' };
  }

  function renderHistory() {
    if (!el.hList) return;
    if (!apiKey()) {
      el.hCnt.textContent = '—';
      el.hList.innerHTML = '<p class="empty">드라이브에 연결하면 발급 이력이 여기에 나옵니다.<br>관리자 › 드라이브 연결에서 연결 키를 넣어 주세요.</p>';
      if (el.hState) el.hState.textContent = '';
      return;
    }
    if (el.hState) { el.hState.textContent = '불러오는 중…'; el.hState.hidden = false; }
    var rg = periodRange();
    var params = { action: 'list', limit: 200 };
    if (el.hSearch.value.trim()) params.q = el.hSearch.value.trim();
    if (el.hType.value) params.type = el.hType.value;
    if (rg.from) params.from = rg.from;
    if (rg.to) params.to = rg.to;
    apiGet(params).then(function (r) {
      if (!r || !r.ok) throw new Error((r && r.error) || '불러오지 못했습니다.');
      HROWS = r.items || [];
      HXLSX = r.xlsxUrl || '';
      if (el.hState) el.hState.hidden = true;
      el.hCnt.textContent = (r.total != null ? r.total : HROWS.length) + '건';
      if (!HROWS.length) {
        el.hList.innerHTML = '<p class="empty">조건에 맞는 발급 기록이 없습니다.</p>';
        return;
      }
      el.hList.innerHTML = HROWS.map(function (h, i) {
        var id = h['파일ID'] || '';
        var thumb = id ? '<img class="hthumb" loading="lazy" src="https://drive.google.com/thumbnail?id=' + encodeURIComponent(id) + '&sz=w200" alt="" onerror="this.classList.add(\'none\')">' : '<span class="hthumb ph">JPG</span>';
        return '<button type="button" class="hitem" data-i="' + i + '">' + thumb +
          '<span class="hmain"><b>' + esc(h['이름']) + '</b>' +
          '<em>' + esc(h['증명서종류']) + '</em>' +
          '<small>' + esc(h['발급일자'] || h['발급일시'] || '') + ' · ' + esc(h['자체번호'] || '') + '</small>' +
          (h['노회공문번호'] ? '<small class="notice">공문 ' + esc(h['노회공문번호']) + '</small>' : '') +
          (h['제목'] ? '<small class="ttl">' + esc(String(h['제목']).slice(0, 40)) + '</small>' : '') +
          '</span></button>';
      }).join('');
    }).catch(function (e) {
      HROWS = [];
      el.hCnt.textContent = '—';
      if (el.hState) { el.hState.hidden = false; el.hState.className = 'hstate bad'; el.hState.textContent = '불러오지 못했습니다 · ' + (e.message || '연결 실패'); }
      el.hList.innerHTML = '<p class="empty">불러오지 못했습니다.<br><button type="button" class="mini" id="hRetry">다시 시도</button></p>';
      var b = $('hRetry');
      if (b) b.addEventListener('click', renderHistory);
    });
  }

  function openHistoryItem(i) {
    var h = HROWS[i]; if (!h) return;
    var box = $('hDetail'); if (!box) return;
    box.hidden = false;
    box.innerHTML = '<div class="hdb"><div class="hdb-head"><b>' + esc(h['이름']) + '</b>' +
      '<button type="button" class="mini" id="hClose">닫기</button></div>' +
      '<p class="hdb-meta">' + esc(h['증명서종류']) + ' · ' + esc(h['자체번호'] || '') + ' · ' + esc(h['발급일자'] || '') +
      (h['문서번호'] ? '<br>문서번호 ' + esc(h['문서번호']) : '') +
      (h['노회공문번호'] ? '<br>노회 공문 ' + esc(h['노회공문번호']) : '') + '</p>' +
      '<div class="hdb-img" id="hdbImg">불러오는 중…</div>' +
      '<div class="hdb-acts"><a class="btn" target="_blank" rel="noopener" href="' + esc(h['파일링크'] || '#') + '">드라이브에서 열기</a>' +
      '<button type="button" class="btn primary" id="hReissue">다시 발급</button></div></div>';
    $('hClose').addEventListener('click', function () { box.hidden = true; });
    $('hReissue').addEventListener('click', function () {
      state.typeId = typeIdByName(h['증명서종류']) || state.typeId;
      state.name = h['이름'] || state.name;
      state.birth = h['생년월일'] || '';
      state.church = h['교회명'] || state.church;
      state.position = h['직분'] || state.position;
      state.docNo = h['문서번호'] || '';
      state.title = h['제목'] || '';
      var p = personByName(h['이름']);
      state.personId = p ? p.id : '';
      saveState(); render(); switchView('issue'); fitPreview();
      toast('같은 사람·같은 종류로 발급 화면을 채웠습니다.');
    });
    if (h['파일ID']) {
      apiPost({ action: 'file', id: h['파일ID'] }).then(function (r) {
        if (!r || !r.ok) throw new Error('미리보기를 불러오지 못했습니다.');
        $('hdbImg').innerHTML = '<img alt="발급한 증명서" src="data:' + (r.mimeType || 'image/jpeg') + ';base64,' + r.dataBase64 + '">';
      }).catch(function (e) {
        $('hdbImg').innerHTML = '<p class="empty">' + esc(e.message) + '</p>';
      });
    } else {
      $('hdbImg').innerHTML = '<p class="empty">파일이 없습니다.</p>';
    }
  }

  function typeIdByName(name) {
    var hit = TYPES.filter(function (t) { return t.name === name; })[0];
    return hit ? hit.id : '';
  }

  function downloadXlsx() {
    if (!HXLSX) { toast('엑셀 주소를 아직 받지 못했습니다. 목록을 먼저 불러와 주세요.'); return; }
    window.open(HXLSX, '_blank', 'noopener');
    toast('엑셀 파일을 내려받습니다. (발급대장 전체)');
  }

  /* ------------------------------------------------------- 발급번호 설정(관리자) */
  function loadNoConfig() {
    if (!apiKey()) { if ($('noPreview')) $('noPreview').textContent = '드라이브 연결 키를 먼저 넣어 주세요.'; return; }
    apiGet({ action: 'no-config' }).then(function (r) {
      if (!r || !r.ok) throw new Error((r && r.error) || '불러오지 못했습니다.');
      if ($('cfgPrefix')) $('cfgPrefix').value = r.cfg.noPrefix;
      if ($('cfgStart')) $('cfgStart').value = r.cfg.noStart;
      if ($('cfgDigits')) $('cfgDigits').value = r.cfg.noDigits;
      if ($('noPreview')) $('noPreview').textContent = '다음 번호: ' + r.next;
    }).catch(function (e) { if ($('noPreview')) $('noPreview').textContent = '불러오지 못했습니다 · ' + e.message; });
  }

  function saveNoConfig() {
    if (!apiKey()) { toast('드라이브 연결 키를 먼저 넣어 주세요.'); return; }
    if (!confirm('발급번호 규칙을 바꿉니다. 앞으로 발급되는 번호에 바로 적용됩니다.<br>저장할까요?'.replace(/<br>/g, '\n'))) return;
    apiPost({ action: 'no-config-save', noPrefix: $('cfgPrefix').value, noStart: $('cfgStart').value, noDigits: $('cfgDigits').value })
      .then(function (r) {
        if (!r || !r.ok) throw new Error((r && r.error) || '저장하지 못했습니다.');
        if ($('noPreview')) $('noPreview').textContent = '다음 번호: ' + r.next;
        toast('발급번호 규칙을 저장했습니다. 다음 번호: ' + r.next);
        refreshNextNo();
      }).catch(function (e) { toast('저장하지 못했습니다 · ' + e.message); });
  }

  function saveApiKey() {
    var v = String($('apiKeyInput').value || '').trim();
    if (v.length < 20) { toast('연결 키가 너무 짧습니다. 40자짜리 키를 그대로 붙여 넣어 주세요.'); return; }
    setApiKey(v);
    toast('드라이브 연결을 저장했습니다.');
    $('apiKeyInput').value = '';
    $('apiKeyState').textContent = '연결됨 (키 ' + apiKey().slice(0, 4) + '…' + apiKey().slice(-4) + ')';
    loadNoConfig(); refreshNextNo(); loadNotices(); renderHistory();
  }

  /* 지면 문구 설정을 드라이브 '설정' 탭과 맞춘다(다른 기기에서도 같은 문구) */
  var KV_TS = 'cert.settings.ts';
  function localTs() { var v = Number(loadJSON(KV_TS, 0)); return isNaN(v) ? 0 : v; }
  function settingsPayload() {
    var p = { fmt: state.fmt, ts: Date.now() };
    if (window.CertNotice && window.CertNotice.settings) p.notice = window.CertNotice.settings();
    return p;
  }
  function pushSettings() {
    if (!apiKey()) return Promise.resolve();
    var p = settingsPayload();
    try { localStorage.setItem(KV_TS, String(p.ts)); } catch (e) {}
    return apiPost({ action: 'settings-save', settings: JSON.stringify(p), ts: p.ts })
      .then(function (r) { if (r && r.ok) chip('ok', '지면 문구를 드라이브 설정에도 저장했습니다.'); })
      .catch(function () {});
  }
  function pullSettings() {
    if (!apiKey()) return Promise.resolve();
    return apiGet({ action: 'settings-get' }).then(function (r) {
      if (!r || !r.ok || !r.settings) return;
      var s = r.settings;
      if (Number(s._ts || 0) <= localTs()) return;        /* 이 기기 값이 더 새로움 */
      if (s.fmt && typeof s.fmt === 'object') {
        var fmt = defaultFmt();
        Object.keys(fmt).forEach(function (k) {
          if (k !== 'types' && s.fmt[k] !== undefined && s.fmt[k] !== null) fmt[k] = s.fmt[k];
        });
        if (s.fmt.types && typeof s.fmt.types === 'object') fmt.types = s.fmt.types;
        state.fmt = fmt;
        saveState();
        try { localStorage.setItem(KV_TS, String(s._ts || 0)); } catch (e) {}
        renderPaper(); renderFmtForm();
        toast('드라이브에 저장해 둔 지면 문구를 불러왔습니다.');
      }
      if (s.notice && window.CertNotice && window.CertNotice.applySettings) {
        window.CertNotice.applySettings(s.notice);
      }
    }).catch(function () {});
  }

  function cloudBoot() {
    if ($('apiKeyState')) $('apiKeyState').textContent = apiKey() ? ('연결됨 (키 ' + apiKey().slice(0, 4) + '…' + apiKey().slice(-4) + ')') : '아직 연결하지 않았습니다';
    if (!apiKey()) { pendingChip(); return; }
    loadNoConfig(); refreshNextNo(); loadNotices();
    if (navigator.onLine && pendingCount()) flushQueue();
    window.addEventListener('online', function () { if (pendingCount()) flushQueue(); });
  }

  /* ------------------------------------------------------------------ 받기 */
  /* 받은 뒤에는 다음 번호로 넘어간다(번호를 직접 고친 경우는 그대로 둠) */
  function advanceNo() {
    if (state.noEdited) return;
    state.no = nextNo(state.date);
    el.no.value = state.no;
    if (!state.inetEdited) { state.inet = makeInet(); el.inet.value = state.inet; }
    saveState();
    renderPaper();
  }

  function doPrint() {
    if (!ensure()) return;
    if (needGuide(doPrint)) return;          /* 앱 안 브라우저는 인쇄 창도 막힌다 */
    if (typeof window.print !== 'function') {
      toast('이 브라우저에서는 인쇄 창을 열 수 없습니다. 크롬에서 열어 주세요.');
      return;
    }
    recordIssue();
    cloudIssue();
    window.print();
    advanceNo();
  }

  /* ------------------------------------------------------------ 파일 만들기
     지면을 그림으로 떠서 PNG·PDF 파일을 직접 만든다.
     인쇄 대화상자를 거치지 않으므로 앱 안 브라우저에서도 파일이 남는다. */
  function exportScale() {
    var w = Math.max(window.innerWidth, window.innerHeight);
    if (window.matchMedia('(min-width:900px)').matches) return 3;
    return w >= 800 ? 2.5 : 2;
  }

  function paperCanvas() {
    if (typeof html2canvas !== 'function') return Promise.reject(new Error('이미지 도구를 불러오지 못했습니다.'));
    document.body.classList.add('exporting');
    return new Promise(function (resolve, reject) {
      setTimeout(function () {
        html2canvas(el.paper, {
          scale: exportScale(), backgroundColor: '#ffffff', useCORS: true, logging: false,
          width: Math.round(A4W), height: Math.round(A4H),
          windowWidth: Math.round(A4W), windowHeight: Math.round(A4H)
        }).then(resolve, reject);
      }, 140);
    });
  }

  function endExport() {
    document.body.classList.remove('exporting');
    fitPreview();
  }

  function dataUrlBytes(url) {
    var b = atob(url.split(',')[1]);
    var arr = new Uint8Array(b.length);
    for (var i = 0; i < b.length; i++) arr[i] = b.charCodeAt(i);
    return arr;
  }

  /* JPEG 한 장을 A4 한 쪽짜리 PDF 파일로 묶는다(다른 라이브러리 없이) */
  function buildPdf(jpeg, imgW, imgH) {
    var enc = new TextEncoder();
    var parts = [], offsets = {}, size = 0, PW = '595.28', PH = '841.89';
    function put(x) {
      var b = (typeof x === 'string') ? enc.encode(x) : x;
      parts.push(b); size += b.length;
    }
    function obj(n, body) { offsets[n] = size; put(n + ' 0 obj\n' + body + '\nendobj\n'); }
    function pad(n) { var s = String(n); while (s.length < 10) s = '0' + s; return s; }

    put('%PDF-1.4\n');
    obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
    obj(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
    obj(3, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + PW + ' ' + PH + '] ' +
            '/Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>');
    offsets[4] = size;
    put('4 0 obj\n<< /Type /XObject /Subtype /Image /Width ' + imgW + ' /Height ' + imgH +
        ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + jpeg.length + ' >>\nstream\n');
    put(jpeg);
    put('\nendstream\nendobj\n');
    var content = 'q ' + PW + ' 0 0 ' + PH + ' 0 0 cm /Im0 Do Q\n';
    obj(5, '<< /Length ' + content.length + ' >>\nstream\n' + content + 'endstream');
    var xref = size;
    var table = 'xref\n0 6\n0000000000 65535 f \n';
    for (var i = 1; i <= 5; i++) table += pad(offsets[i]) + ' 00000 n \n';
    put(table);
    put('trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n');

    var out = new Uint8Array(size), pos = 0;
    parts.forEach(function (b) { out.set(b, pos); pos += b.length; });
    return out;
  }

  function exportName(ext) {
    var who = currentDef().kind === 'church' ? state.representative : state.name;
    return typeText(currentDef()).title.replace(/\s/g, '') + '_' + String(who || '').trim() + '_' + state.date + '.' + ext;
  }

  /* ------------------------------------------------------------ 저장 환경 판별
     카카오톡·네이버·인스타그램·페이스북·라인·틱톡 같은 앱 안 브라우저(WebView)는
     a[download]·window.print()·blob 새 창을 조용히 막는 경우가 많다.
     막히면 아무 일도 일어나지 않으므로, 누르기 전에 먼저 알리고 다른 길을 같이 준다. */
  var APP_URL = 'https://aichurchsystem.github.io/certificate/';

  function envInfo() {
    var ua = navigator.userAgent || '';
    var name = '';
    if (/KAKAOTALK/i.test(ua)) name = '카카오톡';
    else if (/NAVER\(inapp|DaumApps/i.test(ua)) name = '네이버';
    else if (/Instagram/i.test(ua)) name = '인스타그램';
    else if (/FBAN|FBAV|FB_IAB/i.test(ua)) name = '페이스북';
    else if (/Line\//i.test(ua)) name = '라인';
    else if (/TikTok|musical_ly/i.test(ua)) name = '틱톡';
    else if (/Snapchat|Pinterest|Discord|MicroMessenger/i.test(ua)) name = '앱';
    else if (/; ?wv\)|Version\/4\.0 Chrome\/[\d.]+ Mobile Safari/i.test(ua)) name = '앱';
    return {
      inApp: !!name,
      appName: name,
      hasShare: !!(navigator.share && typeof File === 'function'),
      hasPicker: typeof window.showSaveFilePicker === 'function'
    };
  }
  function inAppBrowser() { return envInfo().inApp; }

  /* ---- 앱 안 브라우저 안내(한 화면). 확인을 누르면 하려던 일을 그대로 이어 간다 ---- */
  var pendingAction = null, forceInline = false;

  function needGuide(act) {
    if (forceInline || !inAppBrowser()) return false;
    pendingAction = act || null;
    $('guideAnyway').hidden = !act;
    $('guideNote').textContent = '복사한 주소를 크롬 주소창에 붙여 넣어도 됩니다.';
    $('guideModal').hidden = false;
    syncLock();
    return true;
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (res, rej) {
      try {
        var t = document.createElement('textarea');
        t.value = text; t.style.position = 'fixed'; t.style.top = '-1000px'; t.style.opacity = '0';
        document.body.appendChild(t); t.select();
        var ok = document.execCommand('copy');
        t.remove();
        ok ? res() : rej(new Error('copy'));
      } catch (e) { rej(e); }
    });
  }

  function addGuideHandlers() {
    $('guideClose').addEventListener('click', function () { $('guideModal').hidden = true; syncLock(); });
    $('guideCopy').addEventListener('click', function () {
      copyText(APP_URL).then(function () {
        $('guideNote').textContent = '주소를 복사했습니다. 크롬 주소창에 붙여 넣어 주세요.';
        $('guideCopy').textContent = '복사됨 ✓';
        setTimeout(function () { $('guideCopy').textContent = '주소 복사'; }, 2600);
      }).catch(function () {
        $('guideNote').textContent = '복사가 막혔습니다. 위 주소를 손가락으로 길게 눌러 직접 복사해 주세요.';
      });
    });
    $('guideAnyway').addEventListener('click', function () {
      forceInline = true;
      $('guideModal').hidden = true;
      var act = pendingAction; pendingAction = null;
      if (act) setTimeout(function () { act(); }, 60); else syncLock();
    });
  }

  var sheet = { blob: null, url: null, name: '', kind: '' };

  function setSaveState(kind, text) {
    var n = $('saveState');
    n.className = 'save-state' + (kind ? ' ' + kind : '');
    n.textContent = text;
  }
  function showSaveAlert(html) {
    var n = $('saveAlert');
    n.innerHTML = html || '';
    n.hidden = !html;
  }
  function saveFailed(why) {
    setSaveState('bad', '저장되지 않았습니다');
    showSaveAlert('<b>' + why + '</b><small>아래 ‘공유해서 저장’이나 ‘새 창에서 열기’를 써 보세요. 그래도 안 되면 크롬에서 열어야 합니다.</small>');
    $('saveHint').innerHTML = '‘공유해서 저장’은 카카오톡·드라이브·메일로 보내 파일을 남기는 길입니다. ‘새 창에서 열기’는 크롬 PDF 화면에서 내려받는 길입니다.';
  }

  function openSheet(o) {
    if (sheet.url) { try { URL.revokeObjectURL(sheet.url); } catch (e) {} }
    sheet = { blob: o.blob || null, url: o.url || '', name: o.name || '', kind: o.kind || '' };
    $('saveTitle').textContent = o.title;
    $('saveMsg').textContent = o.msg;

    var prev = $('savePrev');
    prev.innerHTML = '';
    prev.hidden = !o.preview;
    if (o.preview) {
      var img = document.createElement('img');
      img.src = o.url; img.alt = '저장할 지면 미리보기'; img.title = '눌러서 크게 보기';
      img.addEventListener('click', function () { openImageView(o.url, o.name); });
      prev.appendChild(img);
    }
    $('saveFile').hidden = !o.file;
    if (o.file) $('saveFileName').textContent = o.name;
    $('saveFile').querySelector('small').textContent = o.fileNote || 'A4 한 장';

    $('saveNameOut').textContent = o.name || '—';
    $('saveNameRow').hidden = !!o.file;      /* PDF는 위 파일 카드가 이름을 보여 준다 */
    setSaveState('', '아직 저장되지 않았습니다');
    $('saveCheck').hidden = true;

    var env = envInfo();
    if (env.inApp) {
      showSaveAlert('<b>이 브라우저에서는 저장이 막혀 있습니다.</b><small>' + (env.appName || '앱') +
        ' 안의 브라우저입니다. 크롬에서 열어야 파일이 저장됩니다.</small>');
    } else {
      showSaveAlert('');
    }

    var share = $('saveShare');
    share.hidden = !(o.blob && canShareFile(o.name));
    share.onclick = function () { shareFile(o.name); };

    $('savePrint').hidden = !o.print;
    $('saveHint').innerHTML = o.hint || '';
    $('saveGuideOpen').hidden = false;          /* 크롬에서 여는 방법은 언제나 볼 수 있게 */
    el.toast.hidden = true;            /* 시트 위에 알림이 겹치지 않게 */
    $('saveModal').hidden = false;
    syncLock();
  }

  function closeSheet() {
    $('saveModal').hidden = true;
    syncLock();
  }

  /* 저장: 실제로 파일이 남았는지까지 확인한다.
     ① 파일 저장 창을 쓸 수 있는 브라우저면 저장 경로를 받아 ‘저장 완료’를 확인한다.
     ② 아니면 내려받기를 시작하고, 사용자에게 다운로드 폴더를 확인받는다.
     ③ 막힌 환경이면 저장을 시작하지 않고 이유를 빨간 글씨로 적는다. */
  function saveNow() {
    if (!sheet.blob) { saveFailed('만든 파일이 없습니다.'); return; }
    var env = envInfo();
    if (env.inApp) { saveFailed('앱 안 브라우저라 저장이 막혀 있습니다.'); return; }

    if (env.hasPicker) {
      var types = sheet.kind === 'pdf'
        ? [{ description: 'PDF 문서', accept: { 'application/pdf': ['.pdf'] } }]
        : [{ description: 'PNG 그림', accept: { 'image/png': ['.png'] } }];
      try {
        window.showSaveFilePicker({ suggestedName: sheet.name, types: types }).then(function (h) {
          return h.createWritable().then(function (w) {
            return w.write(sheet.blob).then(function () { return w.close(); });
          });
        }).then(function () {
          setSaveState('ok', '저장 완료');
          showSaveAlert('');
          $('saveCheck').hidden = true;
        }).catch(function (e) {
          if (e && e.name === 'AbortError') { setSaveState('', '저장을 취소했습니다'); return; }
          tryDirectDownload();
        });
      } catch (e) { tryDirectDownload(); }
      return;
    }
    tryDirectDownload();
  }

  function tryDirectDownload() {
    try {
      downloadBlob(sheet.blob, sheet.name);
      setSaveState('pending', '다운로드를 시작했습니다');
      showSaveAlert('');
      $('saveCheck').hidden = false;
      $('saveHint').innerHTML = '화면 위쪽에 <b>다운로드</b> 표시가 떠야 정상입니다. 잠시 기다려도 아무 표시가 없으면 <b>없어요</b>를 눌러 주세요.';
    } catch (e) {
      saveFailed('저장을 시작하지 못했습니다.');
    }
  }

  function openInNewWindow() {
    if (!sheet.url) { saveFailed('새 창에서 열 파일이 없습니다.'); return; }
    if (sheet.kind === 'png') { openImageView(sheet.url, sheet.name); return; }
    var w = null;
    try { w = window.open(sheet.url, '_blank'); } catch (e) { w = null; }
    if (!w) { saveFailed('새 창이 막혀 있습니다.'); return; }
    setSaveState('pending', '새 창에서 열었습니다');
    showSaveAlert('');
    $('saveHint').innerHTML = '새 창이 크롬 PDF 보기로 열리면 <b>오른쪽 위 내려받기(↓)</b>를 누르세요. 그래야 다운로드 폴더에 저장됩니다.';
  }

  function addSheetHandlers() {
    $('saveClose').addEventListener('click', closeSheet);
    $('saveDl').addEventListener('click', saveNow);
    $('saveNew').addEventListener('click', openInNewWindow);
    $('saveShare').addEventListener('click', function () { shareFile(sheet.name); });
    $('saveGuideOpen').addEventListener('click', function () { needGuide(null); });
    $('saveYes').addEventListener('click', function () {
      $('saveCheck').hidden = true;
      setSaveState('ok', '저장 완료 · 다운로드 폴더');
      showSaveAlert('');
    });
    $('saveNo').addEventListener('click', function () {
      $('saveCheck').hidden = true;
      saveFailed('다운로드 폴더에 파일이 없습니다.');
    });
    $('savePrint').addEventListener('click', function () { closeSheet(); doPrint(); });
  }

  function canShareFile(name) {
    if (!navigator.canShare || typeof File !== 'function' || !sheet.blob) return false;
    try { return navigator.canShare({ files: [new File([sheet.blob], name, { type: sheet.blob.type })] }); }
    catch (e) { return false; }
  }

  /* 공유 시트로 파일 자체를 넘긴다(카톡 나에게 보내기·드라이브·메일 → 그곳에서 저장) */
  function shareFile(name) {
    if (!sheet.blob) { saveFailed('공유할 파일이 없습니다.'); return; }
    if (!navigator.share) { saveFailed('이 브라우저는 공유를 지원하지 않습니다.'); return; }
    var file;
    try { file = new File([sheet.blob], name, { type: sheet.blob.type }); }
    catch (e) { saveFailed('공유할 파일을 만들지 못했습니다.'); return; }
    var data = { files: [file], title: name };
    if (navigator.canShare && !navigator.canShare(data)) {
      saveFailed('이 브라우저는 파일 공유를 막고 있습니다.');
      return;
    }
    navigator.share(data).then(function () {
      setSaveState('ok', '공유 창으로 넘겼습니다');
      showSaveAlert('');
      $('saveHint').innerHTML = '카카오톡 ‘나에게 보내기’·드라이브·메일로 보내면 그곳에 파일이 남습니다.';
    }).catch(function (err) {
      if (err && err.name === 'AbortError') { setSaveState('', '공유를 취소했습니다'); return; }
      saveFailed('공유도 막혀 있습니다.');
    });
  }

  /* 그림을 화면에 꽉 차게 띄우고 ‘길게 눌러 저장’하게 한다 */
  function openImageView(url, name) {
    if (!url) return;
    var body = $('imgViewBody');
    body.innerHTML = '';
    var img = document.createElement('img');
    img.src = url; img.alt = name || '증명서 그림';
    body.appendChild(img);
    $('imgView').hidden = false;
    body.scrollTop = 0;
    syncLock();
  }
  function closeImageView() {
    $('imgView').hidden = true;
    $('imgViewBody').innerHTML = '';
    syncLock();
  }

  function doPng() {
    if (!ensure()) return;
    if (needGuide(doPng)) return;
    if (typeof html2canvas !== 'function') { toast('이미지 저장 도구를 불러오지 못했습니다.'); return; }
    var btn = $('btnPng');
    btn.disabled = true;
    toast('이미지를 만드는 중…');
    paperCanvas().then(function (canvas) {
      canvas.toBlob(function (blob) {
        btn.disabled = false;
        endExport();
        if (!blob || blob.size < 8000) {
          toast('이미지를 만들지 못했습니다. 잠시 뒤 다시 눌러 주세요.');
          return;
        }
        var url = URL.createObjectURL(blob);
        openSheet({
          title: '이미지 저장',
          msg: '지면을 그림(PNG)으로 만들었습니다.',
          blob: blob, url: url, name: exportName('png'), preview: true, kind: 'png',
          hint: '<b>저장</b>을 누르면 휴대폰의 <b>다운로드</b> 폴더에 들어갑니다. 아무 일도 없으면 <b>위 그림을 눌러 크게 띄운 뒤 손가락으로 길게 눌러</b> ‘이미지 저장’을 고르세요.'
        });
        recordIssue();
        cloudIssue();
        advanceNo();
      }, 'image/png');
    }).catch(function (e) {
      console.error(e);
      btn.disabled = false;
      endExport();
      toast('이미지를 만들지 못했습니다. [인쇄]에서 PDF로 받아 주세요.');
    });
  }

  function doPdf() {
    if (!ensure()) return;
    if (needGuide(doPdf)) return;
    if (typeof html2canvas !== 'function') { toast('PDF 저장 도구를 불러오지 못했습니다.'); return; }
    var btn = $('btnPdf');
    btn.disabled = true;
    toast('PDF를 만드는 중…');
    paperCanvas().then(function (canvas) {
      var jpeg = dataUrlBytes(canvas.toDataURL('image/jpeg', 0.92));
      var bytes = buildPdf(jpeg, canvas.width, canvas.height);
      var blob = new Blob([bytes], { type: 'application/pdf' });
      btn.disabled = false;
      endExport();
      if (!blob.size) { toast('PDF를 만들지 못했습니다. 잠시 뒤 다시 눌러 주세요.'); return; }
      var url = URL.createObjectURL(blob);
      openSheet({
        title: 'PDF 저장',
        msg: 'A4 한 장짜리 PDF 파일을 만들었습니다.',
        blob: blob, url: url, name: exportName('pdf'), file: true, kind: 'pdf',
        fileNote: 'A4 한 장 · ' + Math.round(blob.size / 1024) + 'KB',
        print: true,
        warn: inAppBrowser() ? '앱 안의 브라우저에서 열려 있어 파일 내려받기가 막힐 수 있습니다. 오른쪽 위 ⋮ → ‘다른 브라우저로 열기’로 크롬에서 열면 확실합니다.' : '',
        hint: '<b>저장</b>을 누르면 휴대폰의 <b>다운로드</b> 폴더에 들어갑니다. 안 되면 <b>새 창에서 열기</b>로 크롬 PDF 화면을 띄운 뒤 <b>오른쪽 위 내려받기</b>를 누르세요.'
      });
      recordIssue();
      cloudIssue();
      advanceNo();
    }).catch(function (e) {
      console.error(e);
      btn.disabled = false;
      endExport();
      toast('PDF를 만들지 못했습니다. [인쇄]를 눌러 ‘PDF로 저장’을 골라 주세요.');
    });
  }

  /* ------------------------------------------------------------------ 화면 */
  var VIEWS = ['cover', 'issue', 'notice', 'notice-admin', 'history', 'format'];

  var navPushed = false;
  function switchView(name, fromHistory) {
    Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (b) {
      b.classList.toggle('on', b.dataset.view === name);
    });
    VIEWS.forEach(function (v) {
      var s = $('view-' + v);
      if (s) s.hidden = (v !== name);
    });
    document.body.classList.toggle('cover-mode', name === 'cover');
    document.body.classList.toggle('notice-mode', name === 'notice' || name === 'notice-admin');
    if (el.actionBar) el.actionBar.style.display = name === 'issue' ? '' : 'none';
    if (name === 'format') { renderFmtForm(); renderPeopleList(); renderSealSlots(); }
    if (name === 'issue') { renderPaper(); fitPreview(); }
    if (name === 'notice' && window.CertNotice) window.CertNotice.enter();
    if (name === 'notice-admin' && window.CertNotice) window.CertNotice.enterAdmin();
    /* 화면을 옮기면 맨 위로 — 폰에서 스크롤이 남지 않게 */
    try { window.scrollTo(0, 0); } catch (e) {}
    /* 안드로이드 뒤로가기로도 표지까지 나올 수 있게 히스토리를 남긴다 */
    if (!fromHistory) {
      try { history.pushState({ view: name }, '', '#' + name); navPushed = true; } catch (e) {}
    }
  }

  /* 뒤로가기: 앱 안에서 온 화면이면 표지로, 이미 표지면 그대로 둔다(브라우저가 앱을 닫게) */
  window.addEventListener('popstate', function (e) {
    var v = (e && e.state && e.state.view) || 'cover';
    switchView(v, true);
  });

  /* ------------------------------------------------------------------ 설정 파일 */
  function exportSettings() {
    var data = { app: 'certificate', version: 1, exported: new Date().toISOString(), fmt: state.fmt, people: people };
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    downloadBlob(blob, '증명서-설정-' + todayISO() + '.json');
    toast('설정과 명단을 내려받았습니다. (사진은 기기에만 남습니다)');
  }
  function importSettings(file) {
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var data = JSON.parse(reader.result);
        if (data && data.fmt) {
          state.fmt = data.fmt;
          state.fmt.types = state.fmt.types || {};
        }
        if (data && Array.isArray(data.people) && data.people.length) {
          people = data.people;
          savePeople();
          renderPeopleOptions();
          renderPeopleList();
        }
        saveState(); render(); renderFmtForm();
        toast('설정을 가져왔습니다.');
      } catch (e) { toast('파일을 읽지 못했습니다. JSON 파일인지 확인해 주세요.'); }
    };
    reader.readAsText(file);
  }

  /* ------------------------------------------------------------------ 연결 */
  function bind() {
    /* 탭 */
    Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (b) {
      b.addEventListener('click', function () { switchView(b.dataset.view); });
    });

    /* 표지 */
    if ($('cvGo')) $('cvGo').addEventListener('click', function () { switchView('issue'); });
    if ($('cvNotice')) $('cvNotice').addEventListener('click', function () { switchView('notice'); });
    if ($('cvPeople')) $('cvPeople').addEventListener('click', function () {
      switchView('format');
      var card = $('peopleCard');
      if (card && card.scrollIntoView) card.scrollIntoView({ block: 'start' });
    });
    if ($('coverBtn')) $('coverBtn').addEventListener('click', function () { switchView('cover'); });
    /* 상단 막대(교단명·노회 문서)와 ⌂ 홈 — 어느 화면에서나 표지로 */
    var goHome = function () { switchView('cover'); };
    if ($('brandHome')) {
      $('brandHome').addEventListener('click', goHome);
      $('brandHome').addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goHome(); }
      });
    }
    if ($('homeBtn')) $('homeBtn').addEventListener('click', goHome);

    /* 지면의 글자를 누르면 관리자의 그 입력칸으로 — 드래그(선택)일 때는 옮기지 않는다 */
    if (el.paper) {
      el.paper.addEventListener('click', function (e) {
        var sel = window.getSelection ? String(window.getSelection()) : '';
        if (sel) return;
        var t = e.target;
        while (t && t !== el.paper && !(t.getAttribute && t.getAttribute('data-cf'))) t = t.parentNode;
        if (!t || !t.getAttribute) return;
        var key = t.getAttribute('data-cf');
        if (!key) return;
        var MAP = {
          org: 'fmOrg', presbytery: 'fmPresb', presbyteryAddress: 'fmNohoeAddr', tel: 'fmTel',
          fax: 'fmFax', postalCode: 'fmPostal', note1: 'fmNote1', note2: 'fmNote2',
          slogan: 'fmSlogan', logoSize: 'fmLogoSize', chairName: 'fmChairName', signerName: 'fmSigner',
          chairTitle: 'fmChairTitle', signerTitle: 'fmSignTitle', typeTitle: 'fmTitle', typeBody: 'fmBody'
        };
        var box = $(MAP[key] || '');
        if (!box) return;
        switchView('format');
        if (box.scrollIntoView) box.scrollIntoView({ block: 'center', behavior: 'smooth' });
        box.focus();
        try { var p2 = box.value.length; box.setSelectionRange(p2, p2); } catch (ex) {}
      });
    }

    /* 발급 폼 */
    el.type.addEventListener('change', function () {
      state.typeId = el.type.value;
      fillPersonName();
      if (!state.noEdited) state.no = nextNo(state.date);
      if (!state.inetEdited) state.inet = makeInet();
      saveState(); render(); fitPreview();
    });

    el.person.addEventListener('change', function () {
      var p = personById(el.person.value);
      if (!p) { state.personId = ''; saveState(); render(); return; }
      applyPerson(p);
      if (el.nameHint) {
        el.nameHint.textContent = p.name + ' 님의 정보를 불러왔습니다.';
        el.nameHint.classList.add('on');
      }
    });

    el.name.addEventListener('input', function () {
      var def = currentDef();
      var v = el.name.value;
      if (def.kind === 'church') state.representative = v; else state.name = v;
      var hit = personByName(v);
      if (hit && hit.id !== state.personId) {
        applyPerson(hit, true);
        el.nameHint.textContent = hit.name + ' 님의 정보를 불러왔습니다.';
        el.nameHint.classList.add('on');
        return;
      }
      if (!hit && people.length && el.nameHint) {
        // 명단에 없는 이름이면 사진·연결을 끊어 다른 사람 사진이 찍히지 않게 한다
        if (String(v || '').trim()) state.personId = '';
        el.nameHint.textContent = '명단에 있는 이름을 고르면 직분·생년월일·교회·주소가 저절로 채워집니다.';
        el.nameHint.classList.remove('on');
      }
      if (!state.noEdited) state.no = nextNo(state.date);
      if (!state.inetEdited) state.inet = makeInet();
      saveState(); render();
    });

    el.position.addEventListener('input', function () {
      state.position = el.position.value;
      if (!state.personId) {
        var p = personByPosition(el.position.value);
        if (p && !String(state.name || '').trim()) {
          applyPerson(p);
          el.nameHint.textContent = p.name + ' 님의 정보를 불러왔습니다.';
          el.nameHint.classList.add('on');
          return;
        }
      }
      saveState(); renderPaper();
    });

    el.birth.addEventListener('change', function () { state.birth = el.birth.value; saveState(); render(); });
    el.church.addEventListener('input', function () { state.church = el.church.value; saveState(); renderPaper(); });
    el.churchAddr.addEventListener('input', function () { state.churchAddress = el.churchAddr.value; saveState(); renderPaper(); });
    el.addr.addEventListener('input', function () { state.address = el.addr.value; saveState(); renderPaper(); });
    el.sender.addEventListener('input', function () { state.sender = el.sender.value; saveState(); renderPaper(); });
    el.recipient.addEventListener('input', function () { state.recipient = el.recipient.value; saveState(); renderPaper(); });
    el.date.addEventListener('change', function () {
      state.date = el.date.value || todayISO();
      if (!state.noEdited) state.no = nextNo(state.date);
      saveState(); render();
    });
    el.no.addEventListener('input', function () { state.no = el.no.value; state.noEdited = true; saveState(); renderPaper(); });
    el.inet.addEventListener('input', function () { state.inet = el.inet.value; state.inetEdited = true; saveState(); renderPaper(); });

    /* 직인 */
    Array.prototype.forEach.call(document.querySelectorAll('input[name="sealOnOff"]'), function (r) {
      r.addEventListener('change', function () {
        if (!r.checked) return;
        state.sealsOn = r.value === 'on';
        saveState(); applySeal();
      });
    });
    function sealClick(e, inputId) {
      var pick = e.target.closest('[data-pick]');
      if (pick) { pendingSealKey = pick.dataset.pick; pendingSealInput = inputId; $(inputId).click(); return; }
      var drop = e.target.closest('[data-drop]');
      if (drop) {
        var key = drop.dataset.drop;
        var meta = SEALS.filter(function (s) { return s.key === key; })[0];
        if (!confirm((meta ? meta.name : '직인') + '을(를) 기본 직인으로 되돌릴까요?')) return;
        setSeal(key, null);
        renderSealSlots(); applySeal();
        toast('기본 직인으로 되돌렸습니다.');
      }
    }
    if (el.sealSlots) el.sealSlots.addEventListener('click', function (e) { sealClick(e, 'sealFile'); });
    if (el.sealSlotsAdmin) el.sealSlotsAdmin.addEventListener('click', function (e) { sealClick(e, 'sealFileAdmin'); });
    ['sealFile', 'sealFileAdmin'].forEach(function (id) {
      var inp = $(id);
      if (!inp) return;
      inp.addEventListener('change', function () {
        saveSealFromFile(pendingSealKey || 'secretary', this.files && this.files[0]);
        this.value = '';
      });
    });

    /* 관리자: 서명부 직인 배치(1안·2안) */
    Array.prototype.forEach.call(document.querySelectorAll('input[name="signSeal"]'), function (r) {
      r.addEventListener('change', function () {
        if (!r.checked) return;
        state.fmt.signSeal = r.value;
        saveState(); renderPaper();
      });
    });

    /* 사진 압인(철인) — 켜기/끄기 · 크기 · 위치 · 강도 */
    Array.prototype.forEach.call(document.querySelectorAll('input[name="stOn"]'), function (r) {
      r.addEventListener('change', function () {
        if (!r.checked) return;
        state.fmt.photoStamp = (r.value === 'off' ? 'off' : 'on');
        saveState(); renderPaper();
      });
    });
    Array.prototype.forEach.call(document.querySelectorAll('input[name="stSize"]'), function (r) {
      r.addEventListener('change', function () {
        if (!r.checked) return;
        state.fmt.photoStampSize = r.value;
        saveState(); renderPaper();
      });
    });
    Array.prototype.forEach.call(document.querySelectorAll('input[name="stCorner"]'), function (r) {
      r.addEventListener('change', function () {
        if (!r.checked) return;
        state.fmt.photoStampCorner = r.value;
        saveState(); renderPaper();
      });
    });
    Array.prototype.forEach.call(document.querySelectorAll('input[name="stTone"]'), function (r) {
      r.addEventListener('change', function () {
        if (!r.checked) return;
        state.fmt.photoStampTone = r.value;
        saveState(); renderPaper();
      });
    });

    Array.prototype.forEach.call(document.querySelectorAll('input[name="wmChoice"]'), function (r) {
      r.addEventListener('change', function () {
        if (!r.checked) return;
        state.fmt.watermark = r.value;
        saveState(); renderPaper();
      });
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-fmt]'), function (inp) {
      inp.addEventListener('change', function () {
        var key2 = inp.dataset.fmt;
        state.fmt[key2] = inp.value;
        saveState(); renderPaper();
      });
      inp.addEventListener('input', function () {
        var key = inp.dataset.fmt;
        state.fmt[key] = inp.value;
        if (key === 'noPrefix' && !state.noEdited) state.no = nextNo(state.date);
        saveState(); renderPaper();
        if (key === 'signerTitle' || key === 'signerName' || key === 'chairTitle' || key === 'chairName') {
          /* 종류별로 저장해 둔 예전 성명·직함이 있으면 함께 맞춘다(지면에 묻히지 않게) */
          Object.keys(state.fmt.types || {}).forEach(function (id) {
            var o = state.fmt.types[id];
            if (!o) return;
            if (key === 'signerName' && o.signerName !== undefined) o.signerName = state.fmt.signerName;
            if (key === 'signerTitle' && o.signTitle !== undefined) o.signTitle = state.fmt.signerTitle;
          });
          saveState(); renderPaper(); renderFmtForm();
        }
        if (key === 'noPrefix') el.no.value = state.no;
      });
    });

    $('fmType').addEventListener('change', function () {
      state.typeId = $('fmType').value;
      if (!state.noEdited) state.no = nextNo(state.date);
      saveState(); render(); renderFmtForm();
    });

    $('fmTitle').addEventListener('input', function () {
      typeOverride($('fmType').value, true).title = this.value;
      saveState(); renderPaper();
    });
    $('fmBody').addEventListener('input', function () {
      var lines = this.value.split('\n');
      if (lines.length && lines[lines.length - 1] === '') lines.pop();
      typeOverride($('fmType').value, true).body = lines;
      saveState(); renderPaper();
    });
    $('fmTSignTitle').addEventListener('input', function () {
      typeOverride($('fmType').value, true).signTitle = this.value;
      saveState(); renderPaper();
    });
    $('fmTSignName').addEventListener('input', function () {
      typeOverride($('fmType').value, true).signerName = this.value;
      saveState(); renderPaper();
    });
    $('fmLabels').addEventListener('input', function (e) {
      var inp = e.target.closest('[data-label-src]');
      if (!inp) return;
      var o = typeOverride($('fmType').value, true);
      o.labels = o.labels || {};
      o.labels[inp.dataset.labelSrc] = inp.value;
      saveState(); renderPaper();
    });

    $('fmtSave').addEventListener('click', function () {
      saveState();
      renderPaper();
      toast('양식을 저장했습니다. 이 기기 브라우저에 남습니다.');
      pushSettings();
    });
    $('fmtTypeReset').addEventListener('click', function () {
      var id = $('fmType').value;
      if (!confirm('이 종류의 문구를 기본값으로 되돌릴까요?')) return;
      delete state.fmt.types[id];
      saveState(); renderFmtForm(); renderPaper();
      toast('기본 문구로 되돌렸습니다.');
    });
    $('fmtReset').addEventListener('click', function () {
      if (!confirm('양식 글자를 모두 처음 상태로 되돌릴까요?\n(발급 이력·직인·명단은 그대로 남습니다)')) return;
      state.fmt = defaultFmt();
      if (!state.noEdited) state.no = nextNo(state.date);
      saveState(); renderFmtForm(); render(); el.no.value = state.no;
      toast('기본값으로 복원했습니다.');
    });

    /* 관리자: 사람 명단 */
    $('peNew').addEventListener('click', function () {
      editingPersonId = null; newPhotoData = null;
      renderPersonForm(true);
      $('peForm').scrollIntoView({ block: 'center', behavior: 'smooth' });
      $('peName').focus();
    });
    $('peSave').addEventListener('click', savePersonFromForm);
    $('peReset').addEventListener('click', function () {
      if (!confirm('이 기기에 저장한 명단을 지우고 기본 명단으로 돌아갈까요?')) return;
      try { localStorage.removeItem(KEY_PEOPLE); } catch (e) {}
      people = deepCopy(basePeople);
      editingPersonId = null; newPhotoData = null;
      syncPeople(); renderPersonForm(); render();
      toast('기본 명단으로 돌아갔습니다.');
    });

    /* 엑셀 샘플 받기 · 엑셀에서 명단 가져오기 */
    if ($('peSample')) $('peSample').addEventListener('click', function () {
      fetch('data/명단-샘플.xlsx', { cache: 'no-cache' })
        .then(function (r) { if (!r.ok) throw new Error('없음'); return r.blob(); })
        .then(function (b) { downloadBlob(b, '노회원-명단-샘플.xlsx'); toast('샘플 엑셀을 받았습니다. 그 파일에 명단을 채워 다시 올려 주세요.'); })
        .catch(function () { toast('샘플 파일을 받지 못했습니다. 인터넷이 되는 곳에서 다시 눌러 주세요.'); });
    });
    if ($('peImport')) $('peImport').addEventListener('click', function () { $('peImportFile').click(); });
    if ($('peImportFile')) $('peImportFile').addEventListener('change', function () {
      var f = this.files && this.files[0];
      this.value = '';
      if (!f) return;
      var ext = (String(f.name).split('.').pop() || '').toLowerCase();
      toast('엑셀을 읽는 중…');
      var job;
      if (ext === 'csv') job = readAsTextFile(f).then(function (t) { return window.SheetRead.csvRows(t); });
      else if (ext === 'xlsx') job = readAsArrayBuffer(f).then(function (b) { return window.SheetRead.rows(b); });
      else { toast('엑셀(.xlsx)이나 CSV 파일을 골라 주세요. (.xls는 엑셀에서 .xlsx로 저장)'); return; }
      job.then(pePreview).catch(function (e) {
        console.error(e);
        toast((e && e.message) || '엑셀을 읽지 못했습니다.');
      });
    });
    if ($('pePrevSave')) $('pePrevSave').addEventListener('click', peCommit);
    if ($('pePrevCancel')) $('pePrevCancel').addEventListener('click', function () {
      PE_IMP = null;
      $('pePrev').hidden = true;
    });
    $('peList').addEventListener('click', function (e) {
      var ed = e.target.closest('[data-pedit]');
      if (ed) { editingPersonId = ed.dataset.pedit; newPhotoData = null; renderPersonForm(true); $('peForm').scrollIntoView({ block: 'center', behavior: 'smooth' }); return; }
      var del = e.target.closest('[data-pdel]');
      if (del) {
        var id = del.dataset.pdel;
        var p = personById(id);
        if (!p) return;
        if (!confirm('명단에서 ' + p.name + ' 님을 지울까요?')) return;
        people = people.filter(function (x) { return x.id !== id; });
        try { localStorage.removeItem(photoKey(id)); } catch (err) {}
        if (state.personId === id) state.personId = '';
        if (editingPersonId === id) editingPersonId = null;
        syncPeople(); renderPersonForm(); render();
        toast('명단에서 지웠습니다.');
      }
    });
    $('pePhotoBtn').addEventListener('click', function () { $('pePhotoFile').click(); });
    $('pePhotoFile').addEventListener('change', function () {
      var id = editingPersonId || 'tmp';
      savePhotoFromFile(id, this.files && this.files[0]);
      this.value = '';
      if (!editingPersonId) toast('먼저 명단에 저장하면 사진이 그 사람 것으로 남습니다.');
    });
    $('pePhotoDel').addEventListener('click', function () {
      if (!editingPersonId) { newPhotoData = null; $('pePhotoThumb').innerHTML = '없음'; return; }
      if (!confirm('이 사람의 증명사진을 지울까요?')) return;
      setPhoto(editingPersonId, null);
      newPhotoData = null;
      $('pePhotoThumb').innerHTML = '없음';
      renderPaper();
      toast('사진을 지웠습니다.');
    });

    /* 설정 백업 */
    $('expBtn').addEventListener('click', exportSettings);
    $('impBtn').addEventListener('click', function () { $('impFile').click(); });
    $('impFile').addEventListener('change', function () {
      importSettings(this.files && this.files[0]);
      this.value = '';
    });

    $('resetBtn').addEventListener('click', function () {
      if (!confirm('입력한 값을 지우고 처음 상태로 돌아갈까요?\n(발급 이력·양식·명단은 지워지지 않습니다)')) return;
      var keepFmt = state.fmt, keepSeals = state.sealsOn;
      state = blankState();
      state.fmt = keepFmt; state.sealsOn = keepSeals;
      state.no = nextNo(state.date);
      el.nameHint.textContent = '명단에 있는 이름을 고르면 직분·생년월일·교회·주소가 저절로 채워집니다.';
      el.nameHint.classList.remove('on');
      warnForm('');
      saveState(); render(); fitPreview();
      toast('입력을 초기화했습니다.');
    });

    $('btnPrint').addEventListener('click', doPrint);
    $('btnPng').addEventListener('click', doPng);
    $('btnPdf').addEventListener('click', doPdf);
    addSheetHandlers();

    $('zoomBtn').addEventListener('click', openZoom);
    $('zoomClose').addEventListener('click', closeZoom);
    $('zoomIn').addEventListener('click', function () {
      zoomStep = Math.min(zoomStep * 1.25, 2.4); applyZoom();
    });
    $('zoomOut').addEventListener('click', function () {
      zoomStep = Math.max(zoomStep / 1.25, 0.6); applyZoom();
    });
    $('imgViewClose').addEventListener('click', closeImageView);
    addGuideHandlers();

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        if (!$('zoomModal').hidden) closeZoom();
        if (!$('saveModal').hidden) closeSheet();
        $('guideModal').hidden = true;
        closeImageView();
        syncLock();
      }
    });

    var rt = null;
    window.addEventListener('resize', function () {
      clearTimeout(rt);
      rt = setTimeout(function () {
        if (!$('zoomModal').hidden) {
          var body = $('zoomBody');
          var old = zoomBase; zoomBase = Math.max(0.2, body.clientWidth / A4W);
          if (Math.abs(old - zoomBase) > 0.001) applyZoom();
        }
        fitPreview();
      }, 120);
    });
    window.addEventListener('orientationchange', function () { setTimeout(fitPreview, 220); });

    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () { renderPaper(); fitPreview(); });
    }

    var deferred = null;
    window.addEventListener('beforeinstallprompt', function (e) {
      e.preventDefault(); deferred = e;
      $('installBtn').hidden = false;
    });
    $('installBtn').addEventListener('click', function () {
      if (!deferred) return;
      deferred.prompt();
      deferred.userChoice.then(function () { deferred = null; $('installBtn').hidden = true; });
    });
    window.addEventListener('appinstalled', function () { $('installBtn').hidden = true; });

    /* ---------------- 드라이브 연결·발급 이력·번호 설정 */
    if ($('hXlsx')) $('hXlsx').addEventListener('click', downloadXlsx);
    if (el.hSearch) el.hSearch.addEventListener('input', function () { clearTimeout(el.hSearch._t); el.hSearch._t = setTimeout(renderHistory, 320); });
    if (el.hType) el.hType.addEventListener('change', renderHistory);
    if (el.hPeriod) el.hPeriod.addEventListener('change', function () {
      $('hCustom').hidden = el.hPeriod.value !== 'custom';
      if (el.hPeriod.value !== 'custom') renderHistory();
    });
    ['hFrom', 'hTo'].forEach(function (id) {
      if ($(id)) $(id).addEventListener('change', function () { if (el.hPeriod.value === 'custom') renderHistory(); });
    });
    if (el.hList) el.hList.addEventListener('click', function (e) {
      var item = e.target.closest ? e.target.closest('.hitem') : null;
      if (item) openHistoryItem(Number(item.dataset.i));
    });
    if (el.noticeSel) el.noticeSel.addEventListener('change', function () {
      var n = noticeById(this.value);
      state.noticeId = n ? n.id : '';
      if (n) { state.docNo = n.no || ''; state.title = n.title || ''; }
      saveState(); render();
    });
    if ($('fDocNo')) $('fDocNo').addEventListener('input', function () { state.docNo = this.value; saveState(); });
    if ($('fTitle')) $('fTitle').addEventListener('input', function () { state.title = this.value; saveState(); });
    if ($('cfgSave')) $('cfgSave').addEventListener('click', saveNoConfig);
    if ($('apiKeySave')) $('apiKeySave').addEventListener('click', saveApiKey);
    if ($('apiKeyClear')) $('apiKeyClear').addEventListener('click', function () {
      if (!confirm('이 기기에서 드라이브 연결을 해제할까요? 저장된 발급은 드라이브에 그대로 있습니다.')) return;
      setApiKey(''); $('apiKeyState').textContent = '아직 연결하지 않았습니다'; toast('연결을 해제했습니다.');
    });
  }

  /* ------------------------------------------------------------------ 시작 */
  function boot() {
    initState();
    bind();
    renderSealSlots();

    Promise.all([loadTypes(), loadPeople()]).then(function () {
      if (!TYPE_BY_ID[state.typeId]) state.typeId = (TYPES[0] && TYPES[0].id) || 'membership';

      // 앱을 열면 관리자에 들어가지 않아도 기본 사람·교회 정보로 채워 둔다
      var savedPerson = personById(state.personId);
      var mainVal = currentDef().kind === 'church' ? state.representative : state.name;
      if (savedPerson) {
        // 이름은 그대로 두고 명단에 있는 직분·생년월일·교회·주소를 다시 맞춘다
        applyPerson(savedPerson, true);
      } else if (!String(mainVal || '').trim() && people.length) {
        applyPerson(people[0]);
      } else if (people.length) {
        var hit = personByName(state.name) || personByPosition(state.position);
        if (hit) state.personId = hit.id;
      }
      fillPersonName();
      state.no = state.no || nextNo(state.date);
      saveState();
      render();
      // 개척일·설립일처럼 명단에 있는 값을 빈 칸에 채운다
      fillExtrasFromPerson();
      renderHistory();
      cloudBoot();
      renderFmtForm();
      renderPeopleList();
      renderPersonForm();
      fitPreview();
      renderCoverTypes();
      switchView('cover');
      registerSW();
    });
  }

  /* 표지에 적히는 증명서 종류 — 종류 목록(types.json)에서 그대로 만든다 */
  function renderCoverTypes() {
    var box = $('cvTypes');
    if (!box || !TYPES.length) return;
    var shortNames = {
      'employment': '재직', 'membership': '소속', 'church-plant': '개척확인', 'church-found': '설립',
      'assembly-attend': '노회 참석', 'dues': '노회비 납부', 'ordination': '목사 안수'
    };
    var names = TYPES.map(function (t) {
      var n = shortNames[t.id] || String(t.name || '').replace(/\s*(증명서|확인서)$/, '').replace(/^교회\s*/, '');
      return '<i>' + esc(n) + '</i>';
    });
    var half = Math.ceil(names.length / 2);
    box.innerHTML = names.slice(0, half).join('<em>·</em>') + '<br>' + names.slice(half).join('<em>·</em>');
  }

  function fillExtrasFromPerson() {
    var p = personById(state.personId);
    if (!p) return;
    if (p.plantDate && !extraOf('church-plant').plantDate) extraOf('church-plant').plantDate = p.plantDate;
    if (p.foundDate && !extraOf('church-found').foundDate) extraOf('church-found').foundDate = p.foundDate;
    saveState();
    renderForm();
  }

  function registerSW() {
    if (!('serviceWorker' in navigator)) return;
    /* 새 버전이 이 기기를 넘겨받으면 한 번만 새로 고쳐 옛 화면·새 화면이 섞이지 않게 한다 */
    var reloading = false;
    var hadController = !!navigator.serviceWorker.controller;   /* 첫 설치 때는 새로 고치지 않는다 */
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (reloading || !hadController) return;
      try { if (sessionStorage.getItem('cert.reloadedFor') === '1') return; sessionStorage.setItem('cert.reloadedFor', '1'); } catch (e) {}
      reloading = true;
      location.reload();
    });
    try {
      navigator.serviceWorker.register('sw.js').then(function (reg) {
        try { reg.update(); } catch (e) {}
      });
    } catch (e) {}
  }

  /* ============================================================ 다른 파일 연결구
     assets/notice.js(노회 공문)가 이 앱의 함수를 그대로 쓴다. */
  window.CertApp = {
    apiGet: apiGet, apiPost: apiPost, apiKey: apiKey, setApiKey: setApiKey,
    toast: toast, openSheet: openSheet, downloadBlob: downloadBlob,
    buildPdf: buildPdf, dataUrlBytes: dataUrlBytes,
    needGuide: needGuide, inAppBrowser: inAppBrowser,
    switchView: switchView, esc: esc, todayISO: todayISO, fmtDateWide: fmtDateWide,
    loadNotices: loadNotices, A4W: A4W, A4H: A4H,
    pushSettings: pushSettings, pullSettings: pullSettings
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
