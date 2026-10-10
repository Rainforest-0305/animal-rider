// ui/uiStrings.ts — 메타게임 UI 전용 문자열(9개 로케일).
//
// ★ 왜 src/i18n/ 에 안 넣나: i18n/* 은 다른 담당자 락이고 Messages 스키마(en.ts
//   키 정본)를 건드리면 9개 파일이 동시에 컴파일 에러가 난다. UI 화면 3종에서만
//   쓰는 라벨이라 여기에 «UI 전용 사전»으로 분리했다. 로케일 목록·폴백·감지는
//   i18n/index.ts 의 SUPPORTED_LOCALES / FALLBACK_LOCALE 를 그대로 재사용하므로
//   지원 언어가 늘면 여기 컴파일 에러로 즉시 드러난다(Record<Locale, ...>).
// ★ 게임명(브랜드) 리터럴은 여기 두지 않는다 — brand.ts 단일소스 원칙.
import { SUPPORTED_LOCALES, FALLBACK_LOCALE } from '../i18n';
import type { Locale } from '../i18n';

const en = {
  'nav.stages': 'Stages',
  'nav.roster': 'Collection',
  'nav.gacha': 'Draw',
  'nav.close': 'Close',
  'stage.title': 'Stages',
  'stage.total': '{a} / {b} stars',
  'stage.stage': 'Stage {n}',
  'stage.locked.gate': 'Needs {n} stars',
  'stage.locked.prev': 'Clear stage {n} first',
  'stage.target.score': 'Target score {n}',
  'stage.target.rot': 'Target spins {n}',
  'stage.play': 'Play',
  'tier.Easy': 'Easy',
  'tier.Moderate1': 'Moderate I',
  'tier.Moderate2': 'Moderate II',
  'tier.Difficult1': 'Hard I',
  'tier.Difficult2': 'Hard II',
  'tier.Extreme': 'Extreme',
  'roster.title': 'Collection',
  'roster.owned': '{a} / {b}',
  'roster.complete': 'Complete!',
  'roster.locked': 'Not owned',
  'grade.COMMON': 'Common',
  'grade.RARE': 'Rare',
  'grade.EPIC': 'Epic',
  'grade.SPECIAL': 'Special',
  'cond.login_streak': 'Log in {a}/{b} days',
  'cond.challenge_count': 'Challenges {a}/{b}',
  'cond.stage_stars': 'Stars {a}/{b}',
  'cond.customization_categories': 'Styles {a}/{b}',
  'cond.done': 'Unlocked',
  'gacha.title': 'Draw',
  'gacha.gems': 'Gems',
  'gacha.price': 'Cost {n}',
  'gacha.draw': 'Draw',
  'gacha.tapReveal': 'Tap to reveal',
  'gacha.new': 'NEW',
  'gacha.need': 'Not enough gems',
  'gacha.complete': 'All collected',
  'gacha.progress': 'Draws {a} / {b}',
  'clear.title': 'Stage clear',
  'clear.score': 'Score',
  'clear.rot': 'Spins',
  'clear.reward': '+{n} gems',
  'clear.unlocked': 'Stage {n} unlocked',
  'clear.next': 'Next',
  'onb.tap': 'Hold to speed up',
  'onb.air': 'Hold in the air to flip',
  'gacha.locked': 'Not available yet',
};

export type UiKey = keyof typeof en;
type Dict = Record<UiKey, string>;

