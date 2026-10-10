// ui/stageClear.ts — 스테이지 클리어 «별 획득 연출».
//
// ┌ 사용법 (main.ts 배선) ────────────────────────────────────────────────────
// │ import { showStageClear } from './ui/stageClear';
// │ const r = judgeStars(tierDef, score, rotations, revives, reachedGoal); // game/stages.ts
// │ recordStageResult(progress, stage.id, r.stars);                        // ui/meta.ts
// │ showStageClear({
// │   progress, locale, info: { stage, stars: r.stars, score, rotations,
// │                            gemsAwarded, unlockedStage },
// │   onNext: () => { /* 마일스톤이면 openGacha, 아니면 openStageSelect */ },
// │ });
// └───────────────────────────────────────────────────────────────────────────
// ★ 별 판정은 game/stages.ts 의 judgeStars() 가 한다. 이 화면은 «결과만» 연출한다
//   (여기서 별 개수를 다시 계산하지 않는다 — 단일 소스).
// ★ 첫 사이클 요건: 1스테이지 클리어 → 별 연출 → (마일스톤이면) 가챠 자동 노출.
//   그 «자동 전환»은 onNext 콜백에서 호출부가 결정한다.
import { el, prefersReducedMotion } from './dom';
import { icon } from './icons';
import { createModal } from './overlay';
import type { ScreenHandle } from './overlay';
import { ut, detectLocale } from './uiStrings';
import type { Locale } from '../i18n';
import type { MetaProgress, StageInfo } from './meta';

export interface StageClearInfo {
  stage: StageInfo;
  stars: number; // judgeStars() 결과
  score: number;
  rotations: number;
  /** 이번 클리어로 지급된 보석(마일스톤 보상 등). 0/미지정이면 표시 안 함. */
  gemsAwarded?: number;
  /** 이번 클리어로 새로 열린 스테이지(있으면 안내 문구 노출). */
  unlockedStage?: StageInfo;
}

export interface StageClearOptions {
  progress: MetaProgress;
  locale?: Locale;
  info: StageClearInfo;
  onNext: () => void;
  onClose?: () => void;
}

export const STAGE_CLEAR_NEXT_EVENT = 'ar:stage-clear-next';

const STAR_STAGGER_MS = 260;

export function showStageClear(opts: StageClearOptions): ScreenHandle {
  const locale = opts.locale ?? detectLocale();
  const info = opts.info;
  let closed = false;
  const timers: number[] = [];

  const modal = createModal({
    titleText: ut(locale, 'clear.title'),
    closeButton: false, // 확인(다음)을 눌러야 넘어간다 — 연출을 놓치지 않게.
    dismissOnScrim: false,
    onClose: () => next(),
  });

  // 별 3개(최대치는 티어 스펙에서 온다 — 3 하드코딩 아님)
  const starNodes: HTMLElement[] = [];
  const starWrap = el('span', {
    class: 'ar-stars lg',
    role: 'img',
    ariaLabel: `${info.stars}/${info.stage.maxStars}`,
  });
  for (let i = 0; i < info.stage.maxStars; i++) {
    const s = el('span', { class: i < info.stars ? 'ar-star on' : 'ar-star off' });
    s.appendChild(icon('star'));
    starNodes.push(s);
    starWrap.appendChild(s);
  }

  // ★ 이 화면에 «행동은 하나»뿐이다. 중립 스타일로 두면 유일한 출구가 눈에 띄지
  //   않는다 — primary(--go) 로 명시한다.
  const nextBtn = el('button', {
    class: 'ar-btn primary big',
    type: 'button',
    text: ut(locale, 'clear.next'),
    on: { click: () => next() },
  });

  const rows: Array<Node | null> = [
    el('div', { class: 'ar-clear-h', text: ut(locale, 'stage.stage', { n: info.stage.number }) }),
    starWrap,
    el('div', { class: 'ar-kv' }, [
      el('span', { text: `${ut(locale, 'clear.score')} ${info.score}` }),
      el('span', { text: `${ut(locale, 'clear.rot')} ${info.rotations}` }),
    ]),
    info.gemsAwarded
      ? el('div', { class: 'ar-reward', text: ut(locale, 'clear.reward', { n: info.gemsAwarded }) })
      : null,
    info.unlockedStage
      ? el('div', {
          class: 'ar-note',
          text: ut(locale, 'clear.unlocked', { n: info.unlockedStage.number }),
        })
      : null,
    nextBtn,
  ];
  modal.body.appendChild(el('div', { class: 'ar-clear' }, rows));

  function playStarAnim(): void {
    if (prefersReducedMotion()) {
      starNodes.forEach((n) => n.classList.add('pop'));
      return;
    }
    starNodes.forEach((n, i) => {
      timers.push(window.setTimeout(() => n.classList.add('pop'), 120 + i * STAR_STAGGER_MS));
    });
  }

  function next(): void {
    if (closed) return;
    handle.close();
    opts.onNext();
    window.dispatchEvent(new CustomEvent(STAGE_CLEAR_NEXT_EVENT, { detail: { info } }));
  }

  const handle: ScreenHandle = {
    panel: modal.panel,
    isOpen: () => modal.isOpen() && !closed,
    refresh: () => {},
    close: () => {
      if (closed) return;
      closed = true;
      timers.forEach((t) => window.clearTimeout(t));
      modal.destroy();
      opts.onClose?.();
    },
  };

  modal.open();
  playStarAnim();
  return handle;
}
