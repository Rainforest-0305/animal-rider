/* locale_audit_probe.js — 페이지 «안»에서 도는 레이아웃 실측기.
 *
 * 이 파일은 UI 코드를 import 하지 않는다. #ui-overlay 아래 «실제로 렌더된 DOM»만
 * 훑어 기하를 잰다. 그래서 로스터가 8종이든 24종이든 40종이든 코드 수정이 필요 없다.
 *
 * ★ 측정조건(수치 내기 전에 조건부터 진술한다 — 보고서에 그대로 실린다):
 *   - 측정주체 = 실제 Chrome 렌더엔진(getBoundingClientRect / Range.getClientRects).
 *     문자폭 추정모델이 아니다.
 *   - 허용오차 TOL=1.0px. 서브픽셀 반올림으로 인한 오탐을 막는다.
 *   - 인라인(span) 요소는 clientWidth/scrollWidth 가 «항상 0» 이다. 그래서
 *     span 텍스트는 scrollWidth 비교가 아니라 Range 실측 사각형으로 잰다.
 *     (scrollWidth 만 쓰는 점검기는 이 UI의 텍스트 대부분을 «조용히» 통과시킨다)
 *   - position:absolute 요소는 부모의 «패딩박스» 기준으로 배치된다. 콘텐츠박스와
 *     비교하면 .ar-badge 같은 정상 배치가 오탐으로 잡힌다 — 기준박스를 분기한다.
 *   - backface-visibility:hidden 이고 누적 변환행렬의 법선 z<0 이면 «뒤를 보고 있는»
 *     면이라 화면에 없다. 측정 제외(SKIPPED)로 «세고» 넘어간다. 조용히 빼지 않는다.
 */