const ko: Dict = {
  'nav.stages': '스테이지',
  'nav.roster': '도감',
  'nav.gacha': '뽑기',
  'nav.close': '닫기',
  'stage.title': '스테이지',
  'stage.total': '별 {a} / {b}',
  'stage.stage': '{n}단계',
  'stage.locked.gate': '별 {n}개 필요',
  'stage.locked.prev': '{n}단계 먼저 클리어',
  'stage.target.score': '목표 점수 {n}',
  'stage.target.rot': '목표 회전 {n}',
  'stage.play': '플레이',
  'tier.Easy': '쉬움',
  'tier.Moderate1': '보통 I',
  'tier.Moderate2': '보통 II',
  'tier.Difficult1': '어려움 I',
  'tier.Difficult2': '어려움 II',
  'tier.Extreme': '익스트림',
  'roster.title': '도감',
  'roster.owned': '{a} / {b}',
  'roster.complete': '완주!',
  'roster.locked': '미보유',
  'grade.COMMON': '일반',
  'grade.RARE': '레어',
  'grade.EPIC': '에픽',
  'grade.SPECIAL': '스페셜',
  'cond.login_streak': '접속 {a}/{b}일',
  'cond.challenge_count': '챌린지 {a}/{b}',
  'cond.stage_stars': '별 {a}/{b}',
  'cond.customization_categories': '꾸미기 {a}/{b}',
  'cond.done': '해금 완료',
  'gacha.title': '뽑기',
  'gacha.gems': '보석',
  'gacha.price': '{n} 보석',
  'gacha.draw': '뽑기',
  'gacha.tapReveal': '탭해서 확인',
  'gacha.new': 'NEW',
  'gacha.need': '보석이 부족해요',
  'gacha.complete': '전부 모았어요',
  'gacha.progress': '뽑기 {a} / {b}',
  'clear.title': '스테이지 클리어',
  'clear.score': '점수',
  'clear.rot': '회전',
  'clear.reward': '보석 +{n}',
  'clear.unlocked': '{n}단계 해금',
  'clear.next': '다음',
  'onb.tap': '누르면 가속',
  'onb.air': '공중에서 누르면 회전',
  'gacha.locked': '지금은 뽑을 수 없어요',
};

const ja: Dict = {
  'nav.stages': 'ステージ', 'nav.roster': 'ずかん', 'nav.gacha': 'ガチャ', 'nav.close': '閉じる',
  'stage.title': 'ステージ', 'stage.total': 'スター {a} / {b}', 'stage.stage': 'ステージ {n}',
  'stage.locked.gate': 'スター{n}個必要', 'stage.locked.prev': 'ステージ{n}をクリア',
  'stage.target.score': '目標スコア {n}', 'stage.target.rot': '目標回転 {n}', 'stage.play': 'プレイ',
  'tier.Easy': 'かんたん', 'tier.Moderate1': 'ふつう I', 'tier.Moderate2': 'ふつう II',
  'tier.Difficult1': 'むずかしい I', 'tier.Difficult2': 'むずかしい II', 'tier.Extreme': 'エクストリーム',
  'roster.title': 'ずかん', 'roster.owned': '{a} / {b}', 'roster.complete': 'コンプリート!', 'roster.locked': '未所持',
  'grade.COMMON': 'ノーマル', 'grade.RARE': 'レア', 'grade.EPIC': 'エピック', 'grade.SPECIAL': 'スペシャル',
  'cond.login_streak': 'ログイン {a}/{b}日', 'cond.challenge_count': 'チャレンジ {a}/{b}',
  'cond.stage_stars': 'スター {a}/{b}', 'cond.customization_categories': 'きせかえ {a}/{b}', 'cond.done': '解放ずみ',
  'gacha.title': 'ガチャ', 'gacha.gems': 'ジェム', 'gacha.price': '{n} ジェム', 'gacha.draw': 'ひく',
  'gacha.tapReveal': 'タップでめくる', 'gacha.new': 'NEW', 'gacha.need': 'ジェムが足りません',
  'gacha.complete': 'すべて集めました', 'gacha.progress': 'ガチャ {a} / {b}',
  'clear.title': 'ステージクリア', 'clear.score': 'スコア', 'clear.rot': '回転', 'clear.reward': 'ジェム +{n}',
  'clear.unlocked': 'ステージ{n} 解放', 'clear.next': 'つぎへ',
  'onb.tap': '長押しで加速',
  'onb.air': '空中で長押しすると回転',
  'gacha.locked': 'いまは引けません',
};

