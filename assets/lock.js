/* ==========================================================================
   앱 잠금 — 폰을 잠깐 남이 만졌을 때 문서·명단을 막는 기기 잠금.
   - 비밀번호는 평문으로 저장하지 않는다(SHA-256 + 기기별 salt, Web Crypto).
   - 저장 위치는 이 기기 브라우저(localStorage)만. 저장소·드라이브 시트에는 넣지 않는다.
   - 서버 보안이 아니라 기기 앞에서의 잠금이다(인수인계 문서에 한 줄로 적어 둠).
   ========================================================================== */
(function () {
  'use strict';

  var KEY = 'cert.lock.v1';
  var KEY_UNLOCKED = 'cert.unlocked.ts';
  var MIN = 10 * 60 * 1000;          /* 한 번 풀면 10분 */
  var DEFAULT_PW = '0000';

  var $ = function (id) { return document.getElementById(id); };

  function loadLock() {
    try { var v = JSON.parse(localStorage.getItem(KEY) || 'null'); return v && typeof v === 'object' ? v : null; }
    catch (e) { return null; }
  }
  function saveLock(o) { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) {} }

  function rand(n) {
    var s = '', c = 'abcdefghijklmnopqrstuvwxyz0123456789';
    var buf = new Uint8Array(n);
    (window.crypto || {}).getRandomValues ? window.crypto.getRandomValues(buf) : null;
    for (var i = 0; i < n; i++) s += c.charAt((buf[i] || Math.floor(Math.random() * 256)) % c.length);
    return s;
  }

  function hash(pass, salt) {
    var data = new TextEncoder().encode(String(salt) + '|' + String(pass));
    if (!(window.crypto && window.crypto.subtle)) return Promise.resolve('plain:' + String(salt) + '|' + String(pass));
    return window.crypto.subtle.digest('SHA-256', data).then(function (buf) {
      var b = new Uint8Array(buf), out = '', i;
      for (i = 0; i < b.length; i++) out += ('0' + b[i].toString(16)).slice(-2);
      return out;
    });
  }

  function unlockedRecently() {
    try {
      var t = Number(localStorage.getItem(KEY_UNLOCKED) || 0);
      return t && (Date.now() - t) < MIN;
    } catch (e) { return false; }
  }
  function markUnlocked() { try { localStorage.setItem(KEY_UNLOCKED, String(Date.now())); } catch (e) {} }
  function clearUnlocked() { try { localStorage.removeItem(KEY_UNLOCKED); } catch (e) {} }

  var cfg = loadLock();
  var tries = 0, waitUntil = 0;

  function ensureDefault() {
    if (cfg) return;
    /* 첫 실행: 켜짐 + 0000 */
    var salt = rand(16);
    cfg = { on: true, salt: salt, hash: '', since: Date.now(), first: true };
    hash(DEFAULT_PW, salt).then(function (h) {
      cfg.hash = h;
      cfg.ready = true;
      saveLock(cfg);
    });
    saveLock(cfg);
  }

  function show(mode) {
    var m = $('lockModal');
    if (!m) return;
    m.hidden = false;
    document.documentElement.classList.add('ntlock');
    document.body.classList.add('ntlock');
    var box = $('lockAdminBox');
    if (box) box.hidden = (mode !== 'admin');
    var t = $('lockTitle');
    if (t) t.textContent = mode === 'admin' ? '앱 잠금 설정' : '비밀번호를 입력해 주세요';
    setTimeout(function () { if ($('lockPass')) $('lockPass').focus(); }, 80);
  }
  function hide() {
    var m = $('lockModal');
    if (!m) return;
    m.hidden = true;
    document.documentElement.classList.remove('ntlock');
    document.body.classList.remove('ntlock');
    if ($('lockPass')) $('lockPass').value = '';
    if ($('lockErr')) $('lockErr').textContent = '';
  }

  function err(msg, bad) {
    var e = $('lockErr');
    if (!e) return;
    e.textContent = msg || '';
    e.className = 'lock-err' + (bad ? ' bad' : '');
  }

  function tryUnlock(pass) {
    if (Date.now() < waitUntil) {
      err('잠시 뒤에 다시 시도해 주세요. (' + Math.ceil((waitUntil - Date.now()) / 1000) + '초)', true);
      return Promise.resolve(false);
    }
    return hash(pass, cfg.salt).then(function (h) {
      if (h === cfg.hash) {
        tries = 0;
        markUnlocked();
        hide();
        if (cfg.first) {
          cfg.first = false; saveLock(cfg);
          setTimeout(function () {
            if (window.CertApp && window.CertApp.toast) {
              window.CertApp.toast('기본 비밀번호 0000입니다. 관리자 › 앱 잠금에서 꼭 바꿔 주세요.');
            }
          }, 400);
        }
        return true;
      }
      tries++;
      if (tries >= 5) {
        waitUntil = Date.now() + 30000;
        err('5번 틀렸습니다. 30초 뒤에 다시 시도해 주세요.', true);
      } else {
        err('비밀번호가 맞지 않습니다. (' + tries + '/3회)', true);
      }
      return false;
    });
  }

  function bind() {
    if (!$('lockModal')) return;
    if ($('lockGo')) $('lockGo').addEventListener('click', function () {
      tryUnlock($('lockPass').value);
    });
    if ($('lockPass')) $('lockPass').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); tryUnlock(this.value); }
    });

    /* 관리자 › 앱 잠금: 켜기/끄기 · 비밀번호 바꾸기(현재 비번 확인) */
    document.querySelectorAll('input[name="lockOn"]').forEach(function (r) {
      r.addEventListener('change', function () {
        if (!r.checked) return;
        cfg.on = (r.value === 'on');
        saveLock(cfg);
        if (window.CertApp && window.CertApp.toast) {
          window.CertApp.toast(cfg.on ? '앱 잠금을 켰습니다.' : '앱 잠금을 껐습니다.');
        }
        if (!cfg.on) clearUnlocked();
      });
    });
    if ($('lockSave')) $('lockSave').addEventListener('click', function () {
      var cur = String($('lockCur') ? $('lockCur').value : '');
      var p1 = String($('lockNew') ? $('lockNew').value : '');
      var p2 = String($('lockNew2') ? $('lockNew2').value : '');
      if (p1.length < 4 || p1.length > 12) { alert('비밀번호는 4~12자로 정해 주세요.'); return; }
      if (p1 !== p2) { alert('두 번 입력한 비밀번호가 다릅니다.'); return; }
      hash(cur, cfg.salt).then(function (h) {
        if (h !== cfg.hash) { alert('지금 비밀번호가 맞지 않습니다.'); return; }
        var salt = rand(16);
        return hash(p1, salt).then(function (nh) {
          cfg.salt = salt; cfg.hash = nh; cfg.on = true; cfg.ready = true;
          saveLock(cfg);
          clearUnlocked();
          if ($('lockCur')) $('lockCur').value = '';
          if ($('lockNew')) $('lockNew').value = '';
          if ($('lockNew2')) $('lockNew2').value = '';
          if (window.CertApp && window.CertApp.toast) window.CertApp.toast('비밀번호를 바꿨습니다. 다음에 열 때 새 비밀번호를 씁니다.');
        });
      });
    });
    if ($('lockForget2')) $('lockForget2').addEventListener('click', function () {
      if ($('lockForget')) $('lockForget').click();
    });
    if ($('lockForget')) $('lockForget').addEventListener('click', function () {
      alert('비밀번호를 잊으셨나요?\n\n1) 관리자 › 설정 내보내기로 받아 둔 JSON 파일이 있으면, 앱을 지웠다 다시 열어 그 파일을 불러오면 됩니다.\n2) 드라이브 연결 키를 아는 분은 관리자 화면에서 초기화할 수 있습니다.\n3) 그래도 안 되면 브라우저에서 이 사이트의 데이터를 지우면 잠금이 풀립니다(명단·서식도 함께 지워지니 설정 내보내기 파일을 먼저 챙기세요).');
    });
  }

  function boot() {
    ensureDefault();
    bind();
    Array.prototype.forEach.call(document.querySelectorAll('input[name="lockOn"]'), function (r) {
      r.checked = (r.value === ((cfg && cfg.on === false) ? 'off' : 'on'));
    });
    var need = !cfg || cfg.on !== false;
    if (need) {
      if (unlockedRecently() && cfg.ready) hide();
      else show('lock');
    } else hide();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.CertLock = {
    locked: function () { return !!(cfg && cfg.on !== false) && !unlockedRecently(); },
    lockNow: function () { clearUnlocked(); show('lock'); }
  };
})();
