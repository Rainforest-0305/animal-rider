// en.ts — 기준 로케일이자 키의 정본. messages.d.ts의 Messages 타입을 만족해야
// 컴파일된다. 게임명 리터럴 없음(brand.ts 참조 - i18n/index.ts 참조).
// ★ 회전 문구: 원 설계서 8.2절 12종 중 3/4/5+회전 6종은 D1 이후 물리
// 실측(1.09회전 실질상한)으로 도달불가능해져 «사문 처리». 1/2회전 6종만 유지.
import type { Messages } from '../messages.d';

export const en: Messages = {
  'ui.play': 'Play',
  'ui.pause': 'Pause',
  'ui.retry': 'Retry',
  'ui.settings': 'Settings',
  'hud.score': 'Score',
  'hud.segment': 'Seg',
  'hud.rotation': 'Spin',
  'hud.multiplier': 'x',
  'stage.progress.stage1_label': 'Collection Complete',
  'stage.progress.stage2_label': 'Full Mastery',
  'landing.perfect': 'Clean Landing',
  'landing.normal': 'Landed',
  'landing.crash': 'Wipeout',
  'rotation.one_a': 'One Turn!',
  'rotation.one_b': 'Light as Fur',
  'rotation.two_a': 'Twin Roll',
  'rotation.two_b': 'Mane in the Wind',
  'landing.clean_a': 'Clean Landing',
  'landing.clean_b': 'Paws Down',
  'crash.restart': 'Tap / Space to restart',
};