const zhHans: Dict = {
  'nav.stages': '关卡', 'nav.roster': '图鉴', 'nav.gacha': '抽卡', 'nav.close': '关闭',
  'stage.title': '关卡', 'stage.total': '星星 {a} / {b}', 'stage.stage': '第{n}关',
  'stage.locked.gate': '需要{n}颗星', 'stage.locked.prev': '先通关第{n}关',
  'stage.target.score': '目标分数 {n}', 'stage.target.rot': '目标翻转 {n}', 'stage.play': '开始',
  'tier.Easy': '简单', 'tier.Moderate1': '普通 I', 'tier.Moderate2': '普通 II',
  'tier.Difficult1': '困难 I', 'tier.Difficult2': '困难 II', 'tier.Extreme': '极限',
  'roster.title': '图鉴', 'roster.owned': '{a} / {b}', 'roster.complete': '已集齐!', 'roster.locked': '未拥有',
  'grade.COMMON': '普通', 'grade.RARE': '稀有', 'grade.EPIC': '史诗', 'grade.SPECIAL': '特殊',
  'cond.login_streak': '登录 {a}/{b} 天', 'cond.challenge_count': '挑战 {a}/{b}',
  'cond.stage_stars': '星星 {a}/{b}', 'cond.customization_categories': '装扮 {a}/{b}', 'cond.done': '已解锁',
  'gacha.title': '抽卡', 'gacha.gems': '宝石', 'gacha.price': '{n} 宝石', 'gacha.draw': '抽取',
  'gacha.tapReveal': '点击翻开', 'gacha.new': 'NEW', 'gacha.need': '宝石不足',
  'gacha.complete': '已全部收集', 'gacha.progress': '抽取 {a} / {b}',
  'clear.title': '通关', 'clear.score': '分数', 'clear.rot': '翻转', 'clear.reward': '宝石 +{n}',
  'clear.unlocked': '解锁第{n}关', 'clear.next': '下一步',
  'onb.tap': '按住加速',
  'onb.air': '空中按住翻转',
  'gacha.locked': '暂时无法抽取',
};

const es: Dict = {
  'nav.stages': 'Niveles', 'nav.roster': 'Colección', 'nav.gacha': 'Sorteo', 'nav.close': 'Cerrar',
  'stage.title': 'Niveles', 'stage.total': '{a} / {b} estrellas', 'stage.stage': 'Nivel {n}',
  'stage.locked.gate': 'Faltan {n} estrellas', 'stage.locked.prev': 'Completa el nivel {n}',
  'stage.target.score': 'Puntos objetivo {n}', 'stage.target.rot': 'Giros objetivo {n}', 'stage.play': 'Jugar',
  'tier.Easy': 'Fácil', 'tier.Moderate1': 'Normal I', 'tier.Moderate2': 'Normal II',
  'tier.Difficult1': 'Difícil I', 'tier.Difficult2': 'Difícil II', 'tier.Extreme': 'Extremo',
  'roster.title': 'Colección', 'roster.owned': '{a} / {b}', 'roster.complete': '¡Completa!', 'roster.locked': 'No obtenido',
  'grade.COMMON': 'Común', 'grade.RARE': 'Raro', 'grade.EPIC': 'Épico', 'grade.SPECIAL': 'Especial',
  'cond.login_streak': 'Entra {a}/{b} días', 'cond.challenge_count': 'Retos {a}/{b}',
  'cond.stage_stars': 'Estrellas {a}/{b}', 'cond.customization_categories': 'Estilos {a}/{b}', 'cond.done': 'Desbloqueado',
  'gacha.title': 'Sorteo', 'gacha.gems': 'Gemas', 'gacha.price': '{n} gemas', 'gacha.draw': 'Sortear',
  'gacha.tapReveal': 'Toca para ver', 'gacha.new': 'NUEVO', 'gacha.need': 'Gemas insuficientes',
  'gacha.complete': 'Todo coleccionado', 'gacha.progress': 'Sorteos {a} / {b}',
  'clear.title': 'Nivel superado', 'clear.score': 'Puntos', 'clear.rot': 'Giros', 'clear.reward': '+{n} gemas',
  'clear.unlocked': 'Nivel {n} desbloqueado', 'clear.next': 'Siguiente',
  'onb.tap': 'Mantén para acelerar',
  'onb.air': 'Mantén en el aire para girar',
  'gacha.locked': 'No disponible aún',
};

