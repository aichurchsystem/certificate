/* ==========================================================================
   엑셀(.xlsx) 읽기 — 라이브러리 없이 브라우저 기능만 쓴다.
   - .xlsx 는 ZIP + XML 이라, ZIP 풀기는 브라우저의 DecompressionStream('deflate-raw')을 쓴다.
   - 첫 번째 워크시트를 행/열 표(Array<Array<string>>)로 돌려준다.
   - .xls(옛 형식)는 읽지 않는다(엑셀에서 .xlsx나 CSV로 저장해야 한다).
   다른 파일(assets/notice.js, assets/app.js)이 window.SheetRead 로 함께 쓴다.
   ========================================================================== */
window.SheetRead = (function () {
  'use strict';

  function utf8(bytes) {
    try { return new TextDecoder('utf-8').decode(bytes); }
    catch (e) { return ''; }
  }

  function zipEntries(buf) {
    var dv = new DataView(buf), n = buf.byteLength, eocd = -1, i;
    for (i = n - 22; i >= 0 && i > n - 66000; i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('엑셀 파일 구조를 찾지 못했습니다.');
    var count = dv.getUint16(eocd + 10, true);
    var cdOff = dv.getUint32(eocd + 16, true);
    var files = {}, p = cdOff;
    for (i = 0; i < count; i++) {
      if (dv.getUint32(p, true) !== 0x02014b50) break;
      var method = dv.getUint16(p + 10, true);
      var csize = dv.getUint32(p + 20, true);
      var nlen = dv.getUint16(p + 28, true);
      var elen = dv.getUint16(p + 30, true);
      var clen = dv.getUint16(p + 32, true);
      var lho = dv.getUint32(p + 42, true);
      var name = utf8(new Uint8Array(buf, p + 46, nlen));
      var lnlen = dv.getUint16(lho + 26, true);
      var lelen = dv.getUint16(lho + 28, true);
      files[name] = { method: method, start: lho + 30 + lnlen + lelen, size: csize };
      p += 46 + nlen + elen + clen;
    }
    return files;
  }

  function entryText(buf, ent) {
    if (!ent) return Promise.resolve('');
    var data = new Uint8Array(buf, ent.start, ent.size);
    if (ent.method === 0) return Promise.resolve(utf8(data));
    if (typeof DecompressionStream !== 'function') {
      return Promise.reject(new Error('이 브라우저에서는 엑셀 압축을 풀지 못합니다. 엑셀에서 CSV로 저장해 주세요.'));
    }
    var ds = new DecompressionStream('deflate-raw');
    var stream = new Blob([data]).stream().pipeThrough(ds);
    return new Response(stream).arrayBuffer().then(function (ab) { return utf8(new Uint8Array(ab)); });
  }

  function colIndex(ref) {
    var m = /^([A-Z]+)/.exec(String(ref || '').toUpperCase());
    if (!m) return -1;
    var s = m[1], n = 0, i;
    for (i = 0; i < s.length; i++) n = n * 26 + (s.charCodeAt(i) - 64);
    return n - 1;
  }

  function xmlDoc(text) {
    try { return new DOMParser().parseFromString(text, 'application/xml'); }
    catch (e) { return null; }
  }

  /* 엑셀의 날짜 셀은 1899-12-30 기준 일련번호로 들어 있다 */
  function serialToDate(v) {
    var n = Number(v);
    if (!isFinite(n) || n <= 0 || n > 90000) return '';
    var d = new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 86400000);
    var y = d.getUTCFullYear(), m = d.getUTCMonth() + 1, dd = d.getUTCDate();
    if (y < 1900 || y > 2200) return '';
    return y + '-' + (m < 10 ? '0' : '') + m + '-' + (dd < 10 ? '0' : '') + dd;
  }

  function rowsOf(buf) {
    var files;
    try { files = zipEntries(buf); } catch (e) { return Promise.reject(e); }
    function get(name) { return entryText(buf, files[name]).catch(function () { return ''; }); }
    return Promise.all([
      get('xl/workbook.xml'), get('xl/_rels/workbook.xml.rels'), get('xl/sharedStrings.xml')
    ]).then(function (r) {
      var wb = r[0] || '', rels = r[1] || '', sharedXml = r[2] || '';
      var relMap = {}, re = /<Relationship\b[^>]*>/g, m;
      while ((m = re.exec(rels))) {
        var id = /Id="([^"]+)"/.exec(m[0]), tg = /Target="([^"]+)"/.exec(m[0]);
        if (id && tg) relMap[id[1]] = tg[1].replace(/^\/?xl\//, '').replace(/^\.\//, '');
      }
      var first = /<sheet\b[^>]*>/.exec(wb);
      var rid = first ? /r:id="([^"]+)"/.exec(first[0]) : null;
      var target = (rid && relMap[rid[1]]) ? relMap[rid[1]] : 'worksheets/sheet1.xml';
      return get('xl/' + target.replace(/^\//, '')).then(function (sheetXml) {
        var shared = [];
        if (sharedXml) {
          var sd = xmlDoc(sharedXml);
          if (sd) {
            var sis = sd.getElementsByTagName('si');
            for (var i = 0; i < sis.length; i++) {
              var ts = sis[i].getElementsByTagName('t'), s = '';
              for (var j = 0; j < ts.length; j++) s += ts[j].textContent || '';
              shared.push(s);
            }
          }
        }
        var doc = xmlDoc(sheetXml);
        if (!doc) throw new Error('엑셀 내용을 읽지 못했습니다.');
        var rowsEl = doc.getElementsByTagName('row');
        var out = [];
        for (var r = 0; r < rowsEl.length; r++) {
          var cells = rowsEl[r].getElementsByTagName('c');
          var arr = [];
          for (var c = 0; c < cells.length; c++) {
            var cell = cells[c];
            var idx = colIndex(cell.getAttribute('r'));
            var t = cell.getAttribute('t');
            var val = '';
            if (t === 'inlineStr') {
              var its = cell.getElementsByTagName('t');
              for (var q = 0; q < its.length; q++) val += its[q].textContent || '';
            } else {
              var v = cell.getElementsByTagName('v')[0];
              val = v ? (v.textContent || '') : '';
              if (t === 's') val = shared[Number(val)] || '';
              else if (val && cell.getAttribute('s')) {
                /* 날짜 서식(스타일)이면 일련번호를 날짜로 */
                var st = (cell.getAttribute('s') || '').trim();
                if (DATE_STYLES[st] === undefined) { /* 스타일 정보는 아래에서 채운다 */ }
                if (DATE_STYLES[st]) val = serialToDate(val) || val;
              }
            }
            arr[idx >= 0 ? idx : arr.length] = String(val == null ? '' : val).trim();
          }
          out.push(arr);
        }
        return out;
      }).then(function (rows) { return rows; });
    });
  }

  /* 셀 스타일 중 날짜 서식인 것만 표시해 둔다(styles.xml 의 numFmtId 14~22, 45~47, 164+) */
  var DATE_STYLES = {};
  function loadDateStyles(buf) {
    var files;
    try { files = zipEntries(buf); } catch (e) { return Promise.resolve(); }
    return entryText(buf, files['xl/styles.xml']).then(function (xml) {
      if (!xml) return;
      var doc = xmlDoc(xml);
      if (!doc) return;
      var custom = {};
      var fmts = doc.getElementsByTagName('numFmt');
      for (var i = 0; i < fmts.length; i++) {
        var id = fmts[i].getAttribute('numFmtId');
        var code = String(fmts[i].getAttribute('formatCode') || '');
        custom[id] = /[yYmMdD]/.test(code) && !/[#0]/.test(code.replace(/[yYmMdDsS]/g, ''));
      }
      var xfs = doc.getElementsByTagName('cellXfs')[0];
      var lists = xfs ? xfs.getElementsByTagName('xf') : [];
      for (var k = 0; k < lists.length; k++) {
        var nid = String(lists[k].getAttribute('numFmtId') || '0');
        var builtin = (Number(nid) >= 14 && Number(nid) <= 22) || (Number(nid) >= 45 && Number(nid) <= 47);
        DATE_STYLES[String(k)] = builtin || !!custom[nid];
      }
    }).catch(function () {});
  }

  function rows(buf) {
    DATE_STYLES = {};
    return loadDateStyles(buf).then(function () { return rowsOf(buf); });
  }

  function toText(rows) {
    var lines = [];
    (rows || []).forEach(function (arr) {
      var cells = [];
      for (var i = 0; i < arr.length; i++) cells.push(arr[i] == null ? '' : arr[i]);
      while (cells.length && !String(cells[cells.length - 1]).trim()) cells.pop();
      var line = cells.join('  ').replace(/\s+$/, '');
      if (String(line).trim()) lines.push(line);
    });
    return lines.join('\n');
  }

  /* CSV 문자열 → 행/열 */
  function csvRows(text) {
    var rows = [], row = [], cur = '', q = false, i, ch;
    var s = String(text || '').replace(/\r\n?/g, '\n');
    for (i = 0; i < s.length; i++) {
      ch = s.charAt(i);
      if (q) {
        if (ch === '"') {
          if (s.charAt(i + 1) === '"') { cur += '"'; i++; }
          else q = false;
        } else cur += ch;
      } else if (ch === '"') q = true;
      else if (ch === ',') { row.push(cur); cur = ''; }
      else if (ch === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
      else cur += ch;
    }
    row.push(cur);
    rows.push(row);
    return rows;
  }

  return { rows: rows, toText: toText, csvRows: csvRows, serialToDate: serialToDate };
})();
