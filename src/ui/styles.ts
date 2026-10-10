// ui/styles.ts — UI 전용 CSS 1장(런타임 주입).
// ★ index.html 의 <style> 을 건드리지 않기 위해 여기서 <style id="ar-ui-css"> 를
//   1회만 주입한다(캔버스·HUD 기존 스타일과 충돌 없음, 전부 .ar-* 프리픽스).
// ★ 모바일 세로 우선: 터치 타깃 44px 이상, safe-area 인셋, 100dvh(주소창 대응).
//
// ─────────────────────────────────────────────────────────────────────────────
// 디자인 시스템 — 「스티커」 (2026-08-18 개편)
// ─────────────────────────────────────────────────────────────────────────────
// ★ 문제였던 것: UI 가 «게임과 다른 제품»처럼 보였다. 게임 그림은 진한 외곽선 +
//   납작한 원색 + 단단한 그림자인데, UI 는 흰 알약 + 흐린 그림자 + 시스템폰트라
//   완성된 일러스트 위에 얹힌 «디버그 오버레이»로 읽혔다.
//
// ★ 해법: UI 도 게임과 «같은 펜»으로 그린다. 모든 떠 있는 표면은 스티커다 —
//     진한 외곽선(--keyline) + 납작한 단색 + 흐림 0 의 단단한 그림자(--drop).
//   이 한 수가 «동시에» 세 문제를 푼다:
//     ① 정체성 — 게임 그림체와 같은 언어가 된다.
//     ② 대비   — 배경을 «가정하지 않고» 대비를 확보한다. 존 6개가 눈밭(거의 흰색)
//        부터 용암(거의 검정)까지 바뀌는데, 흰 알약은 눈밭에서 실측 대비 1.32:1 로
//        «사라졌다». 2px 진한 외곽선은 밝은 배경에서 외곽선이, 어두운 배경에서
//        밝은 면이 각각 분리를 보장한다 — 어느 쪽이든 한 겹은 반드시 살아난다.
//     ③ 카드 남용 — 스티커는 «오려낸 물체»지 콘텐츠 상자가 아니다. 도감을 동일
//        카드 24장 격자에서 «선반 위 오려낸 형상»으로 바꾸는 근거가 된다.
//
// ★ 색 역할은 «하나씩만». 장식으로 쓰지 않는다(어기면 시스템이 무너진다):
//     --go     파랑  = 진행/이동/기본 행동. 그 외 금지.
//     --prize  주황  = 재화·보상 «만». 일반 버튼에 쓰지 않는다.
//     --star   호박  = 별 «만». 포커스 링에 쓰지 않는다(별과 같은 색이면 신호가 죽는다).
//   나머지는 전부 중립(--ink 계열). = 절제(Restrained) 팔레트.
//
// ★ 모서리 반경도 규칙이 있다. 3단뿐이고 예외 없다:
//     --r-pill 알약 = 누르는 것·상태 칩 / --r-tile 14px = 타일·스티커 / --r-panel 22px = 패널
//
// ★ 색은 OKLCH 로 정하되 «hex 를 먼저» 선언한다. 구형 웹뷰(itch/CrazyGames 임베드)가
//   oklch() 를 모르면 그 줄을 통째로 무시하고 앞의 hex 를 그대로 쓴다 — UI 가
//   투명해져 사라지는 사고를 막는 표준 폴백 패턴이다. 한 줄만 지우지 말 것.

