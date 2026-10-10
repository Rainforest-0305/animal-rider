// ui/stageSelect.ts — 스테이지 선택 화면(48개, 티어 6섹션).
//
// ┌ 사용법 (main.ts 배선) ────────────────────────────────────────────────────
// │ import { openStageSelect } from './ui/stageSelect';
// │ const screen = openStageSelect({
// │   progress,                       // ui/meta.ts 의 MetaProgress (게임이 소유)
// │   locale,                         // i18n Locale (없으면 detectLocale())
// │   onPlay: (stage) => { screen.close(); startStage(stage); },
// │   onClose: () => {},              // 닫힘 후 호출(선택)
// │ });
// │ screen.refresh();  // 별 갱신 후 다시 그리기
// │ screen.close();
// └───────────────────────────────────────────────────────────────────────────
// 이벤트 배선은 «콜백 + CustomEvent» 두 갈래 다 제공한다. main.ts 를 import
// 하지 않는다(의존성 방향: game → ui 단방향).
//   window.addEventListener('ar:stage-play', (e) => e.detail.stage)
//
// 표시 데이터는 전부 ui/meta.ts 가 stages.ts 에서 «유도»한 값이다. 스테이지 수
// (48)·별 총량(144)·티어 게이트(15/32/50/72/95) 리터럴은 이 파일에 없다.
import { el, starRow, nextFrame } from './dom';
import { icon } from './icons';
import { createModal } from './overlay';
import type { ScreenHandle } from './overlay';
import { ut, detectLocale } from './uiStrings';
import type { UiKey } from './uiStrings';
import type { Locale } from '../i18n';
import {
  MAX_TOTAL_STARS,
  nextPlayableStage,
  stageLockState,
  stageStars,
  stagesByTier,
  totalStars,
} from './meta';
import type { MetaProgress, StageInfo } from './meta';
// 존(테마) 배분. ★ 존은 «티어와 경계가 다르다»(티어 10/8/8/8/8/6 vs 존 8/8/8/8/8/8).
//   그래서 티어 섹션 안에서 존이 바뀌는 지점이 생긴다 — 그 지점을 눈에 보이게 나눈다.
import { zoneForStageIndex } from '../render/zones';
import type { ZoneDef } from '../render/zones';

export interface StageSelectOptions {
  progress: MetaProgress;
  locale?: Locale;
  onPlay: (stage: StageInfo) => void;
  onClose?: () => void;
  /** 열자마자 이 스테이지가 보이도록 스크롤. 기본 nextPlayableStage(). */
  focusStage?: StageInfo;
}

export const STAGE_PLAY_EVENT = 'ar:stage-play';

