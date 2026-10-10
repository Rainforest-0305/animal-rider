// index.ts — 9개 로케일 레지스트리. import.meta.glob eager 대신 명시 임포트
// (땅따먹기와 동일 원칙 참조, 신규 프로젝트라 파일 수가 적어 명시가 더 명확).
import { en } from './messages/en';
import { ko } from './messages/ko';
import { ja } from './messages/ja';
import { zhHans } from './messages/zh-Hans';
import { es } from './messages/es';
import { ptBR } from './messages/pt-BR';
import { de } from './messages/de';
import { fr } from './messages/fr';
import { ru } from './messages/ru';
import type { Messages } from './messages.d';
import { BRAND_EN, BRAND_KO } from '../brand';

export const SUPPORTED_LOCALES = ['en', 'ko', 'ja', 'zh-Hans', 'es', 'pt-BR', 'de', 'fr', 'ru'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
export const FALLBACK_LOCALE: Locale = 'en';

export const MESSAGES: Record<Locale, Messages> = {
  en, ko, ja, 'zh-Hans': zhHans, es, 'pt-BR': ptBR, de, fr, ru,
};

export function t(locale: Locale, key: keyof Messages): string {
  return MESSAGES[locale]?.[key] ?? MESSAGES[FALLBACK_LOCALE][key];
}

// ★ 게임명은 로케일 파일에 없다. brand.ts 단일 소스를 직접 참조한다.
// 규칙(설계서 6.3절 원칙 계승, 땅따먹기 사례 참조): ko만 한글명, 나머지
// 8개 로케일은 영문 브랜드 고정 - 미확정 상표라 로케일별 재작명은
// 검증 불가능한 리스크를 8배로 늘린다.
export function getGameTitle(locale: Locale): string {
  return locale === 'ko' ? BRAND_KO : BRAND_EN;
}