(function () {
  var TOL = 1.0;

  function volatileClass(c) {
    // 애니메이션/상태 클래스는 키에서 제외해야 로케일 간 «같은 요소»로 대응된다.
    return c === 'in' || c === 'flip' || c === 'ar-pop' || c === 'pop';
  }

  function sig(n) {
    var s = n.tagName.toLowerCase();
    var cls = [];
    for (var i = 0; i < n.classList.length; i++) {
      if (!volatileClass(n.classList[i])) cls.push(n.classList[i]);
    }
    cls.sort();
    if (cls.length) s += '.' + cls.join('.');
    if (n.dataset) {
      if (n.dataset.stageId) s += '[stage=' + n.dataset.stageId + ']';
      if (n.dataset.critId) s += '[crit=' + n.dataset.critId + ']';
    }
    return s;
  }

  /** 로케일이 바뀌어도 같은 요소면 같은 문자열이 나오는 구조 키. */
  function keyOf(el, root) {
    var parts = [];
    var n = el;
    while (n && n !== root && n !== document.body) {
      var mine = sig(n);
      var idx = 0;
      var prev = n.previousElementSibling;
      while (prev) {
        if (sig(prev) === mine) idx++;
        prev = prev.previousElementSibling;
      }
      parts.push(idx ? mine + ':' + idx : mine);
      n = n.parentElement;
    }
    return parts.reverse().join('>');
  }

  /** 조상 변환행렬 누적 → 법선(0,0,1) 의 z 성분 부호로 앞/뒤면 판정. */
  function facingZ(el) {
    var chain = [];
    var n = el;
    while (n && n !== document.documentElement) {
      chain.push(n);
      n = n.parentElement;
    }
    chain.reverse();
    var m = new DOMMatrix();
    for (var i = 0; i < chain.length; i++) {
      var t = getComputedStyle(chain[i]).transform;
      if (t && t !== 'none') m = m.multiply(new DOMMatrix(t));
    }
    return m.m33;
  }

  function box(el, kind) {
    // kind: 'padding' | 'content'
    var r = el.getBoundingClientRect();
    var cs = getComputedStyle(el);
    var bl = parseFloat(cs.borderLeftWidth) || 0;
    var br = parseFloat(cs.borderRightWidth) || 0;
    var bt = parseFloat(cs.borderTopWidth) || 0;
    var bb = parseFloat(cs.borderBottomWidth) || 0;
    var pl = kind === 'content' ? parseFloat(cs.paddingLeft) || 0 : 0;
    var pr = kind === 'content' ? parseFloat(cs.paddingRight) || 0 : 0;
    var pt = kind === 'content' ? parseFloat(cs.paddingTop) || 0 : 0;
    var pb = kind === 'content' ? parseFloat(cs.paddingBottom) || 0 : 0;
    return {
      left: r.left + bl + pl,
      right: r.right - br - pr,
      top: r.top + bt + pt,
      bottom: r.bottom - bb - pb,
    };
  }

  function nearestBlock(el, root) {
    var n = el.parentElement;
    while (n && n !== root) {
      var d = getComputedStyle(n).display;
      if (d !== 'inline' && d !== 'contents') return n;
      n = n.parentElement;
    }
    return n || root;
  }

  /** overflow 가 visible 이 아닌 «진짜 자르는» 조상들. */
  function clippers(el, root) {
    var out = [];
    var n = el.parentElement;
    while (n && n !== document.documentElement) {
      var cs = getComputedStyle(n);
      var ox = cs.overflowX, oy = cs.overflowY;
      if (ox !== 'visible' || oy !== 'visible') {
        out.push({
          node: n,
          ox: ox,
          oy: oy,
          scrollableY: n.scrollHeight > n.clientHeight + TOL && (oy === 'auto' || oy === 'scroll'),
          scrollableX: n.scrollWidth > n.clientWidth + TOL && (ox === 'auto' || ox === 'scroll'),
          pad: box(n, 'padding'),
        });
      }
      if (n === root) break;
      n = n.parentElement;
    }
    return out;
  }

  function directText(el) {
    var s = '';
    for (var i = 0; i < el.childNodes.length; i++) {
      var c = el.childNodes[i];
      if (c.nodeType === 3) s += c.nodeValue;
    }
    return s;
  }

  window.__audit = function () {
    var root = document.getElementById('ui-overlay');
    var res = {
      findings: [],
      metrics: {},   // key -> { w,h,lines,text }
      texts: [],     // 화면에 실제로 «보이는» 텍스트 전량(음역/한글 카운트용)
      total: 0,
      skipped: 0,      // «측정 자체를 못 한» 요소 — 이게 진짜 면제다
      textless: 0,     // 기하검사는 다 했고 글자만 없는 요소 — 면제 아님
      skipReasons: {},
      skipSamples: {},
      // ★ 커버리지 증명용. 요소 «종류»(tag+class) 단위로 측정/면제 여부를 남긴다.
      //   전체 경로 키를 보내면 1회 실행에 100MB급이라 못 쓴다 — 종류 단위면 수십 개다.
      //   러너가 720개 조합을 합쳐 «어디서도 한 번도 측정 안 된 종류»를 뽑는다.
      //   그게 진짜 사각지대다. 이걸로 「면제=사각지대 아님」이 주장에서 실측이 된다.
      measuredSigs: {},
      skippedSigs: {},
      tight: [],     // 여유(headroom)가 빠듯한 자리 — 폰트가 바뀌면 «먼저» 터질 곳
      vw: window.innerWidth,
      vh: window.innerHeight,
    };
    if (!root) {
      res.skipReasons['no-overlay-root'] = 1;
      return res;
    }

    function skip(reason, el) {
      res.skipped++;
      res.skipReasons[reason] = (res.skipReasons[reason] || 0) + 1;
      if (el) res.skippedSigs[sig(el)] = (res.skippedSigs[sig(el)] || 0) + 1;
      // 면제를 «불투명하게» 두지 않는다 — 무엇이 빠졌는지 예시를 같이 낸다.
      if (!res.skipSamples[reason]) res.skipSamples[reason] = [];
      if (el && res.skipSamples[reason].length < 3) res.skipSamples[reason].push(keyOf(el, root));
    }
    function add(sev, code, el, detail) {
      res.findings.push({
        sev: sev, code: code, key: keyOf(el, root),
        text: (directText(el) || el.textContent || '').trim().slice(0, 80),
        detail: detail,
      });
    }

    var els = [root].concat(Array.prototype.slice.call(root.querySelectorAll('*')));
    res.total = els.length;

    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      var cs = getComputedStyle(el);

      if (cs.display === 'none') { skip('display:none', el); continue; }
      if (cs.visibility === 'hidden') { skip('visibility:hidden', el); continue; }
      if (parseFloat(cs.opacity) === 0) { skip('opacity:0', el); continue; }
      if (cs.backfaceVisibility === 'hidden' && facingZ(el) < 0) { skip('backface-away', el); continue; }

      var rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) { skip('zero-rect', el); continue; }

      // 여기 도달했다 = 위 면제 관문을 다 통과했다 = «실제로 측정된» 요소다.
      var mySig = sig(el);
      res.measuredSigs[mySig] = (res.measuredSigs[mySig] || 0) + 1;

      var key = keyOf(el, root);
      var isAbs = cs.position === 'absolute' || cs.position === 'fixed';
      var host = isAbs ? (el.offsetParent || root) : nearestBlock(el, root);
      var hostBox = box(host, isAbs ? 'padding' : 'content');

      // ── 1) 요소 자체가 기준박스를 가로로 벗어나는가 ───────────────────────
      var overRight = rect.right - hostBox.right;
      var overLeft = hostBox.left - rect.left;
      if (host !== el && (overRight > TOL || overLeft > TOL)) {
        add('ERR', 'OVERFLOW_X', el, {
          by: Math.round(Math.max(overRight, overLeft) * 10) / 10,
          host: keyOf(host, root) || '#ui-overlay',
          hostW: Math.round((hostBox.right - hostBox.left) * 10) / 10,
          elW: Math.round(rect.width * 10) / 10,
        });
      }

      // ── 2) 스크롤 불가 박스인데 내용이 넘치는가 ─────────────────────────
      if (cs.display !== 'inline') {
        var sx = el.scrollWidth - el.clientWidth;
        var sy = el.scrollHeight - el.clientHeight;
        if (sx > TOL) {
          var scrollableX = cs.overflowX === 'auto' || cs.overflowX === 'scroll';
          add(scrollableX ? 'WARN' : 'ERR', scrollableX ? 'SCROLLBAR_X' : 'CONTENT_WIDER_X', el, {
            by: sx, clientW: el.clientWidth, scrollW: el.scrollWidth, overflowX: cs.overflowX,
          });
        }
        if (sy > TOL && cs.overflowY === 'hidden') {
          add('ERR', 'CLIP_Y', el, { by: sy, clientH: el.clientHeight, scrollH: el.scrollHeight });
        }
      }

      // ── 3) 자르는 조상 밖으로 나갔는가 ─────────────────────────────────
      var cl = clippers(el, root);
      for (var c = 0; c < cl.length; c++) {
        var k = cl[c];
        var dx = Math.max(rect.right - k.pad.right, k.pad.left - rect.left);
        var dy = Math.max(rect.bottom - k.pad.bottom, k.pad.top - rect.top);
        if (dx > TOL && k.ox === 'hidden') {
          add('ERR', 'CLIPPED_X', el, { by: Math.round(dx * 10) / 10, clipper: keyOf(k.node, root) });
        }
        if (dy > TOL && k.oy === 'hidden') {
          add('ERR', 'CLIPPED_Y', el, { by: Math.round(dy * 10) / 10, clipper: keyOf(k.node, root) });
        }
      }

      // ── 4) 뷰포트 이탈 ────────────────────────────────────────────────
      if (rect.right > res.vw + TOL || rect.left < -TOL) {
        add('ERR', 'OFFSCREEN_X', el, {
          left: Math.round(rect.left), right: Math.round(rect.right), vw: res.vw,
        });
      }
      if (rect.bottom > res.vh + TOL) {
        var reachable = false;
        for (var c2 = 0; c2 < cl.length; c2++) if (cl[c2].scrollableY) reachable = true;
        if (!reachable) {
          add('ERR', 'OFFSCREEN_Y', el, {
            bottom: Math.round(rect.bottom), vh: res.vh,
          });
        }
      }

      // ── 5) flex-wrap 컨테이너가 «몇 줄»이 됐는가 ───────────────────────
      if (cs.display === 'flex' && cs.flexWrap === 'wrap' && el.children.length > 1) {
        var tops = {};
        for (var j = 0; j < el.children.length; j++) {
          var cr = el.children[j].getBoundingClientRect();
          if (cr.width === 0 && cr.height === 0) continue;
          tops[Math.round(cr.top)] = 1;
        }
        var rows = Object.keys(tops).length;
        if (rows > 1) add('WARN', 'WRAP_ROWS', el, { rows: rows });
        res.metrics['ROWS::' + key] = { rows: rows };
      }

      // ── 6) 텍스트 실측(Range) — 인라인 span 을 놓치지 않는 유일한 경로 ──
      var txt = directText(el).trim();
      if (txt) {
        var range = document.createRange();
        range.selectNodeContents(el);
        var rs = range.getClientRects();
        var lines = 0, maxW = 0, tRight = -Infinity, tLeft = Infinity, tBottom = -Infinity;
        for (var q = 0; q < rs.length; q++) {
          if (rs[q].width < 0.5 && rs[q].height < 0.5) continue;
          lines++;
          if (rs[q].width > maxW) maxW = rs[q].width;
          if (rs[q].right > tRight) tRight = rs[q].right;
          if (rs[q].left < tLeft) tLeft = rs[q].left;
          if (rs[q].bottom > tBottom) tBottom = rs[q].bottom;
        }
        if (lines > 0) {
          res.texts.push(txt);
          res.metrics[key] = {
            w: Math.round(maxW * 10) / 10,
            h: Math.round(rect.height * 10) / 10,
            lines: lines,
            text: txt.slice(0, 60),
          };
          var tHost = cs.display === 'inline' ? nearestBlock(el, root) : el;
          var tb = box(tHost, 'content');
          var tOver = Math.max(tRight - tb.right, tb.left - tLeft);
          var boxW = tb.right - tb.left;
          res.metrics[key].boxW = Math.round(boxW * 10) / 10;
          // ★ 「여유(headroom) = boxW - textW」 지표는 «폐기했다». 이 UI 의 텍스트
          //   대부분은 shrink-to-fit(칩·버튼·인라인)이라 상자폭이 «정의상» 글자폭과
          //   같다 → 여유가 항상 0, 점유율 항상 100% 로 나온다. 실제로 첫 실행에서
          //   13,316건 중 12,484건이 «점유율 90% 이상»으로 찍혔는데 전부 무의미했다.
          //   대신 러너의 «파괴 폭 스캔»(뷰포트를 줄여 첫 ERR 폭을 찾는다)이
          //   안전여유를 잰다 — 그쪽은 제약이 실재하는 축이라 숫자가 뜻을 가진다.
          if (tOver > TOL) {
            add('ERR', 'TEXT_OVERFLOW_X', el, {
              by: Math.round(tOver * 10) / 10,
              boxW: Math.round((tb.right - tb.left) * 10) / 10,
              textW: Math.round(maxW * 10) / 10,
              host: keyOf(tHost, root) || '#ui-overlay',
            });
          }
        }
      } else if (el.children.length === 0 && !el.textContent.trim()) {
        // ★ 정정(자체발견): 예전엔 이걸 skip('empty-element') 로 세서 SKIPPED 에
        //   합산했다. 틀렸다 — 이 요소들은 위 1~5번 기하검사를 «전부 통과한» 뒤
        //   여기 온다. 글자가 없을 뿐 측정은 됐다. 면제로 세면 「측정 안 된 구간」이
        //   1,908건 부풀려지고, 그만큼 「ERR 0」의 분모를 실제보다 작아 보이게 만든다.
        //   면제가 아니라 «글자없음(측정완료)» 로 따로 센다.
        res.textless++;
      }
    }
    return res;
  };

  /* ─────────────────────────────────────────────────────────────────────────
   * 양성대조(positive control) — «측정도구 자체를 의심하라».
   *
   * ERR 0건은 그 자체로 증거가 아니다. 탐지기가 «죽어 있어도» 0건이 나온다.
   * 그래서 매 실행 시작 시 «반드시 걸려야 하는» 가짜 결함 4종을 실제 DOM 에
   * 심고, 각 코드가 실제로 발화하는지 확인한 뒤 제거한다. 하나라도 안 걸리면
   * 그 실행의 PASS 는 무효다(러너가 전체를 FAIL 처리한다).
   * ───────────────────────────────────────────────────────────────────────── */
  window.__selftest = function () {
    var root = document.getElementById('ui-overlay');
    if (!root) return { ok: false, reason: 'no #ui-overlay' };

    var host = document.createElement('div');
    host.id = '__probe_selftest';
    host.style.cssText = 'position:absolute;left:10px;top:10px;width:120px;';
    // (1) 상자보다 «넓은» 한 줄 텍스트 → CONTENT_WIDER_X / TEXT_OVERFLOW_X
    var a = document.createElement('div');
    a.style.cssText = 'width:40px;overflow:hidden;white-space:nowrap;font-size:16px;';
    a.textContent = 'OVERFLOWING_TEXT_CONTROL_AAAAAAA';
    // (2) 높이보다 «긴» 내용 + overflow:hidden → CLIP_Y
    var b = document.createElement('div');
    b.style.cssText = 'width:80px;height:10px;overflow:hidden;font-size:16px;line-height:20px;';
    b.textContent = 'CLIPPED_Y_CONTROL line1 line2 line3 line4';
    // (3) 뷰포트 오른쪽 밖 → OFFSCREEN_X
    var c = document.createElement('div');
    c.style.cssText = 'position:absolute;left:' + (window.innerWidth + 60) + 'px;top:0;width:50px;height:10px;';
    c.textContent = 'OFF';
    // (4) 부모 콘텐츠박스를 가로로 넘는 자식 → OVERFLOW_X
    var d = document.createElement('div');
    d.style.cssText = 'width:60px;padding:0 5px;';
    var d2 = document.createElement('div');
    d2.style.cssText = 'width:200px;height:8px;';
    d2.textContent = '.';
    d.appendChild(d2);

    host.appendChild(a); host.appendChild(b); host.appendChild(c); host.appendChild(d);
    root.appendChild(host);

    var r = window.__audit();
    var fired = {};
    for (var i = 0; i < r.findings.length; i++) {
      if (r.findings[i].key.indexOf('__probe_selftest') >= 0 ||
          /CONTROL|OFF|^\.$/.test(r.findings[i].text)) fired[r.findings[i].code] = true;
    }
    host.remove();

    var need = ['CONTENT_WIDER_X', 'TEXT_OVERFLOW_X', 'CLIP_Y', 'OFFSCREEN_X', 'OVERFLOW_X'];
    var missing = need.filter(function (n) { return !fired[n]; });
    return { ok: missing.length === 0, fired: Object.keys(fired).sort(), missing: missing };
  };

  /** 렌더가 «끝난 뒤»에 재도록 프레임을 흘린다(트랜지션 클래스는 다음 프레임에 붙는다). */
  window.__settle = function (ms, cap) {
    return new Promise(function (r) {
      var done = false;
      var fin = function () {
        if (done) return;
        done = true;
        setTimeout(r, ms || 120);
      };
      requestAnimationFrame(function () { requestAnimationFrame(fin); });
      // ★ rAF 만 믿으면 «영원히» 안 끝난다. 헤드리스에서 창이 가려졌다고 판단되면
      //   requestAnimationFrame 이 아예 안 돈다(실측: 30s CDP 타임아웃으로 러너가
      //   죽었다). 타이머 백업을 둔다 — 대기 자체가 목적이므로 결과는 같다.
      setTimeout(fin, cap || 500);
    });
  };

  /** 뽑기 순서를 로케일 간 «동일»하게 만든다.
   *  ★ 이걸 안 하면 로케일마다 다른 종이 뽑혀서, 같은 자리(.ar-face .nm)를
   *    비교해도 «다른 단어»를 비교하게 된다. 첫 실행에서 실제로 en «Kkang» 과
   *    ja «Beonjjeok» 을 맞대고 «ja 가 2.4배 길다»는 헛수치가 나왔다.
   *    제품 코드는 손대지 않는다 — 페이지의 Math.random 만 결정적으로 바꾼다. */
  window.__seedRandom = function (seed) {
    var a = seed >>> 0;
    Math.random = function () {
      a = (a + 0x6d2b79f5) >>> 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  /** 화면이 «실제로 그 화면인지» 확인한다.
   *  ★ 캡처(측정)를 증거로 쓰기 전에 검증대상이 그 프레임에 있는지 먼저 본다.
   *    화면이 안 열렸는데 «요소 0개라 결함 0» 로 통과시키는 게 가장 흔한 거짓 PASS 다. */
  window.__evidence = function (selector, minCount) {
    var n = document.querySelectorAll(selector).length;
    return { selector: selector, found: n, ok: n >= (minCount || 1) };
  };

  /** 가챠 «뽑기» 버튼을 더 못 뽑을 때까지 눌러가며 매 결과 카드를 측정한다.
   *  종 수를 세지 않는다 — 버튼이 죽을 때까지 돈다. 로스터가 24종이 되든 40종이
   *  되든 이 루프는 그대로다. */
  window.__drawAll = function (limit) {
    var results = [];
    var max = limit || 200;
    return (function step(i) {
      var btn = document.querySelector('.ar-btn.gacha.big, .ar-btn.big.gacha');
      if (!btn || btn.disabled || i >= max) return Promise.resolve(results);
      btn.click();
      return window.__settle(40, 200).then(function () {
        var nm = document.querySelector('.ar-face.front .nm');
        var a = window.__audit();
        a.drawIndex = i;
        a.drawnName = nm ? nm.textContent : null;
        results.push(a);
        return step(i + 1);
      });
    })(0);
  };
})();
