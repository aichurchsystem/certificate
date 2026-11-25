/* ==========================================================================
   앱 잠금 — 폰을 잠깐 남이 만졌을 때 문서·명단을 막는 기기 잠금.
   - 표지(첫 화면)는 그대로 열리고, '증명서 발급·노회 공문 발급·관리자'로 들어갈 때 숫자 4자리를 묻는다.
   - 한 번 풀면 10분 유지, 앱을 닫았다 열면 다시 잠긴다.
   - 비밀번호는 평문으로 저장하지 않는다(SHA-256 + 기기별 salt, Web Crypto).
   - 저장 위치는 이 기기 브라우저(localStorage)만. 저장소·드라이브 시트에는 넣지 않는다.
   ========================================================================== */
(function () {
  'use strict';

  var KEY = 'cert.lock.v1';
  var KEY_UNLOCKED = 'cert.unlocked.ts';
  var MIN = 10 * 60 * 1000;
  var DEFAULT_PW = '0000';

  var $ = function (id) { return document.getElementById(id); };
  var cfg = null, tries = 0, waitUntil = 0, pending = null;

  function loadLock() {
    try { var v = JSON.parse(localStorage.getItem(KEY) || 'null'); return v && typeof v === 'object' ? v : null; }
    catch (e) { return null; }
  }
  function saveLock(o) { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) {} }
  function loadJSON(k, fb) { try { var v = JSON.parse(localStorage.getItem(k) || 'null'); return v === null ? fb : v; } catch (e) { return fb; } }

  function rand(n) {
    var s = '', c = 'abcdefghijklmnopqrstuvwxyz0123456789', i;
    var buf = new Uint8Array(n);
    if (window.crypto && window.crypto.getRandomValues) window.crypto.getRandomValues(buf);
    for (i = 0; i < n; i++) s += c.charAt((buf[i] || Math.floor(Math.random() * 256)) % c.length);
    return s;
  }

  function hash(pass, salt) {
    var data = new TextEncoder().encode(String(salt) + '|' + String(pass));
    if (!(window.crypto && window.crypto.subtle)) {
      return Promise.resolve('plain:' + String(salt) + '|' + String(pass));
    }
    return window.crypto.subtle.digest('SHA-256', data).then(function (buf) {
      var b = new Uint8Array(buf), out = '', i;
      for (i = 0; i < b.length; i++) out += ('0' + b[i].toString(16)).slice(-2);
      return out;
    });
  }

  function unlockedRecently() {
    var t = Number(loadJSON(KEY_UNLOCKED, 0)) || 0;
    return !!t && (Date.now() - t) < MIN;
  }
  function markUnlocked() { try { localStorage.setItem(KEY_UNLOCKED, String(Date.now())); } catch (e) {} }
  function clearUnlocked() { try { localStorage.removeItem(KEY_UNLOCKED); } catch (e) {} }

  function ensureDefault() {
    cfg = loadLock();
    if (cfg && cfg.hash) return;
    var salt = rand(16);
    cfg = { on: true, salt: salt, hash: '', first: true, since: Date.now() };
    saveLock(cfg);
    hash(DEFAULT_PW, salt).then(function (h) { cfg.hash = h; saveLock(cfg); });
  }

  function err(msg, bad) {
    var e = $('lockErr');
    if (!e) return;
    e.textContent = msg || '';
    e.className = 'lock-err' + (bad ? ' bad' : '');
  }
  function dots(n) {
    var box = $('lockDots');
    if (!box) return;
    Array.prototype.forEach.call(box.children, function (d, i) {
      d.className = i < n ? 'on' : '';
    });
  }

  function show(cb) {
    pending = cb || null;
    var m = $('lockModal');
    if (!m) { if (pending) pending(); return; }
    m.hidden = false;
    document.documentElement.classList.add('ntlock');
    document.body.classList.add('ntlock');
    if ($('lockPass')) $('lockPass').value = '';
    dots(0);
    err('');
    setTimeout(function () { if ($('lockPass')) $('lockPass').focus(); }, 80);
  }
  function hide() {
    var m = $('lockModal');
    if (m) m.hidden = true;
    document.documentElement.classList.remove('ntlock');
    document.body.classList.remove('ntlock');
    if ($('lockPass')) $('lockPass').value = '';
    dots(0);
    err('');
  }

  function tryUnlock(pass) {
    if (Date.now() < waitUntil) {
      err('잠시 뒤에 다시 시도해 주세요. (' + Math.ceil((waitUntil - Date.now()) / 1000) + '초)', true);
      return;
    }
    hash(pass, cfg.salt).then(function (h) {
      if (h === cfg.hash) {
        tries = 0;
        markUnlocked();
        var cb = pending; pending = null;
        hide();
        if (cfg.first) {
          cfg.first = false; saveLock(cfg);
          setTimeout(function () {
            if (window.CertApp && window.CertApp.toast) {
              window.CertApp.toast('기본 비밀번호 0000입니다. 관리자 › 연결·설정에서 꼭 바꿔 주세요.');
            }
          }, 400);
        }
        if (cb) setTimeout(cb, 60);
        return;
      }
      tries++;
      if ($('lockPass')) $('lockPass').value = '';
      dots(0);
      if (tries >= 5) {
        waitUntil = Date.now() + 30000;
        err('5번 틀렸습니다. 30초 뒤에 다시 시도해 주세요.', true);
      } else {
        err('비밀번호가 맞지 않습니다. 다시 넣어 주세요.', true);
      }
    });
  }

  function syncInput() {
    var v = String($('lockPass') ? $('lockPass').value : '').replace(/[^0-9]/g, '').slice(0, 4);
    if ($('lockPass') && $('lockPass').value !== v) $('lockPass').value = v;
    dots(v.length);
    if (v.length === 4) setTimeout(function () { tryUnlock(v); }, 80);
  }

  function bind() {
    if (!$('lockModal')) return;
    if ($('lockPass')) $('lockPass').addEventListener('input', syncInput);
    if ($('lockPass')) $('lockPass').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); if (String(this.value).length === 4) tryUnlock(this.value); }
    });
    var pad = $('lockPad');
    if (pad) pad.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('button[data-k]') : null;
      if (!b) return;
      var k = b.getAttribute('data-k');
      var inp = $('lockPass');
      if (!inp) return;
      if (k === 'del') inp.value = String(inp.value).slice(0, -1);
      else if (String(inp.value).length < 4) inp.value = String(inp.value) + k;
      syncInput();
    });
    if ($('lockCancel')) $('lockCancel').addEventListener('click', function () {
      pending = null; hide();
    });

    /* 관리자 › 연결·설정: 켜기/끄기 · 비밀번호(4자리) 바꾸기 */
    Array.prototype.forEach.call(document.querySelectorAll('input[name="lockOn"]'), function (r) {
      r.addEventListener('change', function () {
        if (!r.checked) return;
        cfg.on = (r.value === 'on');
        saveLock(cfg);
        if (!cfg.on) clearUnlocked();
        if (window.CertApp && window.CertApp.toast) {
          window.CertApp.toast(cfg.on ? '앱 잠금을 켰습니다.' : '앱 잠금을 껐습니다.');
        }
      });
    });
    if ($('lockSave')) $('lockSave').addEventListener('click', function () {
      var cur = String($('lockCur') ? $('lockCur').value : '');
      var p1 = String($('lockNew') ? $('lockNew').value : '');
      var p2 = String($('lockNew2') ? $('lockNew2').value : '');
      if (!/^\d{4}$/.test(p1)) { alert('새 비밀번호는 숫자 4자리로 정해 주세요. (예: 0000)'); return; }
      if (p1 !== p2) { alert('두 번 입력한 비밀번호가 다릅니다.'); return; }
      hash(cur, cfg.salt).then(function (h) {
        if (h !== cfg.hash) { alert('지금 비밀번호가 맞지 않습니다.'); return; }
        var salt = rand(16);
        return hash(p1, salt).then(function (nh) {
          cfg.salt = salt; cfg.hash = nh; cfg.on = true; cfg.first = false;
          saveLock(cfg);
          clearUnlocked();
          ['lockCur', 'lockNew', 'lockNew2'].forEach(function (id) { if ($(id)) $(id).value = ''; });
          if (window.CertApp && window.CertApp.toast) window.CertApp.toast('비밀번호를 바꿨습니다. 이 기기에서만 적용됩니다.');
        });
      });
    });
  }

  function boot() {
    ensureDefault();
    bind();
    Array.prototype.forEach.call(document.querySelectorAll('input[name="lockOn"]'), function (r) {
      r.checked = (r.value === ((cfg && cfg.on === false) ? 'off' : 'on'));
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.CertLock = {
    /* 잠겨 있으면 비밀번호를 묻고, 풀리면 cb를 부른다 */
    require: function (cb, opts) {
      var always = !!(opts && opts.always);
      if (!cfg || cfg.on === false) return cb();
      if (!always && unlockedRecently()) return cb();
      if (always) clearUnlocked();          /* 관리자는 세션과 무관하게 매번 묻는다 */
      if (!cfg.hash) {   /* 첫 해시가 아직 준비되지 않은 순간 */
        return hash(DEFAULT_PW, cfg.salt).then(function (h) { cfg.hash = h; saveLock(cfg); show(cb); });
      }
      show(cb);
    },
    locked: function () { return !!(cfg && cfg.on !== false) && !unlockedRecently(); },
    lockNow: function () { clearUnlocked(); }
  };
})();