const ptBR: Dict = {
  'nav.stages': 'Fases', 'nav.roster': 'Coleção', 'nav.gacha': 'Sorteio', 'nav.close': 'Fechar',
  'stage.title': 'Fases', 'stage.total': '{a} / {b} estrelas', 'stage.stage': 'Fase {n}',
  'stage.locked.gate': 'Faltam {n} estrelas', 'stage.locked.prev': 'Conclua a fase {n}',
  'stage.target.score': 'Pontos alvo {n}', 'stage.target.rot': 'Giros alvo {n}', 'stage.play': 'Jogar',
  'tier.Easy': 'Fácil', 'tier.Moderate1': 'Normal I', 'tier.Moderate2': 'Normal II',
  'tier.Difficult1': 'Difícil I', 'tier.Difficult2': 'Difícil II', 'tier.Extreme': 'Extremo',
  'roster.title': 'Coleção', 'roster.owned': '{a} / {b}', 'roster.complete': 'Completa!', 'roster.locked': 'Não obtido',
  'grade.COMMON': 'Comum', 'grade.RARE': 'Raro', 'grade.EPIC': 'Épico', 'grade.SPECIAL': 'Especial',
  'cond.login_streak': 'Entrar {a}/{b} dias', 'cond.challenge_count': 'Desafios {a}/{b}',
  'cond.stage_stars': 'Estrelas {a}/{b}', 'cond.customization_categories': 'Estilos {a}/{b}', 'cond.done': 'Desbloqueado',
  'gacha.title': 'Sorteio', 'gacha.gems': 'Gemas', 'gacha.price': '{n} gemas', 'gacha.draw': 'Sortear',
  'gacha.tapReveal': 'Toque para revelar', 'gacha.new': 'NOVO', 'gacha.need': 'Gemas insuficientes',
  'gacha.complete': 'Tudo coletado', 'gacha.progress': 'Sorteios {a} / {b}',
  'clear.title': 'Fase concluída', 'clear.score': 'Pontos', 'clear.rot': 'Giros', 'clear.reward': '+{n} gemas',
  'clear.unlocked': 'Fase {n} desbloqueada', 'clear.next': 'Próximo',
  'onb.tap': 'Segure para acelerar',
  'onb.air': 'Segure no ar para girar',
  'gacha.locked': 'Ainda não disponível',
};

