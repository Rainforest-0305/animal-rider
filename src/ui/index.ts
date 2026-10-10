// ui/index.ts — 메타게임 UI «단일 진입점». main.ts 는 이 파일만 import 하면 된다.
//
// ┌ main.ts 배선 (권장 형태) ────────────────────────────────────────────────
// │ import { createMetaUI, createMetaProgress } from './ui';
// │
// │ const progress = createMetaProgress(gachaState);   // gacha.ts 상태를 «공유»
// │ const meta = createMetaUI({
// │   progress,
// │   onPlayStage: (stage) => startRun(stage),         // ← 게임이 런을 시작
// │ });
// │
// │ // 런이 끝났을 때(도달/전복 무관, 별판정은 game/stages.ts judgeStars 로 낸 값)
// │ meta.presentStageClear({
// │   stage: currentStage, stars: star.stars,
// │   score: state.totalScore, rotations: state.sRotCountTotal,
// │   gemsAwarded: 600,          // 마일스톤 보상을 줬다면(경제로직은 게임 소유)
// │ });
// │
// │ meta.refresh();       // HUD 숫자 갱신
// │ meta.openStages();    // 임의 시점에 스테이지 선택 열기
// └───────────────────────────────────────────────────────────────────────────
//
// 의존성 방향: game → ui 단방향. 이 폴더는 main.ts / physics.ts / track.ts 를
// 절대 import 하지 않는다(순환 없음). game/{roster,stages,gacha,score}.ts 와
// i18n/*, brand.ts 는 «읽기만» 한다.
//
// 온보딩 원칙(CrazyGames 거절 재발 방지): 이 모듈은 «시작 메뉴를 만들지 않는다».
// createMetaUI() 는 화면을 하나도 열지 않고 HUD 바만 붙인다. 로드 즉시 플레이가
// 돌아가고, 수집·성장은 클리어 직후 자동 연출로 3분 안에 노출된다.
import { STAGES, stageLockState, recordStageResult, nextPlayableStage } from './meta';
import type { MetaProgress, StageInfo } from './meta';
import { createHudOverlay } from './hud-overlay';
import type { HudOverlay } from './hud-overlay';
import { openStageSelect } from './stageSelect';
import { openRoster } from './roster';
import { openGacha } from './gacha';
import { showStageClear } from './stageClear';
import type { StageClearInfo } from './stageClear';
import type { ScreenHandle } from './overlay';
import { detectLocale } from './uiStrings';
import type { Locale } from '../i18n';
import type { CritterSpec } from '../game/roster';
import { canDrawGacha } from './drawGate';
import { showControlHint } from './onboarding';
import type { ControlHintOptions } from './onboarding';
import { showDailyToast } from './dailyToast';
import { takeDailyGrant } from '../daily';

export * from './meta';
export * from './drawGate';
export { showControlHint, resetControlHintSeen } from './onboarding';
export { openStageSelect, STAGE_PLAY_EVENT } from './stageSelect';
export { openRoster } from './roster';
export { openGacha, GACHA_DRAWN_EVENT } from './gacha';
export { showStageClear, STAGE_CLEAR_NEXT_EVENT } from './stageClear';
export { showDailyToast, loginStreakTarget } from './dailyToast';
export { createHudOverlay } from './hud-overlay';
export { ut, detectLocale } from './uiStrings';
export type { ScreenHandle } from './overlay';
export type { StageClearInfo } from './stageClear';
export type { HudOverlay } from './hud-overlay';

export interface StageClearInput {
  stage: StageInfo;
  stars: number;
  score: number;
  rotations: number;
  gemsAwarded?: number;
}

export interface MetaUIOptions {
  progress: MetaProgress;
  locale?: Locale;
  /** 스테이지 선택에서 «플레이»를 누르면 호출. 게임이 런을 시작한다. */
  onPlayStage: (stage: StageInfo) => void;
  /** 뽑기 성공 알림(선택). */
  onDrawn?: (species: CritterSpec) => void;
  /**
   * 클리어 연출 뒤 가챠를 «자동으로» 열지 판정. 기본값: 보석이 다음 뽑기 가격
   * 이상이고 남은 종이 있으면 연다(= 첫 사이클에서 수집이 즉시 보인다).
   */
  shouldAutoOpenGacha?: (info: StageClearInfo) => boolean;
  /** 클리어 연출 뒤 가챠도 아니면 스테이지 선택을 열지. 기본 true. */
  openStagesAfterClear?: boolean;
  /**
   * 로드 직후 조작 안내 토스트(«첫 3초 이내» 요건). 기본 true.
   * 화면을 막지 않는 토스트라 즉시플레이 원칙과 충돌하지 않는다.
   * false 를 주거나, 옵션 객체로 지연/노출시간을 조절할 수 있다.
   */
  controlHint?: boolean | ControlHintOptions;
  /**
   * 일일 접속 보상 «알림 토스트»를 띄울지. 기본 true.
   * ★ false 로 꺼도 «보상은 이미 지급돼 있다» — 지급은 save.ts 부팅 경로가 하고
   *   여기는 알림만 담당한다. QA 하네스에서 화면을 깨끗이 찍을 때 쓰라고 둔 스위치다.
   */
  dailyToast?: boolean;
}

