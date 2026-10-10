// ui/hud-overlay.ts — 플레이 중 화면 «아래쪽» 메타 진입 바.
//
// ┌ 사용법 (main.ts 배선) ────────────────────────────────────────────────────
// │ import { createHudOverlay } from './ui/hud-overlay';
// │ const bar = createHudOverlay({
// │   progress, locale,
// │   onOpenStages: () => openStageSelect({...}),
// │   onOpenRoster: () => openRoster({...}),
// │   onOpenGacha:  () => openGacha({...}),
// │ });
// │ bar.refresh();           // 별/보석 숫자 갱신(스테이지 클리어·가챠 후)
// │ bar.setVisible(false);   // 런 중 몰입이 필요하면 잠시 숨김
// └───────────────────────────────────────────────────────────────────────────
//
// ★ 온보딩 원칙: 로드 즉시 «플레이가 시작»된다. 여기 버튼은 메뉴가 아니라
//   플레이 위에 얹히는 진입점이다 — 앱을 이 바가 막지 않는다(pointer-events 는
//   버튼에만 있고 나머지 영역은 캔버스로 그대로 통과한다).
// ★ 기존 #hud(디버그 텍스트, main.ts 소유)와 다른 요소다. 건드리지 않는다.
import { el } from './dom';
import { icon } from './icons';
import { overlayRoot } from './dom';
import { ensureStyles } from './styles';
import { ut, detectLocale } from './uiStrings';
import type { Locale } from '../i18n';
import { MAX_TOTAL_STARS, collectionStatus, totalStars } from './meta';
import type { MetaProgress } from './meta';
import { canDrawGacha } from './drawGate';

export interface HudOverlayOptions {
  progress: MetaProgress;
  locale?: Locale;
  onOpenStages: () => void;
  onOpenRoster: () => void;
  onOpenGacha: () => void;
  /**
   * 가챠 버튼 강조 판정(선택). 미지정이면 ui/drawGate.ts 의 canDrawGacha() 를 쓴다
   * — 나중에 시간게이트·광고보상이 붙으면 그쪽만 고치면 여기 강조도 같이 따라간다.
   */
  canDraw?: () => boolean;
}

export interface HudOverlay {
  readonly root: HTMLElement;
  refresh(): void;
  setVisible(v: boolean): void;
  destroy(): void;
}

export function createHudOverlay(opts: HudOverlayOptions): HudOverlay {
  ensureStyles();
  const locale = opts.locale ?? detectLocale();
  const p = opts.progress;

  // ★ 칩 = 아이콘 + 숫자. 아이콘 노드를 «한 번만» 만들고 숫자 노드만 갱신한다
  //   — 매 refresh 마다 textContent 로 통째로 갈아끼우면 아이콘까지 다시 그려진다.
  const starNum = el('span', {});
  const gemNum = el('span', {});
  const starChip = el('span', { class: 'ar-chip' }, [icon('star', 't-star'), starNum]);
  const gemChip = el('span', { class: 'ar-chip' }, [icon('diamond', 't-gem'), gemNum]);

  const stagesBtn = el('button', {
    class: 'ar-btn',
    type: 'button',
    text: ut(locale, 'nav.stages'),
    on: { click: () => opts.onOpenStages() },
  });
  const rosterBtn = el('button', {
    class: 'ar-btn',
    type: 'button',
    on: { click: () => opts.onOpenRoster() },
  });
  const gachaBtn = el('button', {
    class: 'ar-btn gacha',
    type: 'button',
    text: ut(locale, 'nav.gacha'),
    on: { click: () => opts.onOpenGacha() },
  });

  // ★ 레이아웃: 재화 칩은 «우상단», 이동 버튼은 «하단». 한 줄에 다 넣으면 390px
  //   세로폰에서 두 줄로 접힌다(실측: hudRows=2). 좌상단은 main.ts 의 #hud(디버그
  //   텍스트)가 쓰므로 피한다.
  const top = el('div', { class: 'ar-hudtop' }, [starChip, gemChip]);
  const bar = el('div', { class: 'ar-hudbar', role: 'toolbar' }, [
    stagesBtn,
    rosterBtn,
    gachaBtn,
  ]);
  bar.setAttribute('aria-label', ut(locale, 'nav.stages'));
  const root = overlayRoot();
  root.appendChild(top);
  root.appendChild(bar);

  function refresh(): void {
    const stars = totalStars(p);
    starNum.textContent = `${stars}/${MAX_TOTAL_STARS}`;
    starChip.setAttribute('aria-label', ut(locale, 'stage.total', { a: stars, b: MAX_TOTAL_STARS }));

    gemNum.textContent = `${p.gacha.gems}`;
    gemChip.setAttribute('aria-label', `${ut(locale, 'gacha.gems')} ${p.gacha.gems}`);

    const col = collectionStatus(p);
    rosterBtn.textContent = `${ut(locale, 'nav.roster')} ${col.owned}/${col.total}`;

    // 뽑을 수 있으면 눈에 띄게(수집·성장이 «보여야» 한다는 요건).
    // 뽑을 수 있으면 재화색(--prize)으로 «튀게», 아니면 중립으로 가라앉힌다.
    // ★ 'ghost' 클래스는 개편에서 없어졌다(중립이 기본값이 됐다). 토글 대상은
    //   'gacha' 하나뿐 — 없는 클래스를 토글하면 조용히 아무 일도 안 일어난다.
    const can = opts.canDraw ? opts.canDraw() : canDrawGacha(p).allowed;
    gachaBtn.classList.toggle('gacha', can);
  }

  refresh();

  return {
    root: bar,
    refresh,
    setVisible(v: boolean) {
      bar.style.display = v ? '' : 'none';
      top.style.display = v ? '' : 'none';
    },
    destroy() {
      bar.remove();
      top.remove();
    },
  };
}
