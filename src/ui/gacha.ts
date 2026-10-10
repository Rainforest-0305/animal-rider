// ui/gacha.ts — 가챠 화면(보석·가격·뽑기·카드 뒤집기 연출).
//
// ┌ 사용법 (main.ts 배선) ────────────────────────────────────────────────────
// │ import { openGacha } from './ui/gacha';
// │ const screen = openGacha({
// │   progress,                       // MetaProgress — progress.gacha 를 «그대로» 변형한다
// │   locale,
// │   onDrawn: (species) => {},       // 뽑기 성공 시(중복 없음이라 항상 신규)
// │   onClose: () => {},
// │ });
// └───────────────────────────────────────────────────────────────────────────
//
// ★ 경제 로직은 game/gacha.ts 단일 소스다. 이 화면은 nextGachaPrice()/drawGacha()
//   를 «호출»할 뿐 가격(600/+50/1200)이나 확률을 다시 계산하지 않는다.
// ★ 중복 없음 정책(결정4)이라 «중복 뽑기» 결과 화면은 구조적으로 나올 수 없다.
//   대신 나올 수 있는 실패 2종을 명시적으로 표시한다:
//     (a) species=null & cost>0  → 보석 부족
//     (b) species=null & cost=0  → 풀 완주(더 뽑을 종이 없음)
import { el, prefersReducedMotion } from './dom';
import { icon } from './icons';
import { createModal } from './overlay';
import type { ScreenHandle } from './overlay';
import { ut, detectLocale } from './uiStrings';
import type { UiKey } from './uiStrings';
import type { Locale } from '../i18n';
import { drawGacha } from '../game/gacha';
import { GACHA_POOL } from '../game/roster';
import type { CritterSpec } from '../game/roster';
import type { MetaProgress } from './meta';
import { canDrawGacha } from './drawGate';
import { faceFor, critterName } from './roster';
import { drawCritterPortrait } from './critterPortrait';
import { speciesForRosterId } from '../render/critterArt';

/** 공개 카드 초상화 한 변(CSS px). styles.ts 의 .big-art 와 «같은 값»이어야 한다. */
const REVEAL_PX = 76;

export interface GachaOptions {
  progress: MetaProgress;
  locale?: Locale;
  /** 뽑기 성공 시 호출(연출이 끝난 뒤). 중복 없음 정책이라 항상 신규 종이다. */
  onDrawn?: (species: CritterSpec) => void;
  onClose?: () => void;
  /** 결정적 테스트용 난수(기본 Math.random). game/gacha.ts drawGacha 의 rng 인자. */
  rng?: () => number;
}

export const GACHA_DRAWN_EVENT = 'ar:gacha-drawn';

const FLIP_MS = 560; // styles.ts .ar-card transition 과 같은 길이

