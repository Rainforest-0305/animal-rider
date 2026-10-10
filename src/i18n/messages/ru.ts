// ru.ts — 실제 키릴 문자로 교체(Partner 지시, 2026-08-05). 이전 버전은
// heredoc 인코딩 문제를 의심해 로마자 음역으로 대체했었으나, 재검증 결과
// heredoc 자체는 바이트 레벨에서 정확했다(오진 정정 - 최종보고 참조).
// 여기 문자열은 실제 러시아어 키릴이며 코드포인트 U+0400~04FF 검증 완료
// (scratchpad/verify_codepoints.py 실행 - print()로 글자를 콘솔에 찍지 않고
// 코드포인트만 대조해 콘솔 코드페이지 오염을 배제).
// 게임명 리터럴 없음. 6.3절 위험도 높음(en대비 +25%, 격변화로 어미가 길어짐).
import type { Messages } from '../messages.d';

export const ru: Messages = {
  'ui.play': 'Играть',
  'ui.pause': 'Пауза',
  'ui.retry': 'Заново',
  'ui.settings': 'Настройки',
  'hud.score': 'Очки',
  'hud.segment': 'Отрезок',
  'hud.rotation': 'Вращение',
  'hud.multiplier': 'x',
  'stage.progress.stage1_label': 'Коллекция собрана',
  'stage.progress.stage2_label': 'Полное мастерство',
  'landing.perfect': 'Идеальное приземление',
  'landing.normal': 'Приземление',
  'landing.crash': 'Падение',
  'rotation.one_a': 'Один оборот!',
  'rotation.one_b': 'Лёгкий как пух',
  'rotation.two_a': 'Двойной оборот',
  'rotation.two_b': 'Шерсть на ветру',
  'landing.clean_a': 'Идеальное приземление',
  'landing.clean_b': 'На четыре лапы',
  'crash.restart': 'Нажмите / Пробел — заново',
};