const CSS = `
.ar-root{
  /* ── 잉크: 게임 그림의 «외곽선 색»에서 뽑았다(실측 샘플 #391a03/#08512a —
        순수 검정이 아니라 따뜻한 짙은 갈녹색). 순수 #000 은 쓰지 않는다. */
  --ink:      #1b2a1c;  --ink:      oklch(0.26 0.030 145);
  --ink-2:    #4a5c4b;  --ink-2:    oklch(0.46 0.024 148);
  /* ★ L 은 «취향이 아니라 계산»으로 정했다. 0.56 이면 paper-2(선반) 위에서
     3.87:1 로 4.5 미달이다. 0.52 에서 paper-2 4.54 / paper 5.20 으로 둘 다 통과. */
  --ink-3:    #606d63;  --ink-3:    oklch(0.52 0.022 152);
  --paper:    #f8fbf7;  --paper:    oklch(0.983 0.006 145);
  --paper-2:  #e9efe8;  --paper-2:  oklch(0.938 0.010 145);
  --paper-3:  #dae3d9;  --paper-3:  oklch(0.895 0.012 145);

  --go:       #1f5fd8;  --go:       oklch(0.505 0.185 260);
  --go-ink:   #ffffff;
  --prize:    #b8500a;  --prize:    oklch(0.545 0.150 52);
  --prize-ink:#ffffff;
  --star:     #f0a500;  --star:     oklch(0.775 0.155 78);
  --star-off: #b3bfb2;  --star-off: oklch(0.78 0.012 145);

  --keyline: 2px;
  --r-pill: 999px;
  --r-tile: 14px;
  --r-panel: 22px;

  /* 단단한 그림자 = 게임 그림의 드롭. 흐림 0, 잉크색. */
  --drop-1: 0 2px 0 var(--ink);
  --drop-2: 0 4px 0 var(--ink);
  /* 캔버스 위에 뜬 것만 «떠 있음»을 부드럽게 한 겹 더 받쳐준다(정적, 애니 없음) */
  --lift: 0 4px 12px rgba(12,24,14,.28);

  /* 모션: impeccable 지침대로 지수형 ease-out. 튕김/탄성 없음.
     예외는 별 연출 하나뿐이고 그 자리에 이유를 적어뒀다. */
  --ease: cubic-bezier(0.22, 1, 0.36, 1);
  --t-fast: 120ms;
  --t-mid: 200ms;

  position:fixed;inset:0;z-index:50;pointer-events:none;
  font-family:system-ui,-apple-system,'Segoe UI',Roboto,'Noto Sans KR','Apple SD Gothic Neo',sans-serif;
  color:var(--ink);-webkit-tap-highlight-color:transparent;
  font-variant-numeric:tabular-nums;
}
.ar-root *{box-sizing:border-box;}

/* ★ index.html 의 «전역» canvas 규칙이 여기까지 샌다:
     canvas{background:#7FCFF2; width:100vw; height:100vh}  ← 게임 캔버스용이다.
   도감·뽑기의 초상화도 <canvas> 라 그대로 맞으면 «하늘색 사각형»이 깔린다
   (실측: 뽑기 공개 카드에 하늘색 배경이 찍혔다). 각 초상화 클래스가 개별로
   막고 있었지만 새 초상화를 추가할 때마다 잊기 쉬운 함정이라, 오버레이 안의
   캔버스는 여기서 «한 번에» 무력화한다. 크기는 각 클래스가 정한다. */
.ar-root canvas{background:transparent;width:auto;height:auto;display:block;}

/* 아이콘: 이모지 대체(Phosphor, ui/icons.ts). 글자와 «광학 중심»을 맞춘다. */
.ar-i{display:inline-block;vertical-align:-0.14em;flex:0 0 auto;}
/* ★ 별·보석은 텍스트가 아니라 «의미를 지닌 그래픽»이다(WCAG 1.4.11 → 3:1).
   호박색 별은 밝은 종이 위에서 1.99:1 밖에 안 나온다 — 색을 어둡게 하면 별이
   별처럼 안 보인다. 그래서 «칠을 바꾸지 않고 외곽선을 준다». 대비는 외곽선이
   책임지고 색은 정체성만 진다. 게임 그림(진한 외곽선)과 같은 수이기도 하다.
   paint-order:stroke — 선을 먼저 깔아야 획이 안쪽을 파먹지 않는다. */
.ar-i.t-star,.ar-i.t-gem,.ar-star .ar-i{
  stroke:var(--ink);stroke-width:18;stroke-linejoin:round;paint-order:stroke fill;
  overflow:visible;}

/* ── z-index 는 «의미 계단». 999/9999 같은 임의값 금지 ──────────────────── */
/*    hudbar 1 → toast 2 → scrim 3 → panel 4                                 */

/* ── 인게임 HUD 바 ─────────────────────────────────────────────── */
.ar-hudbar{position:absolute;left:0;right:0;bottom:0;z-index:1;
  display:flex;gap:10px;align-items:flex-end;justify-content:center;flex-wrap:nowrap;
  padding:10px calc(10px + env(safe-area-inset-right)) calc(10px + env(safe-area-inset-bottom)) calc(10px + env(safe-area-inset-left));
  pointer-events:none;}
.ar-hudbar>*{pointer-events:auto;}
/* 재화 칩은 «우상단» — 좌상단은 main.ts 의 #hud(디버그 텍스트)가 쓴다. */
.ar-hudtop{position:absolute;top:calc(8px + env(safe-area-inset-top));
  right:calc(10px + env(safe-area-inset-right));display:flex;flex-direction:column;
  align-items:flex-end;gap:6px;pointer-events:none;z-index:1;}

/* ── 스티커 원형(primitive) ─────────────────────────────────────
   캔버스 위에 뜨는 «모든» 것이 이걸 상속한다. 배경을 가정하지 않는 대비의 근거. */
.ar-sticker{border:var(--keyline) solid var(--ink);box-shadow:var(--drop-1),var(--lift);}

.ar-chip{display:inline-flex;align-items:center;gap:6px;min-height:34px;padding:5px 12px;
  border-radius:var(--r-pill);background:var(--paper);color:var(--ink);
  border:var(--keyline) solid var(--ink);box-shadow:var(--drop-1),var(--lift);
  font-size:14px;font-weight:800;line-height:1;letter-spacing:-0.01em;}
.ar-chip .ar-i{font-size:15px;}
.ar-chip .ar-i.t-star{color:var(--star);}
/* 보석 = 재화다. --go(파랑=진행) 가 아니라 --prize 를 쓴다 — 뽑기 버튼과 같은 색이
   되면서 「이 숫자로 저걸 산다」가 색만으로 이어진다. 역할색 규칙을 지킨 결과다. */
.ar-chip .ar-i.t-gem{color:var(--prize);}

.ar-btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;
  min-height:46px;min-width:46px;padding:11px 18px;border-radius:var(--r-pill);
  border:var(--keyline) solid var(--ink);
  background:var(--paper);color:var(--ink);
  font-family:inherit;font-size:15px;font-weight:800;line-height:1;letter-spacing:-0.01em;
  white-space:nowrap;
  cursor:pointer;box-shadow:var(--drop-2),var(--lift);
  transition:transform var(--t-fast) var(--ease),box-shadow var(--t-fast) var(--ease),
             background-color var(--t-fast) var(--ease);}
/* 눌림 = «스티커가 종이에 닿는다». 그림자가 사라지며 그만큼 내려간다(물리적으로 일관). */
.ar-btn:active{transform:translateY(4px);box-shadow:0 0 0 var(--ink),var(--lift);}
.ar-btn:hover:not([disabled]){background:#fff;}
/* 포커스 링: 별색(호박)을 쓰지 않는다 — 별과 같은 색이면 신호가 겹친다.
   «흰+잉크» 2겹이라 밝은 배경에서도 어두운 배경에서도 반드시 보인다. */
.ar-btn:focus-visible,.ar-tile:focus-visible,.ar-x:focus-visible{
  outline:none;box-shadow:0 0 0 3px #fff,0 0 0 6px var(--ink),var(--drop-2);}
.ar-btn[disabled]{opacity:.55;cursor:default;box-shadow:none;transform:none;}
.ar-btn.primary{background:var(--go);color:var(--go-ink);}
.ar-btn.primary:hover:not([disabled]){background:#2a6ee8;}
.ar-btn.gacha{background:var(--prize);color:var(--prize-ink);}
.ar-btn.gacha:hover:not([disabled]){background:#c85a10;}
.ar-btn.big{font-size:17px;padding:15px 28px;min-height:54px;}
/* 좁은 세로 폰(390px 등)에서 메타 바가 «한 줄»을 유지하도록 조인다. 44px 하한은 지킨다. */
@media (max-width:430px){
  .ar-hudbar{gap:7px;}
  .ar-chip{font-size:13px;padding:5px 10px;min-height:32px;gap:5px;}
  .ar-btn{font-size:13.5px;padding:10px 12px;min-height:46px;}
}
@media (max-width:360px){
  .ar-btn{font-size:12.5px;padding:10px 9px;gap:5px;}
}

/* ── 조작 안내 토스트(온보딩 ①) ────────────────────────────────── */
/* pointer-events:none — 안내가 «플레이를 막지 않는다». 탭이 캔버스로 그대로 간다. */
/* ★ 위치: 화면 «위쪽 1/6» — 좌상단 디버그 HUD(#hud, main.ts 소유)와 하단 메타 바를
   둘 다 피한다. 상단에 딱 붙이면 #hud 텍스트와 겹친다(실측). */
.ar-toast{position:absolute;left:50%;top:clamp(56px,16vh,180px);z-index:2;
  transform:translate(-50%,-10px);display:inline-flex;align-items:center;gap:9px;
  max-width:min(92vw,420px);padding:11px 18px;border-radius:var(--r-pill);
  background:var(--ink);color:#fff;border:var(--keyline) solid var(--ink);
  font-size:14px;font-weight:700;line-height:1.35;letter-spacing:-0.01em;
  box-shadow:var(--lift);opacity:0;
  transition:opacity var(--t-mid) var(--ease),transform var(--t-mid) var(--ease);
  pointer-events:none;text-align:center;}
.ar-toast.in{opacity:1;transform:translate(-50%,0);}
.ar-toast .ar-i{font-size:19px;color:var(--star);}
.ar-toast .sep{opacity:.5;font-weight:400;}
.ar-toast b{font-weight:800;}

/* ── 일일 접속 보상 토스트 ─────────────────────────────────────
   조작 안내와 «같은 스티커»를 쓴다. 새 색·새 반경·새 그림자 0.
   ★ 아이콘만 흰색으로 되돌린다: 기본 --star(호박)는 「별」 전용 역할색이라
     보석에 쓰면 신호가 겹치고, 재화색 --prize(#b8500a)는 잉크 바탕에서
     대비 2.2:1 로 무너진다. 어두운 스티커 위 정직한 선택은 흰색이다.
   ★ 줄바꿈 — 여기서 한 번 틀렸다. 처음엔 안쪽 줄을 flex-wrap:wrap 으로 짰는데
     360px 실측에서 토스트 폭이 «180px 로 눌리고» 9개 로케일 전부 2~3행이 됐다.
     원인: 다중행 flex 컨테이너의 max-content 기여분이 «가장 넓은 항목 하나»로
     계산돼(크로미움), 부모의 shrink-to-fit 이 그 좁은 값을 집는다. 폭이 남아도
     접힌다. ⇒ flex 를 걷어내고 «보통 인라인 텍스트»로 되돌린다. 그러면
     max-content = 문자열 전체 폭이라 자리가 있으면 한 줄로 편다.
   ★ 조각(.seg) 안에서는 끊지 않는다(nowrap). 줄이 정 모자라면 「보석 +320」과
     「접속 3/30일」 «사이»에서만 접힌다 — 숫자가 갈라지지 않는다.
     고정폭은 가정하지 않는다: max-width:min(92vw,420px) 가 상한을 지킨다. */
.ar-toast.daily .ar-i{color:#fff;}
.ar-toast .seg{white-space:nowrap;}

/* ── 모달 공통 ─────────────────────────────────────────────────── */
.ar-scrim{position:absolute;inset:0;z-index:3;background:rgba(14,26,16,.55);opacity:0;
  transition:opacity var(--t-mid) var(--ease);pointer-events:auto;}
.ar-scrim.in{opacity:1;}
.ar-panel{position:absolute;left:50%;bottom:0;z-index:4;transform:translate(-50%,18px);
  width:min(560px,100%);max-height:min(92dvh,92vh);display:flex;flex-direction:column;opacity:0;
  background:var(--paper);border:var(--keyline) solid var(--ink);border-bottom:0;
  border-radius:var(--r-panel) var(--r-panel) 0 0;box-shadow:0 -8px 32px rgba(12,24,14,.4);
  pointer-events:auto;
  transition:transform var(--t-mid) var(--ease),opacity var(--t-mid) var(--ease);}
.ar-panel.in{transform:translate(-50%,0);opacity:1;}
.ar-panel:focus{outline:none;}
@media (min-height:760px){
  .ar-panel{bottom:auto;top:50%;transform:translate(-50%,-46%);
    border-radius:var(--r-panel);border-bottom:var(--keyline) solid var(--ink);}
  .ar-panel.in{transform:translate(-50%,-50%);}
}
/* 데스크톱: 패널을 그대로 늘리지 않는다(읽기 폭 유지). 대신 «격자»가 넓어진다. */
@media (min-width:900px){.ar-panel{width:min(680px,100%);}}

.ar-head{display:flex;align-items:center;gap:12px;padding:15px 16px 13px;
  border-bottom:var(--keyline) solid var(--paper-3);flex:0 0 auto;}
/* 타이포 계층: 20 / 15 / 13.5 / 12.5 — 비율 ~1.15, 굵기는 800/700/600/500 로 «갈린다».
   전부 800 이면 굵기가 아무 신호도 주지 못한다(개편 전 상태). */
.ar-title{font-size:20px;font-weight:800;letter-spacing:-0.025em;margin:0;flex:0 0 auto;}
.ar-head .ar-spacer{flex:1 1 auto;}
.ar-count{font-size:13.5px;font-weight:600;color:var(--ink-2);white-space:nowrap;}
.ar-x{display:inline-flex;align-items:center;justify-content:center;
  width:44px;height:44px;min-width:44px;
  border:var(--keyline) solid var(--ink);border-radius:var(--r-pill);
  background:var(--paper-2);color:var(--ink);font-size:15px;line-height:1;cursor:pointer;
  box-shadow:var(--drop-1);
  transition:transform var(--t-fast) var(--ease),box-shadow var(--t-fast) var(--ease);}
.ar-x:active{transform:translateY(2px);box-shadow:none;}
.ar-body{overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;
  padding:16px 16px calc(20px + env(safe-area-inset-bottom));}

/* 간격 리듬: 섹션 사이 26 / 섹션 안 10 / 격자 10 — 전부 8 로 균일하지 «않다». */
.ar-sec{margin:0 0 26px;}
.ar-sec:last-child{margin-bottom:0;}
.ar-sec-h{display:flex;align-items:center;gap:9px;margin:0 0 10px;
  font-size:15px;font-weight:800;color:var(--ink);letter-spacing:-0.02em;}
.ar-sec-h .sub{font-size:12.5px;font-weight:600;color:var(--ink-3);letter-spacing:0;}
.ar-sec-h .rule{flex:1 1 auto;height:2px;background:var(--paper-3);border-radius:1px;}

/* ── 스테이지 선택 ─────────────────────────────────────────────── */
.ar-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(68px,1fr));gap:10px;}
.ar-tile{position:relative;aspect-ratio:1/1;min-height:68px;
  border:var(--keyline) solid var(--ink);border-radius:var(--r-tile);
  background:var(--paper);color:var(--ink);font-family:inherit;
  box-shadow:var(--drop-1);display:flex;flex-direction:column;
  align-items:center;justify-content:center;gap:3px;cursor:pointer;padding:4px;
  transition:transform var(--t-fast) var(--ease),box-shadow var(--t-fast) var(--ease);}
.ar-tile:active:not([disabled]){transform:translateY(2px);box-shadow:none;}
.ar-tile .num{font-size:18px;font-weight:800;letter-spacing:-0.03em;}
/* 잠금 = «비어 있음». 회색 글자를 더 흐리게 하는 대신 «면»으로 눌러 표현한다
   — 개편 전엔 대비 2.10:1 로 숫자가 읽히지 않았다(실측). */
.ar-tile.locked{background:var(--paper-3);color:var(--ink-2);cursor:not-allowed;
  box-shadow:none;border-style:dashed;border-color:var(--ink-3);}
.ar-tile.locked .num{color:var(--ink-2);opacity:.75;}
.ar-tile.locked .ar-i{color:var(--ink-2);}
/* 완주(만점) = 별색 면. 「깼다」와 「다 깼다」가 한눈에 갈린다. */
.ar-tile.done{background:#ffeec2;}
/* 지금 밀어야 할 곳 — 유일하게 --go 를 쓴다. */
.ar-tile.next{background:var(--go);color:var(--go-ink);}
.ar-tile.next .num{color:var(--go-ink);}
.ar-stars{display:inline-flex;gap:2px;line-height:0;}
.ar-star{font-size:11px;color:var(--star-off);}
.ar-star.on{color:var(--star);}
.ar-tile.next .ar-star{color:rgba(255,255,255,.45);}
.ar-tile.next .ar-star.on{color:#ffd772;}
.ar-stars.lg{gap:8px;}
.ar-stars.lg .ar-star{font-size:34px;}
.ar-note{font-size:12.5px;font-weight:500;color:var(--ink-2);margin:8px 2px 0;line-height:1.45;}
/* 존 이름표 — 티어 안에서 «세계»가 바뀌는 지점. 자체 배경 위 글자라 대비를 만든다
   (존 강조색을 그냥 글자에 쓰면 초원 2.64:1·모래바람 2.16:1 로 읽히지 않았다). */
.ar-zone{display:inline-flex;align-items:center;gap:7px;margin:14px 0 8px;
  padding:4px 11px 4px 8px;border-radius:var(--r-pill);
  border:var(--keyline) solid var(--ink);background:var(--paper-2);
  font-size:12.5px;font-weight:700;color:var(--ink);letter-spacing:-0.01em;}
.ar-zone .dot{width:11px;height:11px;border-radius:50%;flex:0 0 auto;
  border:1.5px solid var(--ink);}
.ar-sec>.ar-zone:first-child{margin-top:0;}

/* ── 로스터(도감) ──────────────────────────────────────────────
   ★ 개편 전: 동일한 흰 카드 24장 격자 = impeccable 「Identical card grids」 정면 위반.
     지금: 보유 종은 «상자가 없다» — 등급별 선반(--paper-2) 위에 오려낸 형상만 놓인다.
     상자를 지우니 그림이 주인공이 되고, 반복되는 테두리 24개가 사라졌다.
     미보유만 «채워야 할 빈 슬롯»으로 점선 상자를 «의도적으로» 갖는다 — 상자의 유무
     자체가 보유/미보유 신호다(색만으로 구분하지 않는다). */
.ar-shelf{display:grid;grid-template-columns:repeat(auto-fill,minmax(84px,1fr));gap:6px 4px;
  padding:12px 8px;border-radius:var(--r-tile);
  background:var(--paper-2);border:var(--keyline) solid var(--paper-3);}
.ar-crit{display:flex;flex-direction:column;align-items:center;gap:1px;text-align:center;
  padding:4px 2px;border-radius:var(--r-tile);background:transparent;}
.ar-crit .face{font-size:26px;line-height:1.2;}
.ar-crit .face-art{display:block;width:46px;height:46px;margin:0 auto;background:transparent;}
.ar-crit .nm{font-size:13px;font-weight:700;letter-spacing:-0.02em;margin-top:3px;}
.ar-crit .an{font-size:11.5px;font-weight:500;color:var(--ink-3);}
/* 등급색은 «선반 한 장»이 진다. 종 24개에 각각 등급 테두리를 두르면 개편 전의
   카드 격자가 이름만 바꿔 되살아난다. 섹션 제목이 이미 등급을 말하고 있으므로
   여기 색은 «확인»일 뿐 — 아주 얕게. */
.ar-shelf.g-COMMON{background:#eceee9;}
.ar-shelf.g-RARE{background:#e8f1fb;border-color:#c6dcf3;}
.ar-shelf.g-EPIC{background:#f1eafb;border-color:#dccbf2;}
.ar-shelf.g-SPECIAL{background:#fdf3e0;border-color:#f0dcb2;}
.ar-crit.miss{border:2px dashed var(--ink-3);background:var(--paper);}
.ar-crit.miss .face,.ar-crit.miss .face-art{opacity:.3;}
/* 빈 슬롯의 물음표는 «가구»다 — 옆의 진짜 동물 그림보다 조용해야 한다.
   꽉 찬 원이 실루엣만큼 무거워지면 빈 칸이 더 눈에 띄는 역전이 생긴다. */
.ar-crit.miss .ar-i.t-unknown{font-size:24px;color:var(--ink-3);opacity:.5;}
.ar-crit.miss .nm{color:var(--ink-2);letter-spacing:0.08em;}
.ar-prog{width:100%;height:6px;border-radius:var(--r-pill);background:var(--paper-3);
  border:1px solid var(--ink-3);overflow:hidden;margin-top:5px;}
.ar-prog>i{display:block;height:100%;background:var(--go);}
.ar-cond{font-size:10.5px;font-weight:600;color:var(--ink-2);margin-top:3px;}

/* ── 가챠 ──────────────────────────────────────────────────────── */
.ar-gacha{display:flex;flex-direction:column;align-items:center;gap:16px;padding:6px 0 2px;}
.ar-stage3d{perspective:900px;width:154px;height:206px;}
.ar-card{position:relative;width:100%;height:100%;transform-style:preserve-3d;
  transition:transform 550ms var(--ease);}
.ar-card.flip{transform:rotateY(180deg);}
.ar-face{position:absolute;inset:0;border-radius:18px;backface-visibility:hidden;
  -webkit-backface-visibility:hidden;display:flex;flex-direction:column;align-items:center;
  justify-content:center;gap:8px;padding:12px;text-align:center;
  border:var(--keyline) solid var(--ink);box-shadow:var(--drop-2);}
/* 뒷면: 그라디언트를 걷어냈다(단색 + 문양). 그라디언트는 여기서 «의미»가 없다. */
.ar-face.back{background:var(--go);color:#fff;}
.ar-face.back .ar-i{font-size:56px;opacity:.9;}
.ar-face.front{background:var(--paper);transform:rotateY(180deg);}
.ar-face.front.g-RARE{background:#eef6ff;}
.ar-face.front.g-EPIC{background:#f6eeff;}
.ar-face.front.g-SPECIAL{background:#fff6e2;}
.ar-face .big{font-size:44px;line-height:1;}
/* 공개 카드 초상화. gacha.ts REVEAL_PX 와 «같은 값». */
.ar-face .big-art{display:block;width:76px;height:76px;}
.ar-face .nm{font-size:19px;font-weight:800;letter-spacing:-0.025em;}
.ar-face .an{font-size:12.5px;font-weight:500;color:var(--ink-2);}
.ar-badge{position:absolute;top:-8px;right:-8px;background:var(--prize);color:#fff;
  font-size:10.5px;font-weight:800;padding:4px 9px;border-radius:var(--r-pill);
  border:var(--keyline) solid var(--ink);box-shadow:var(--drop-1);}
.ar-tag{display:inline-flex;align-items:center;font-size:11.5px;font-weight:700;
  padding:3px 10px;border-radius:var(--r-pill);border:1.5px solid var(--ink);
  background:var(--paper-2);color:var(--ink);}
.ar-tag.g-RARE{background:#d5e8fc;}
.ar-tag.g-EPIC{background:#e7d8fb;}
.ar-tag.g-SPECIAL{background:#ffe6b0;}
.ar-msg{min-height:20px;font-size:13.5px;font-weight:600;color:var(--ink-2);text-align:center;}
.ar-msg.warn{color:#a4291d;font-weight:700;}
.ar-pop{animation:ar-pop .4s var(--ease);}
@keyframes ar-pop{0%{transform:scale(.72);opacity:0}100%{transform:scale(1);opacity:1}}

/* ── 스테이지 클리어 ───────────────────────────────────────────── */
.ar-clear{display:flex;flex-direction:column;align-items:center;gap:14px;padding:10px 0;}
/* 클리어 화면의 스테이지 이름. 섹션 헤더(.ar-sec-h)를 빌려 쓰던 자리 —
   여긴 목록의 구분선이 아니라 «연출의 제목»이라 계층이 다르다. */
.ar-clear-h{font-size:17px;font-weight:700;color:var(--ink-2);letter-spacing:-0.02em;}
.ar-clear .ar-star{transform:scale(0);opacity:0;}
/* ★ 여기 «단 한 곳»만 오버슛을 쓴다. impeccable 의 「no bounce」는 제품 UI 규칙이고,
   별 획득은 제품 상태 변화가 아니라 «보상 연출»이다 — 아케이드에서 별이 튀지 않으면
   보상으로 읽히지 않는다. 의도된 예외이며 다른 곳으로 번지게 두지 말 것. */
.ar-clear .ar-star.pop{animation:ar-star-pop .42s cubic-bezier(.2,1.3,.4,1) forwards;}
@keyframes ar-star-pop{from{transform:scale(0) rotate(-40deg);opacity:0}
  to{transform:scale(1) rotate(0);opacity:1}}
.ar-kv{display:flex;gap:10px;flex-wrap:wrap;justify-content:center;}
.ar-kv>span{display:inline-flex;align-items:center;gap:6px;padding:7px 13px;
  border-radius:var(--r-pill);background:var(--paper-2);border:1.5px solid var(--paper-3);
  font-size:13.5px;font-weight:700;color:var(--ink);}
.ar-reward{display:inline-flex;align-items:center;gap:7px;font-size:16px;font-weight:800;
  color:var(--prize);letter-spacing:-0.02em;}

@media (prefers-reduced-motion:reduce){
  .ar-card,.ar-panel,.ar-scrim,.ar-toast,.ar-btn,.ar-tile,.ar-x{transition:none !important;}
  .ar-toast{opacity:1;transform:translate(-50%,0);}
  .ar-pop,.ar-clear .ar-star.pop{animation:none !important;transform:none;opacity:1;}
}
`;

let injected = false;

export function ensureStyles(): void {
  if (injected || typeof document === 'undefined') return;
  if (document.getElementById('ar-ui-css')) {
    injected = true;
    return;
  }
  const tag = document.createElement('style');
  tag.id = 'ar-ui-css';
  tag.textContent = CSS;
  document.head.appendChild(tag);
  injected = true;
}
