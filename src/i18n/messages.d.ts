// messages.d.ts — 9개 로케일 공통 스키마. en.ts가 키 정본이며, 나머지 8개는
// 이 타입이 강제하는 1:1 키 대칭을 어기면 컴파일 에러가 난다.
// ★ 게임명(브랜드) 키는 여기 없다 — brand.ts가 단일 소스이고 런타임에
// getGameTitle()로 직접 읽는다. 로케일 파일에 브랜드 리터럴을 두지 않는다.
export interface Messages {
  'ui.play': string;
  'ui.pause': string;
  'ui.retry': string;
  'ui.settings': string;
  'hud.score': string;
  'hud.segment': string;
  'hud.rotation': string;
  'hud.multiplier': string;
  'stage.progress.stage1_label': string; // 1단: 컬렉션 완주
  'stage.progress.stage2_label': string; // 2단: 완전 제패
  'landing.perfect': string;
  'landing.normal': string;
  'landing.crash': string;
  'rotation.one_a': string;
  'rotation.one_b': string;
  'rotation.two_a': string;
  'rotation.two_b': string;
  'landing.clean_a': string;
  'landing.clean_b': string;
  // 전복 오버레이 «재시작 안내». 제목은 'landing.crash' 를 그대로 쓴다.
  // ★ 캔버스 fillText 라 폭 상한이 없다 — 390px 세로화면 16px 기준으로 «짧게» 쓴다.
  'crash.restart': string;
}