export function openStageSelect(opts: StageSelectOptions): ScreenHandle {
  const locale = opts.locale ?? detectLocale();
  const p = opts.progress;
  let closed = false;

  const modal = createModal({
    titleText: ut(locale, 'stage.title'),
    closeLabel: ut(locale, 'nav.close'),
    onClose: () => handle.close(),
  });

  function tierLabel(tier: string): string {
    return ut(locale, `tier.${tier}` as UiKey);
  }

  function buildTile(stage: StageInfo): HTMLElement {
    const lock = stageLockState(stage, p);
    const earned = stageStars(p, stage.id);
    const isNext = stage.id === nextPlayableStage(p).id;

    const cls = [
      'ar-tile',
      lock.unlocked ? '' : 'locked',
      earned >= stage.maxStars ? 'done' : '',
      isNext && lock.unlocked ? 'next' : '',
    ]
      .filter(Boolean)
      .join(' ');

    // 잠금 사유를 스크린리더가 읽을 수 있게 aria-label 에 전부 담는다.
    const lockText = !lock.unlocked
      ? lock.reason === 'gate'
        ? ut(locale, 'stage.locked.gate', { n: lock.needStars ?? 0 })
        : ut(locale, 'stage.locked.prev', { n: lock.needStage?.number ?? 0 })
      : '';
    const label = lock.unlocked
      ? `${ut(locale, 'stage.stage', { n: stage.number })} · ${tierLabel(stage.tier)} · ${earned}/${stage.maxStars}`
      : `${ut(locale, 'stage.stage', { n: stage.number })} · ${lockText}`;

    const tile = el(
      'button',
      {
        class: cls,
        type: 'button',
        ariaLabel: label,
        disabled: !lock.unlocked,
        dataset: { stageId: stage.id },
        on: {
          click: () => {
            if (!lock.unlocked) return;
            play(stage);
          },
        },
      },
      [
        el('span', { class: 'num', text: String(stage.number), ariaHidden: true }),
        lock.unlocked
          ? starRow(earned, stage.maxStars)
          : icon('lock', 'ar-lock'),
      ]
    );
    if (!lock.unlocked) tile.title = lockText;
    else tile.title = `${ut(locale, 'stage.target.score', { n: stage.def.targetScore })} · ${ut(locale, 'stage.target.rot', { n: stage.def.targetRotationsCumulative })}`;
    return tile;
  }

  /** 존 이름(로케일 반영). ★ i18n 메시지 파일 9종에 존 이름을 추가하지 않는다 —
   *  존은 앞으로 늘어날 데이터라 메시지 파일에 박으면 존 추가 비용이 9배가 된다.
   *  ZoneDef 가 ko/en 두 이름을 들고 있고, 그 외 로케일은 영문을 쓴다. */
  function zoneName(z: ZoneDef): string {
    return locale === 'ko' ? z.nameKo : z.nameEn;
  }

  /** 존 이름표.
   *  ★ 개편 전엔 존 강조색을 «글자색»으로 그대로 썼다. 그런데 존 강조색은 «게임 배경»
   *    기준으로 고른 색이라 패널의 밝은 종이 위에서는 읽히지 않는다 — 실측 대비
   *    초원 2.64:1 · 모래바람 2.16:1 · 눈덮인봉우리 2.10:1 로 셋 다 4.5 미달이었다.
   *    지금은 글자를 잉크색으로 두고, 존 색은 «점 하나»가 진다. 색은 정체성 신호로만
   *    쓰고 가독성은 잉크가 책임진다 — 어느 존이 추가돼도 대비가 깨지지 않는다.
   *  ★ 이름표를 «알약»으로 만든 이유: 이건 섹션 제목이 아니라 격자에 붙는 라벨이다.
   *    티어 제목(h3)과 «다른 층»임이 형태로 드러나야 두 제목이 경쟁하지 않는다. */
  function zoneHeader(z: ZoneDef): HTMLElement {
    return el('div', { class: 'ar-zone' }, [
      el('span', {
        class: 'dot',
        ariaHidden: true,
        style: { background: z.accent },
      }),
      el('span', { text: zoneName(z) }),
    ]);
  }

  /** 연속된 스테이지를 «같은 존끼리» 묶는다. 티어 하나가 두 존에 걸치면 두 덩어리가 된다. */
  function splitByZone(stages: StageInfo[]): Array<{ zone: ZoneDef; stages: StageInfo[] }> {
    const runs: Array<{ zone: ZoneDef; stages: StageInfo[] }> = [];
    for (const st of stages) {
      const z = zoneForStageIndex(st.index);
      const last = runs[runs.length - 1];
      if (last && last.zone.id === z.id) last.stages.push(st);
      else runs.push({ zone: z, stages: [st] });
    }
    return runs;
  }

  function play(stage: StageInfo): void {
    opts.onPlay(stage);
    window.dispatchEvent(new CustomEvent(STAGE_PLAY_EVENT, { detail: { stage } }));
  }

  function render(): void {
    const body = modal.body;
    body.textContent = '';
    const stars = totalStars(p);
    modal.setCount(ut(locale, 'stage.total', { a: stars, b: MAX_TOTAL_STARS }));

    for (const group of stagesByTier()) {
      // ★ 부제는 «별 게이트» 충족 여부로만 갈린다. 예전엔 「이 티어에 해금된 스테이지가
      //   하나라도 있나」로 판정했는데, 그러면 별은 이미 충분한데 직전 스테이지를 안 깨서
      //   막힌 경우에도 「별 95개 필요」가 떠서 «틀린 사유»를 안내했다
      //   (실측: 별 95 보유 상태에서 어려움II「별 72개 필요」·익스트림「별 95개 필요」).
      //   그 경우 진짜 블로커는 직전 스테이지이고, 그건 타일별 잠금 표시가 이미 말해준다.
      const gateMet = stars >= group.gateStars;
      const sub = gateMet
        ? `${ut(locale, 'stage.target.score', { n: group.def.targetScore })} · ${ut(locale, 'stage.target.rot', { n: group.def.targetRotationsCumulative })}`
        : ut(locale, 'stage.locked.gate', { n: group.gateStars });

      const zoneBlocks: HTMLElement[] = [];
      for (const run of splitByZone(group.stages)) {
        zoneBlocks.push(zoneHeader(run.zone));
        zoneBlocks.push(el('div', { class: 'ar-grid' }, run.stages.map((s) => buildTile(s))));
      }

      const sec = el('section', { class: 'ar-sec' }, [
        el('h3', { class: 'ar-sec-h' }, [
          el('span', { text: tierLabel(group.def.tier) }),
          el('span', { class: 'sub', text: sub }),
          el('span', { class: 'rule', ariaHidden: true }),
        ]),
        ...zoneBlocks,
      ]);
      body.appendChild(sec);
    }

    scrollToFocus();
  }

  /** 지금 밀어야 할 스테이지가 보이도록 스크롤(온보딩: 열자마자 다음 목표가 보인다).
   *  ★ 레이아웃이 잡힌 «뒤»에 불러야 한다 — 패널이 DOM 에 붙기 전에는 offsetTop/
   *    clientHeight 가 0 이라 조용히 아무 일도 안 일어난다(실측으로 발견). */
  function scrollToFocus(): void {
    const body = modal.body;
    if (body.clientHeight === 0) return;
    const target = opts.focusStage ?? nextPlayableStage(p);
    const node = body.querySelector<HTMLElement>(`[data-stage-id="${target.id}"]`);
    if (!node) return;
    body.scrollTop = Math.max(0, node.offsetTop - body.clientHeight / 2);
  }

  const handle: ScreenHandle = {
    panel: modal.panel,
    isOpen: () => modal.isOpen() && !closed,
    refresh: () => {
      if (closed || !modal.isOpen()) return;
      render();
    },
    close: () => {
      if (closed) return;
      closed = true;
      modal.destroy();
      opts.onClose?.();
    },
  };

  render();
  modal.open();
  nextFrame(scrollToFocus); // 패널이 DOM 에 붙어 높이가 생긴 뒤에 스크롤 위치를 잡는다.
  return handle;
}