export function openGacha(opts: GachaOptions): ScreenHandle {
  const locale = opts.locale ?? detectLocale();
  const p = opts.progress;
  const g = p.gacha;
  let closed = false;
  let busy = false;

  const modal = createModal({
    titleText: ut(locale, 'gacha.title'),
    closeLabel: ut(locale, 'nav.close'),
    onClose: () => handle.close(),
  });

  // ── 뷰 구성 ────────────────────────────────────────────────────────────
  // 뒷면 문양: 물음표 이모지 대신 «반짝임». 물음표는 「모른다」를 말하지만
  // 여기서 필요한 신호는 「좋은 게 들어 있다」다.
  const backFace = el('div', { class: 'ar-face back' }, [icon('sparkle')]);
  const frontFace = el('div', { class: 'ar-face front' });
  const card = el('div', { class: 'ar-card' }, [backFace, frontFace]);
  const stage3d = el('div', { class: 'ar-stage3d', role: 'img', ariaLabel: ut(locale, 'gacha.title') }, [card]);

  const gemNum = el('span', {});
  const gemChip = el('span', { class: 'ar-chip' }, [icon('diamond', 't-gem'), gemNum]);
  const msg = el('div', { class: 'ar-msg', role: 'status' }); // 뽑기 «결과»
  msg.setAttribute('aria-live', 'polite');
  const hint = el('div', { class: 'ar-msg warn' }); // 못 뽑는 «이유»(보석부족 등)

  const drawBtn = el('button', {
    class: 'ar-btn gacha big',
    type: 'button',
    on: { click: () => doDraw() },
  });

  modal.body.appendChild(
    el('div', { class: 'ar-gacha' }, [gemChip, stage3d, drawBtn, msg, hint])
  );

  // ── 상태 반영 ──────────────────────────────────────────────────────────
  // ★ 「지금 뽑을 수 있나」는 ui/drawGate.ts 한 곳에서만 판정한다. 나중에 시간게이트·
  //   광고보상이 붙어도 이 화면 코드는 그대로다(reason 만 늘어난다).
  function syncControls(): void {
    const gate = canDrawGacha(p);
    gemNum.textContent = `${g.gems}`;
    gemChip.setAttribute('aria-label', `${ut(locale, 'gacha.gems')} ${g.gems}`);
    modal.setCount(ut(locale, 'gacha.progress', { a: g.drawsCompleted, b: GACHA_POOL.length }));

    if (gate.reason === 'pool_empty') {
      drawBtn.textContent = ut(locale, 'gacha.complete');
      drawBtn.disabled = true;
      hint.textContent = '';
      return;
    }
    drawBtn.textContent = `${ut(locale, 'gacha.draw')} · ${ut(locale, 'gacha.price', { n: gate.price })}`;
    drawBtn.disabled = busy || !gate.allowed;
    // 못 누르는 버튼을 «이유 없이» 두지 않는다(비활성만 있으면 유저는 고장으로 읽는다).
    hint.textContent = gate.allowed
      ? ''
      : gate.reason === 'insufficient_gems'
        ? ut(locale, 'gacha.need')
        : ut(locale, 'gacha.locked');
  }

  /** 공개 카드용 초상화. 도감(roster.ts)과 «같은» 렌더 경로다. 캔버스가 죽으면
   *  이모지로 되돌아간다 — 화면이 비는 것보다 낫다(도감과 같은 폴백 규칙). */
  function revealPortrait(species: CritterSpec): HTMLElement {
    const cv = el('canvas', { class: 'big-art', ariaHidden: true });
    try {
      drawCritterPortrait(cv, {
        species: speciesForRosterId(species.id),
        grade: species.grade,
        size: REVEAL_PX,
      });
      return cv;
    } catch {
      return el('span', { class: 'big', text: faceFor(species.id), ariaHidden: true });
    }
  }

  function showFront(species: CritterSpec): void {
    frontFace.textContent = '';
    frontFace.className = `ar-face front g-${species.grade}`;
    frontFace.append(
      el('span', { class: 'ar-badge', text: ut(locale, 'gacha.new') }),
      // ★ 뽑기 «공개» 순간에 보이는 그림은 도감에서 보게 될 그림과 «같아야» 한다.
      //   개편 전엔 여기만 이모지(🐇…)였고 도감은 캔버스 초상화였다 — 방금 뽑은
      //   동물을 도감에서 다시 찾을 때 다른 그림이 나온다는 뜻이다. 같은 함수를 쓴다.
      revealPortrait(species),
      el('span', { class: 'nm', text: critterName(species, locale) }),
      locale === 'ko' ? el('span', { class: 'an', text: species.animalKo }) : el('span'),
      el('span', { class: `ar-tag g-${species.grade}`, text: ut(locale, `grade.${species.grade}` as UiKey) })
    );
  }

  function doDraw(): void {
    if (busy || closed) return;
    const gate = canDrawGacha(p);
    const price = gate.price;
    if (!gate.allowed) {
      // 쿨다운·광고 게이트가 나중에 붙어도 여기서 그대로 막힌다(구현은 drawGate.ts).
      syncControls();
      return;
    }

    // ★ 실제 추첨은 game/gacha.ts 가 한다. 화면은 결과만 연출한다.
    const { species, cost } = drawGacha(g, opts.rng);

    if (!species) {
      msg.className = 'ar-msg warn';
      msg.textContent =
        cost === 0 ? ut(locale, 'gacha.complete') : ut(locale, 'gacha.need');
      syncControls();
      return;
    }

    busy = true;
    msg.className = 'ar-msg';
    msg.textContent = '';
    drawBtn.disabled = true;
    gemNum.textContent = `${g.gems}`; // 결제는 즉시 반영(값은 gacha.ts 가 뺀 결과)

    const reveal = () => {
      showFront(species); // ★ 카드가 «뒷면일 때» 앞면을 갈아끼운다 — 뒤집힌 채로
      // 내용만 바뀌면 이전 결과가 새 결과로 «순간 교체»되는 게 보인다(2회차 이상).
      card.classList.add('flip');
      msg.textContent = `${critterName(species, locale)} · ${ut(locale, `grade.${species.grade}` as UiKey)}`;
      busy = false;
      syncControls();
      opts.onDrawn?.(species);
      window.dispatchEvent(
        new CustomEvent(GACHA_DRAWN_EVENT, { detail: { species, cost, price } })
      );
    };

    if (prefersReducedMotion()) {
      reveal();
      return;
    }
    // 2회차 이상이면 카드가 이미 뒤집혀 있다 — 먼저 «되돌리는» 시간을 준 뒤 다시 뒤집어야
    // 연출이 매번 새로 보인다. wasFlipped 를 remove 전에 읽는 게 핵심(제거 후 읽으면 항상 false).
    const wasFlipped = card.classList.contains('flip');
    card.classList.remove('flip');
    window.setTimeout(reveal, wasFlipped ? FLIP_MS : 120);
  }

  const handle: ScreenHandle = {
    panel: modal.panel,
    isOpen: () => modal.isOpen() && !closed,
    refresh: () => {
      if (closed || !modal.isOpen()) return;
      syncControls();
    },
    close: () => {
      if (closed) return;
      closed = true;
      modal.destroy();
      opts.onClose?.();
    },
  };

  syncControls();
  // ★ 「탭해서 확인」은 «실제로 뽑을 수 있을 때만» 띄운다. 못 뽑는 상태에서 안내하면
  //   비활성 버튼을 누르라고 시키는 꼴이다(실측: 보석 0 화면에 «탭해서 확인»과
  //   «보석이 부족해요»가 동시에 떠 있었다). 막힌 이유는 hint 가 이미 말한다.
  msg.textContent = canDrawGacha(p).allowed ? ut(locale, 'gacha.tapReveal') : '';
  modal.open();
  return handle;
}
