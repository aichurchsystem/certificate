/* ==========================================================================
   한글 이름 → 영문(로마자) 자동 표기 — 이 파일만 있으면 네트워크 없이 돈다.
   · 성(姓)은 한국에서 널리 쓰는 표기를 표로 둔다(박 Park, 이 Lee, 최 Choi …).
   · 이름은 한글 음절을 초성·중성·종성으로 풀어 개정 로마자 표기법대로 적는다.
     받침 대표음(ㄱ k · ㄷ t · ㅂ p · ㅈ t …), 연음(받침이 뒤 모음으로 넘어감),
     겹받침 나눠 넘기기까지 이름에 필요한 만큼만 담았다.
   · 흔히 쓰는 관용 표기 몇 개(현 hyun 등)는 OVERRIDE 에 둔다.
   · 한글이 아닌 글자(Rev. 같은 머리말·하이픈·공백)는 그대로 지나간다.
   사용: KRoman.name('박재용')            → 'Park Jaeyong'
        KRoman.name('박재용', {hyphen:true}) → 'Park Jae-yong'
        KRoman.list('박재용, 황명구')       → ['Park Jaeyong', 'Hwang Myeonggu']
   ========================================================================== */
(function (global) {
  'use strict';

  /* ---------- 성(姓) 표 — 목사님이 정해 주신 관용 표기 ---------- */
  var SURNAME = {
    '김': 'Kim', '이': 'Lee', '박': 'Park', '최': 'Choi', '정': 'Jung', '강': 'Kang',
    '조': 'Cho', '윤': 'Yoon', '장': 'Jang', '임': 'Lim', '한': 'Han', '오': 'Oh',
    '서': 'Seo', '신': 'Shin', '권': 'Kwon', '황': 'Hwang', '안': 'Ahn', '송': 'Song',
    '류': 'Ryu', '유': 'Yoo', '전': 'Jeon', '홍': 'Hong', '고': 'Ko', '문': 'Moon',
    '손': 'Son', '양': 'Yang', '배': 'Bae', '백': 'Baek', '허': 'Heo', '남': 'Nam',
    '심': 'Sim', '노': 'Noh', '하': 'Ha', '곽': 'Kwak', '성': 'Sung', '차': 'Cha',
    '주': 'Joo', '우': 'Woo', '구': 'Koo', '민': 'Min', '진': 'Jin', '나': 'Na',
    '지': 'Ji', '엄': 'Eom', '채': 'Chae', '원': 'Won', '천': 'Chun', '방': 'Bang',
    '공': 'Kong', '현': 'Hyun', '함': 'Ham', '변': 'Byun', '염': 'Yeom', '여': 'Yeo',
    '추': 'Chu', '도': 'Do', '소': 'So', '석': 'Seok', '선': 'Sun', '설': 'Seol',
    '마': 'Ma', '길': 'Gil', '연': 'Yeon', '위': 'Wi', '표': 'Pyo', '명': 'Myung',
    '기': 'Ki', '반': 'Ban', '왕': 'Wang', '금': 'Keum', '옥': 'Ok', '육': 'Yook',
    '인': 'In', '맹': 'Maeng', '제': 'Je', '모': 'Mo', '탁': 'Tak', '국': 'Kook',
    '어': 'Eo', '은': 'Eun', '편': 'Pyun', '용': 'Yong', '예': 'Ye', '경': 'Kyung',
    '봉': 'Bong', '사': 'Sa', '부': 'Bu', '가': 'Ka', '복': 'Bok', '태': 'Tae',
    '목': 'Mok', '형': 'Hyung', '피': 'Pi', '두': 'Du', '감': 'Kam', '음': 'Eum',
    '빈': 'Bin', '동': 'Dong', '온': 'On', '호': 'Ho', '시': 'Si', '범': 'Beom',
    '좌': 'Jwa', '팽': 'Paeng', '승': 'Seung', '간': 'Kan', '상': 'Sang', '갈': 'Kal',
    '단': 'Dan', '견': 'Kyeon', '당': 'Dang', '화': 'Hwa', '창': 'Chang', '옹': 'Ong',
    '판': 'Pan', '교': 'Kyo'
  };

  /* 두 글자 성 */
  var SURNAME2 = {
    '남궁': 'Namgung', '황보': 'Hwangbo', '제갈': 'Jegal', '선우': 'Seonu',
    '독고': 'Dokgo', '사공': 'Sagong', '서문': 'Seomun', '동방': 'Dongbang'
  };

  /* ---------- 음절 분해 표 ---------- */
  var INITIAL = ['g', 'kk', 'n', 'd', 'tt', 'r', 'm', 'b', 'pp', 's', 'ss', '', 'j', 'jj', 'ch', 'k', 't', 'p', 'h'];
  var VOWEL = ['a', 'ae', 'ya', 'yae', 'eo', 'e', 'yeo', 'ye', 'o', 'wa', 'wae', 'oe', 'yo', 'u', 'wo', 'we', 'wi', 'yu', 'eu', 'ui', 'i'];
  /* 종성 28가지: '', ㄱ, ㄲ, ㄳ, ㄴ, ㄵ, ㄶ, ㄷ, ㄹ, ㄺ, ㄻ, ㄼ, ㄽ, ㄾ, ㄿ, ㅀ, ㅁ, ㅂ, ㅄ, ㅅ, ㅆ, ㅇ, ㅈ, ㅊ, ㅋ, ㅌ, ㅍ, ㅎ */
  var FINAL = ['', 'k', 'k', 'k', 'n', 'n', 'n', 't', 'l', 'k', 'm', 'l', 'l', 'l', 'p', 'l', 'm', 'p', 'p', 't', 't', 'ng', 't', 't', 'k', 't', 'p', 't'];
  /* 연음: 받침이 뒤 모음으로 넘어갈 때의 첫소리 */
  var FINAL_LIAISON = ['', 'g', 'kk', 'ks', 'n', 'nj', 'n', 'd', 'r', 'lg', 'lm', 'lb', 'ls', 'lt', 'lp', 'lh', 'm', 'b', 'ps', 's', 'ss', 'ng', 'j', 'ch', 'k', 't', 'p', ''];
  /* 겹받침: 앞부분은 남고 뒷부분이 넘어간다 */
  var FINAL_SPLIT = { 3: ['k', 's'], 5: ['n', 'j'], 6: ['n', 'h'], 9: ['l', 'g'], 10: ['l', 'm'], 11: ['l', 'b'], 12: ['l', 's'], 13: ['l', 't'], 14: ['l', 'p'], 15: ['l', 'h'], 17: ['p', 's'] };

  /* 관용 표기 — 한글 음절 하나를 통째로 바꾼다(이름에서 흔히 쓰는 표기) */
  var OVERRIDE = {
    '현': 'hyun', '혁': 'hyuk', '형': 'hyung', '영': 'young', '우': 'woo', '희': 'hee'
  };

  var S_GA = 0xAC00, S_HI = 0xD7A3;

  function isHangulSyllable(ch) {
    var c = ch.charCodeAt(0);
    return c >= S_GA && c <= S_HI;
  }

  function decompose(ch) {
    var i = ch.charCodeAt(0) - S_GA;
    return { cho: Math.floor(i / 588), jung: Math.floor((i % 588) / 28), jong: i % 28 };
  }

  /* 이름 한 덩이(성 + 이름)를 음절 단위로 적는다.
     이름은 여권·명함처럼 음절을 그대로 이어 적는다(현우 → Hyunwoo). 그래서 기본값에서는
     연음으로 글자가 바뀌지 않는다 — 받침은 그 음절에 그대로 남긴다.
     opt.liaison 을 켜면 발음대로 적는다(현우 → Hyunnu). */
  function romanSyllables(sylls, opt) {
    var lk = opt && opt.liaison ? liaisonOf(sylls) : { moved: {}, liaison: {} };
    return sylls.map(function (d, k) {
      var cho = (k > 0 && lk.liaison[k] != null) ? lk.liaison[k] : INITIAL[d.cho];
      var jong = (d.jong && !lk.moved[k]) ? FINAL[d.jong] : '';
      return cho + VOWEL[d.jung] + jong;
    });
  }

  function liaisonOf(sylls) {
    var moved = {}, liaison = {};
    for (var k = 0; k + 1 < sylls.length; k++) {
      var a = sylls[k], b = sylls[k + 1];
      if (!a.jong) continue;
      if (b.cho !== 11) continue;                 /* 다음 글자가 ㅇ 첫소리일 때만 넘어간다 */
      var sp = FINAL_SPLIT[a.jong];
      if (sp) { liaison[k + 1] = sp[1]; moved[k] = false; /* 앞부분은 남는다 */ }
      else if (a.jong === 21) { continue; }        /* 받침 ㅇ(ng)은 넘어가지 않는다 */
      else if (a.jong === 27) { liaison[k + 1] = ''; moved[k] = true; }  /* 받침 ㅎ은 소리 없이 넘어간다 */
      else { liaison[k + 1] = FINAL_LIAISON[a.jong]; moved[k] = true; }
    }
    return { moved: moved, liaison: liaison };
  }

  /* 한 낱말(성+이름) → 'Park Jaeyong' */
  function romanWord(word, opts) {
    var opt = opts || {};
    var hyphen = !!opt.hyphen;
    var surname = '';
    var given = [];
    if (/^[가-힣]{2}/.test(word) && SURNAME2[word.slice(0, 2)]) {
      surname = SURNAME2[word.slice(0, 2)];
      given = word.slice(2).split('');
    } else if (isHangulSyllable(word.charAt(0))) {
      surname = SURNAME[word.charAt(0)] || '';
      given = word.slice(1).split('');
    } else {
      /* 한글이 아닌 낱말은 그대로 */
      return word;
    }

    var parts = romanSyllables(given.map(decompose), opt).map(function (p, i) {
      var src = given[i];
      return (OVERRIDE[src] || p);
    }).filter(Boolean);
    var givenStr = parts.join(hyphen ? '-' : '');
    if (givenStr) givenStr = givenStr.charAt(0).toUpperCase() + givenStr.slice(1);
    if (!surname) return givenStr || word;
    return (surname + (givenStr ? ' ' + givenStr : '')).trim();
  }

  /* '박재용' · '박 재용' · 'Rev. 박재용' → 'Park Jaeyong' / 'Rev. Park Jaeyong'
     한글 낱말이 공백으로 끊겨 있어도(‘박 재용’) 한 이름으로 붙여 적는다. */
  function romanName(text, opts) {
    var s = String(text == null ? '' : text).trim();
    if (!s) return '';
    var words = s.split(/\s+/), merged = [];
    words.forEach(function (w) {
      var prev = merged.length ? merged[merged.length - 1] : '';
      if (prev && /^[가-힣]+$/.test(prev) && /^[가-힣]+$/.test(w)) merged[merged.length - 1] = prev + w;
      else merged.push(w);
    });
    return merged.map(function (w) { return romanWord(w, opts); }).join(' ');
  }

  /* '가, 나, 다' · 줄바꿈 → 배열 */
  function splitList(text) {
    return String(text == null ? '' : text)
      .split(/[,\n、]/)
      .map(function (s) { return s.trim(); })
      .filter(Boolean);
  }

  /* 명단 전체를 같은 방식으로 */
  function romanList(text, opts) {
    return splitList(text).map(function (nm) { return romanName(nm, opts); });
  }

  global.KRoman = {
    name: romanName,
    list: romanList,
    splitList: splitList,
    surname: function (ch) { return SURNAME[ch] || ''; },
    hasHangul: function (s) { return /[가-힣]/.test(String(s || '')); }
  };
})(window);
