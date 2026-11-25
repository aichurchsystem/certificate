/* 문서 진위 확인 — 서버(Apps Script)의 verify 액션만 부른다.
   · 키 없이 공개된 유일한 액션. 자체번호 + 문서확인번호 두 값이 같은 줄에서 맞을 때만 한 건을 돌려준다.
   · 이 페이지는 발급 앱의 잠금·명단·관리자와 아무 관계가 없다. */
(function () {
  'use strict';

  var API = 'https://script.google.com/macros/s/AKfycbyL7uvAFlx1Vgk2-WC8G3dDIGMRzpvqoqb90BVKe64DMd7qAdzNGqF4v-7-EKMQi0yP/exec';

  var $ = function (id) { return document.getElementById(id); };
  var res = $('vres'), badge = $('vbadge'), msg = $('vmsg'), list = $('vlist'), hint = $('vhint');
  var form = $('vform'), fNo = $('fNo'), fInet = $('fInet'), btn = $('vgo'), err = $('verr');
  var busy = false;

  var OK_SVG = '<svg class="vico" viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 12.5l5 5 10-11"/></svg>';
  var BAD_SVG = '<svg class="vico" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  var WARN_SVG = '<svg class="vico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v9M12 19.2v.1"/></svg>';

  function setBadge(svg) { badge.innerHTML = svg; }

  function showErr(text) {
    err.textContent = text;
    err.hidden = false;
  }
  function clearErr() { err.hidden = true; err.textContent = ''; }

  function resetResult() {
    res.hidden = true;
    res.className = 'vres';
  }

  function showMatch(d) {
    res.hidden = false;
    res.className = 'vres' + (d.canceled ? ' is-warn' : '');
    setBadge(d.canceled ? WARN_SVG : OK_SVG);
    msg.textContent = d.canceled
      ? '이 번호의 발급 기록은 취소되었습니다.'
      : '이 문서는 대한예수교장로회(백석) 서울강동노회에서 발급한 문서가 맞습니다.';
    $('vNo').textContent = d.no || '';
    $('vType').textContent = d.type || '';
    $('vTitle').textContent = d.title || '';
    $('vTitleRow').hidden = !d.title || d.title === d.type;
    $('vName').textContent = d.name || '';
    $('vChurch').textContent = d.church || '';
    $('vDate').textContent = d.issueDate || '';
    list.hidden = false;
    hint.hidden = !d.canceled;
    if (d.canceled) hint.textContent = '발급이 취소된 문서입니다. 내용을 확인하시려면 노회로 문의해 주세요.';
    try { res.scrollIntoView({ block: 'nearest' }); } catch (e) {}
  }

  function showNoMatch() {
    res.hidden = false;
    res.className = 'vres is-bad';
    setBadge(BAD_SVG);
    msg.textContent = '일치하는 발급 기록을 찾지 못했습니다. 번호를 다시 확인하시거나 노회로 문의해 주세요.';
    list.hidden = true;
    hint.hidden = true;
    try { res.scrollIntoView({ block: 'nearest' }); } catch (e) {}
  }

  function showNetFail() {
    res.hidden = true;
    showErr('확인하지 못했습니다. 잠시 뒤 다시 시도해 주세요.');
  }

  function clean(s) {
    return String(s || '').replace(/\s+/g, ' ').trim().slice(0, 60);
  }

  function ask(no, inet) {
    var url = API + '?action=verify&no=' + encodeURIComponent(no) + '&inet=' + encodeURIComponent(inet);
    var ctl = window.AbortController ? new AbortController() : null;
    var t = setTimeout(function () { if (ctl) ctl.abort(); }, 14000);
    return fetch(url, ctl ? { signal: ctl.signal, redirect: 'follow' } : { redirect: 'follow' })
      .then(function (r) { return r.text(); })
      .then(function (txt) {
        var d;
        try { d = JSON.parse(txt); } catch (e) { throw new Error('bad-response'); }
        return d;
      })
      .finally(function () { clearTimeout(t); });
  }

  function run(no, inet, fromUrl) {
    no = clean(no);
    var code = String(inet || '').replace(/\s+/g, '').toUpperCase().slice(0, 20);
    fNo.value = no;
    fInet.value = code;
    clearErr();

    if (!no || !code) {
      resetResult();
      showErr('두 칸을 모두 넣어 주세요. 문서에 인쇄된 자체번호와 문서확인번호입니다.');
      return;
    }

    if (busy) return;
    busy = true;
    btn.disabled = true;
    btn.textContent = '확인 중…';
    if (!fromUrl) {
      try { history.replaceState(null, '', '?no=' + encodeURIComponent(no) + '&inet=' + encodeURIComponent(code)); } catch (e) {}
    }

    ask(no, code).then(function (d) {
      if (d && d.ok && d.issued) showMatch(d);
      else if (d && d.error === 'not-found') showNoMatch();
      else showNetFail();
    }).catch(function () {
      showNetFail();
    }).then(function () {
      busy = false;
      btn.disabled = false;
      btn.textContent = '확인하기';
    });
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    run(fNo.value, fInet.value, false);
  });

  fNo.addEventListener('input', clearErr);
  fInet.addEventListener('input', function () { fInet.value = fInet.value.toUpperCase(); clearErr(); });

  /* QR로 들어오면 주소의 두 값으로 바로 확인한다 */
  var q = new URLSearchParams(location.search);
  var pNo = q.get('no') || '';
  var pInet = q.get('inet') || '';
  if (pNo && pInet) run(pNo, pInet, true);
  else if (pNo) { fNo.value = pNo; fInet.focus(); }
  else { fNo.focus(); }
})();