const de: Dict = {
  'nav.stages': 'Level', 'nav.roster': 'Sammlung', 'nav.gacha': 'Ziehen', 'nav.close': 'Schließen',
  'stage.title': 'Level', 'stage.total': '{a} / {b} Sterne', 'stage.stage': 'Level {n}',
  'stage.locked.gate': '{n} Sterne nötig', 'stage.locked.prev': 'Erst Level {n} schaffen',
  'stage.target.score': 'Zielpunkte {n}', 'stage.target.rot': 'Zieldrehungen {n}', 'stage.play': 'Spielen',
  'tier.Easy': 'Leicht', 'tier.Moderate1': 'Mittel I', 'tier.Moderate2': 'Mittel II',
  'tier.Difficult1': 'Schwer I', 'tier.Difficult2': 'Schwer II', 'tier.Extreme': 'Extrem',
  'roster.title': 'Sammlung', 'roster.owned': '{a} / {b}', 'roster.complete': 'Komplett!', 'roster.locked': 'Nicht erhalten',
  'grade.COMMON': 'Normal', 'grade.RARE': 'Selten', 'grade.EPIC': 'Episch', 'grade.SPECIAL': 'Spezial',
  'cond.login_streak': 'Login {a}/{b} Tage', 'cond.challenge_count': 'Challenges {a}/{b}',
  'cond.stage_stars': 'Sterne {a}/{b}', 'cond.customization_categories': 'Styles {a}/{b}', 'cond.done': 'Freigeschaltet',
  'gacha.title': 'Ziehen', 'gacha.gems': 'Edelsteine', 'gacha.price': '{n} Edelsteine', 'gacha.draw': 'Ziehen',
  'gacha.tapReveal': 'Zum Aufdecken tippen', 'gacha.new': 'NEU', 'gacha.need': 'Zu wenig Edelsteine',
  'gacha.complete': 'Alle gesammelt', 'gacha.progress': 'Ziehungen {a} / {b}',
  'clear.title': 'Level geschafft', 'clear.score': 'Punkte', 'clear.rot': 'Drehungen', 'clear.reward': '+{n} Edelsteine',
  'clear.unlocked': 'Level {n} frei', 'clear.next': 'Weiter',
  'onb.tap': 'Halten zum Beschleunigen',
  'onb.air': 'In der Luft halten zum Drehen',
  'gacha.locked': 'Noch nicht verfügbar',
};

const fr: Dict = {
  'nav.stages': 'Niveaux', 'nav.roster': 'Collection', 'nav.gacha': 'Tirage', 'nav.close': 'Fermer',
  'stage.title': 'Niveaux', 'stage.total': '{a} / {b} étoiles', 'stage.stage': 'Niveau {n}',
  'stage.locked.gate': '{n} étoiles requises', 'stage.locked.prev': 'Terminez le niveau {n}',
  'stage.target.score': 'Score cible {n}', 'stage.target.rot': 'Tours cibles {n}', 'stage.play': 'Jouer',
  'tier.Easy': 'Facile', 'tier.Moderate1': 'Moyen I', 'tier.Moderate2': 'Moyen II',
  'tier.Difficult1': 'Difficile I', 'tier.Difficult2': 'Difficile II', 'tier.Extreme': 'Extrême',
  'roster.title': 'Collection', 'roster.owned': '{a} / {b}', 'roster.complete': 'Complète !', 'roster.locked': 'Non obtenu',
  'grade.COMMON': 'Commun', 'grade.RARE': 'Rare', 'grade.EPIC': 'Épique', 'grade.SPECIAL': 'Spécial',
  'cond.login_streak': 'Connexion {a}/{b} jours', 'cond.challenge_count': 'Défis {a}/{b}',
  'cond.stage_stars': 'Étoiles {a}/{b}', 'cond.customization_categories': 'Styles {a}/{b}', 'cond.done': 'Débloqué',
  'gacha.title': 'Tirage', 'gacha.gems': 'Gemmes', 'gacha.price': '{n} gemmes', 'gacha.draw': 'Tirer',
  'gacha.tapReveal': 'Touchez pour révéler', 'gacha.new': 'NOUVEAU', 'gacha.need': 'Gemmes insuffisantes',
  'gacha.complete': 'Tout collecté', 'gacha.progress': 'Tirages {a} / {b}',
  'clear.title': 'Niveau terminé', 'clear.score': 'Score', 'clear.rot': 'Tours', 'clear.reward': '+{n} gemmes',
  'clear.unlocked': 'Niveau {n} débloqué', 'clear.next': 'Suivant',
  'onb.tap': 'Maintenez pour accélérer',
  'onb.air': 'Maintenez en l’air pour tourner',
  'gacha.locked': 'Pas encore disponible',
};