export interface MetaUI {
  readonly progress: MetaProgress;
  readonly hud: HudOverlay;
  openStages(focus?: StageInfo): void;
  openRoster(highlightId?: string): void;
  openGacha(): void;
  /** 별 기록 → 별 연출 → (마일스톤이면) 가챠 자동 → 아니면 스테이지 선택. */
  presentStageClear(input: StageClearInput): void;
  /** 현재 열려 있는 화면 핸들(없으면 null). */
  current(): ScreenHandle | null;
  /** 조작 안내 토스트를 지금 없앤다(유저가 이미 조작을 익혔다고 판단될 때). */
  dismissControlHint(): void;
  refresh(): void;
  closeAll(): void;
  destroy(): void;
}

export function createMetaUI(opts: MetaUIOptions): MetaUI {
  const locale = opts.locale ?? detectLocale();
  const p = opts.progress;
  let screen: ScreenHandle | null = null;

  function canDraw(): boolean {
    return canDrawGacha(p).allowed; // 판정은 ui/drawGate.ts 한 곳(리텐션 훅 자리)
  }

  function closeAll(): void {
    screen?.close();
    screen = null;
    hud.setVisible(true);
  }

  /** 화면을 하나만 띄운다 + 떠 있는 동안 HUD 바를 감춘다(모달 밑에 버튼이 비치지 않게). */
  function setScreen(h: ScreenHandle): void {
    screen = h;
    hud.setVisible(false);
    // 메타 화면을 열었다는 건 조작 안내를 읽을 상황이 아니라는 뜻이다.
    // 놔두면 모달 위/뒤로 «누르면 가속» 토스트가 겹쳐 보인다(실측: 가챠 캡처).
    hint?.dismiss();
    // 같은 이유로 보상 토스트도 치운다. 보상 자체는 이미 지갑에 있으므로 손실 0이고,
    // 유저가 지금 보고 있는 숫자(보석 칩·도감 진행바)가 그 결과를 그대로 말한다.
    dailyToast?.dismiss();
  }

  // ★ 조작 안내: 로드 직후 «즉시» 토스트로 띄운다(요건: 첫 3초 이내).
  //   화면을 막지 않으므로 게임은 그대로 돌아간다 — 시작 메뉴가 아니다.
  const hint =
    opts.controlHint === false
      ? null
      : showControlHint({
          locale,
          ...(typeof opts.controlHint === 'object' ? opts.controlHint : {}),
        });

  const hud = createHudOverlay({
    progress: p,
    locale,
    canDraw,
    onOpenStages: () => api.openStages(),
    onOpenRoster: () => api.openRoster(),
    onOpenGacha: () => api.openGacha(),
  });

  // ★ 일일 접속 보상 알림.
  //   지급·저장은 «이미» 부팅 때 끝났다(save.ts loadInto). 여기서 하는 일은
  //   그 사실을 한 번 보여주는 것뿐이라 실패해도 보상이 사라지지 않는다.
  //   takeDailyGrant() 는 소비형이라 이 UI 가 두 번 만들어져도 토스트는 한 번만 뜬다.
  //   조작 안내와 «같은 자리»를 쓰므로 그게 사라진 뒤에 뜨게 넘겨준다.
  const dailyGrant = opts.dailyToast === false ? null : takeDailyGrant();
  const dailyToast = dailyGrant
    ? showDailyToast({ locale, grant: dailyGrant, waitFor: hint?.node ?? null })
    : null;

  const api: MetaUI = {
    progress: p,
    hud,
    current: () => screen,

    openStages(focus?: StageInfo) {
      closeAll();
      setScreen(openStageSelect({
        progress: p,
        locale,
        focusStage: focus,
        onPlay: (stage) => {
          closeAll();
          hud.refresh();
          opts.onPlayStage(stage);
        },
        onClose: () => {
          screen = null;
          hud.setVisible(true);
          hud.refresh();
        },
      }));
    },

    openRoster(highlightId?: string) {
      closeAll();
      setScreen(openRoster({
        progress: p,
        locale,
        highlightId,
        onClose: () => {
          screen = null;
          hud.setVisible(true);
          hud.refresh();
        },
      }));
    },

    openGacha() {
      closeAll();
      setScreen(openGacha({
        progress: p,
        locale,
        onDrawn: (species) => {
          hud.refresh();
          opts.onDrawn?.(species);
        },
        onClose: () => {
          screen = null;
          hud.setVisible(true);
          hud.refresh();
        },
      }));
    },

    presentStageClear(input: StageClearInput) {
      // 이번 클리어로 «새로 열린» 스테이지를 찾기 위해 기록 전 잠금 상태를 스냅샷.
      const lockedBefore = new Set(
        STAGES.filter((s) => !stageLockState(s, p).unlocked).map((s) => s.id)
      );
      recordStageResult(p, input.stage.id, input.stars); // 별은 최고기록만 갱신
      const unlockedStage = STAGES.find(
        (s) => lockedBefore.has(s.id) && stageLockState(s, p).unlocked
      );

      const info: StageClearInfo = { ...input, unlockedStage };
      hud.refresh();
      closeAll();
      setScreen(showStageClear({
        progress: p,
        locale,
        info,
        onNext: () => {
          screen = null;
          hud.refresh();
          const auto = opts.shouldAutoOpenGacha ? opts.shouldAutoOpenGacha(info) : canDraw();
          if (auto) {
            api.openGacha();
          } else if (opts.openStagesAfterClear !== false) {
            api.openStages(nextPlayableStage(p));
          }
        },
        onClose: () => {
          hud.setVisible(true);
          hud.refresh();
        },
      }));
    },

    refresh() {
      hud.refresh();
      screen?.refresh();
    },

    closeAll,

    dismissControlHint() {
      hint?.dismiss();
    },

    destroy() {
      closeAll();
      hint?.dismiss();
      dailyToast?.dismiss();
      hud.destroy();
    },
  };

  return api;
}