const ru: Dict = {
  'nav.stages': 'Уровни', 'nav.roster': 'Коллекция', 'nav.gacha': 'Розыгрыш', 'nav.close': 'Закрыть',
  'stage.title': 'Уровни', 'stage.total': '{a} / {b} звёзд', 'stage.stage': 'Уровень {n}',
  'stage.locked.gate': 'Нужно {n} звёзд', 'stage.locked.prev': 'Пройдите уровень {n}',
  'stage.target.score': 'Цель по очкам {n}', 'stage.target.rot': 'Цель по оборотам {n}', 'stage.play': 'Играть',
  'tier.Easy': 'Легко', 'tier.Moderate1': 'Средне I', 'tier.Moderate2': 'Средне II',
  'tier.Difficult1': 'Сложно I', 'tier.Difficult2': 'Сложно II', 'tier.Extreme': 'Экстрим',
  'roster.title': 'Коллекция', 'roster.owned': '{a} / {b}', 'roster.complete': 'Собрано!', 'roster.locked': 'Нет',
  'grade.COMMON': 'Обычный', 'grade.RARE': 'Редкий', 'grade.EPIC': 'Эпический', 'grade.SPECIAL': 'Особый',
  'cond.login_streak': 'Вход {a}/{b} дней', 'cond.challenge_count': 'Испытания {a}/{b}',
  'cond.stage_stars': 'Звёзды {a}/{b}', 'cond.customization_categories': 'Стили {a}/{b}', 'cond.done': 'Открыт',
  'gacha.title': 'Розыгрыш', 'gacha.gems': 'Кристаллы', 'gacha.price': '{n} кристаллов', 'gacha.draw': 'Тянуть',
  'gacha.tapReveal': 'Нажмите, чтобы открыть', 'gacha.new': 'НОВОЕ', 'gacha.need': 'Не хватает кристаллов',
  'gacha.complete': 'Всё собрано', 'gacha.progress': 'Розыгрыши {a} / {b}',
  'clear.title': 'Уровень пройден', 'clear.score': 'Очки', 'clear.rot': 'Обороты', 'clear.reward': '+{n} кристаллов',
  'clear.unlocked': 'Уровень {n} открыт', 'clear.next': 'Далее',
  'onb.tap': 'Удерживайте для разгона',
  'onb.air': 'Удерживайте в воздухе для сальто',
  'gacha.locked': 'Пока недоступно',
};

export const UI_MESSAGES: Record<Locale, Dict> = {
  en, ko, ja, 'zh-Hans': zhHans, es, 'pt-BR': ptBR, de, fr, ru,
};

/** {n} {a} {b} 치환. 값이 없으면 자리표시자를 그대로 남기지 않고 빈 문자열. */
export function ut(locale: Locale, key: UiKey, params?: Record<string, string | number>): string {
  const raw = UI_MESSAGES[locale]?.[key] ?? UI_MESSAGES[FALLBACK_LOCALE][key];
  if (!params) return raw;
  return raw.replace(/\{(\w+)\}/g, (_m, k: string) => String(params[k] ?? ''));
}

/**
 * 브라우저 언어 자동 감지. ★ 언어 «선택 화면»을 만들지 않는다 —
 * 로드 즉시 플레이가 시작돼야 한다(CrazyGames 4종 전량거절 사유).
 */
export function detectLocale(nav: { language?: string; languages?: readonly string[] } = navigator): Locale {
  const cands = [...(nav.languages ?? []), nav.language ?? ''].filter(Boolean);
  for (const raw of cands) {
    const tag = raw.toLowerCase();
    const exact = SUPPORTED_LOCALES.find((l) => l.toLowerCase() === tag);
    if (exact) return exact;
    if (tag.startsWith('zh')) return 'zh-Hans';
    if (tag.startsWith('pt')) return 'pt-BR';
    const base = tag.split('-')[0];
    const hit = SUPPORTED_LOCALES.find((l) => l.toLowerCase() === base);
    if (hit) return hit;
  }
  return FALLBACK_LOCALE;
}
