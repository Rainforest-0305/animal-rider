// ui/roster.ts — 로스터/수집 화면(24종, 등급 섹션).
//
// ┌ 사용법 (main.ts 배선) ────────────────────────────────────────────────────
// │ import { openRoster } from './ui/roster';
// │ const screen = openRoster({ progress, locale, onClose: () => {} });
// │ screen.refresh();   // 가챠 후 보유 갱신
// │ screen.close();
// └───────────────────────────────────────────────────────────────────────────
//
// 표시 규칙:
//  · 종 목록·등급·해금조건은 전부 game/roster.ts 의 ROSTER 에서 읽는다.
//    24/20/4, COMMON 8·RARE 7·EPIC 5·SPECIAL 4 같은 숫자는 이 파일에 없다.
//  · 이름 표기 — ko 로케일은 nameKo(한글), 나머지 8개는 nameRomaji.
//    roster.ts 주석의 「로마자 표기는 9개 언어 공통 고정, 번역 안 함」 규칙 준수.
//  · 동물 종류(animalKo)는 «한국어 원문만 존재»한다. 다른 로케일에 그대로 뿌리면
//    한글이 섞이므로 ko 에서만 부제로 노출한다. (번역이 생기면 여기만 고치면 된다)
//  · 미보유는 회색 실루엣 + 물음표. SPECIAL 4종은 보석으로 살 수 없으므로
//    미보유여도 «해금 조건 진행바»를 보여준다(무엇을 하면 되는지가 보여야 한다).
//  · 아이콘은 스프라이트가 나오기 전까지의 «플레이스홀더»다(FACE 맵, 기본 🐾).
//    로스터에 새 id 가 생겨도 기본값으로 안전하게 표시된다.
import { el } from './dom';
import { icon } from './icons';
import { createModal } from './overlay';
import type { ScreenHandle } from './overlay';
import { ut, detectLocale } from './uiStrings';
import type { UiKey } from './uiStrings';
import type { Locale } from '../i18n';
import { collectionStatus, isOwned, rosterByGrade, specialUnlockState } from './meta';
import type { MetaProgress } from './meta';
import type { CritterSpec } from '../game/roster';
import { drawCritterPortrait } from './critterPortrait';
import { speciesForRosterId } from '../render/critterArt';

export interface RosterOptions {
  progress: MetaProgress;
  locale?: Locale;
  onClose?: () => void;
  /** 열자마자 이 종이 강조되어 보이도록(가챠 직후 도감 열 때). */
  highlightId?: string;
}

/** 스프라이트 도착 전 플레이스홀더 아이콘. 없으면 🐾. */
const FACE: Record<string, string> = {
  kkang: '🐇', daram: '🐿️', komul: '🦔', dotom: '🐷', bangul: '🐐', chong: '🐦',
  dwidung: '🦆', malang: '🐸', bureung: '🐗', sappun: '🦌', seureuk: '🦦', ureong: '🐂',
  huljjeok: '🦘', sallang: '🦊', eoseul: '🐺', beonjjeok: '🐆', udu: '🦏', geurim: '🐈‍⬛',
  hwing: '🦅', mireu: '🐉', haneul: '🕊️', bulti: '🔥', seori: '🐅', doldam: '🐢',
};

export function faceFor(id: string): string {
  return FACE[id] ?? '🐾';
}

export function critterName(c: CritterSpec, locale: Locale): string {
  return locale === 'ko' ? c.nameKo : c.nameRomaji;
}

/** 도감 카드 초상화 한 변(CSS px). styles.ts 의 .face-art 와 «같은 값»이어야 한다. */
const PORTRAIT_PX = 46;

export function openRoster(opts: RosterOptions): ScreenHandle {
  const locale = opts.locale ?? detectLocale();
  const p = opts.progress;
  let closed = false;

  const modal = createModal({
    titleText: ut(locale, 'roster.title'),
    closeLabel: ut(locale, 'nav.close'),
    onClose: () => handle.close(),
  });

  /**
   * 도감 초상화 노드. ★이모지 플레이스홀더를 대체한다.
   * critterArt.ts(인게임과 «같은» 그림)를 그대로 재사용한다 — 새 에셋 0건.
   */
  function portraitNode(c: CritterSpec): HTMLElement {
    const cv = el('canvas', { class: 'face-art', ariaHidden: true });
    try {
      drawCritterPortrait(cv, {
        species: speciesForRosterId(c.id),
        grade: c.grade,
        size: PORTRAIT_PX,
      });
    } catch {
      // 캔버스가 죽어도 도감은 떠야 한다 — 이모지로 되돌아간다(기존 동작 보존).
      return el('span', { class: 'face', text: faceFor(c.id), ariaHidden: true });
    }
    return cv;
  }

  function card(c: CritterSpec): HTMLElement {
    const owned = isOwned(c, p);
    const special = specialUnlockState(c, p);
    const name = critterName(c, locale);

    const kids: Array<Node | null> = [
      owned ? portraitNode(c) : icon('question', 't-unknown'),
      el('span', { class: 'nm', text: owned ? name : '???' }),
      locale === 'ko' && owned ? el('span', { class: 'an', text: c.animalKo }) : null,
    ];

    // 조건해금 종(SPECIAL): 미보유여도 진행 상황을 숫자+막대로 보여준다.
    if (special && !owned) {
      const pct = Math.max(0, Math.min(100, (special.current / special.target) * 100));
      kids.push(
        el('span', {
          class: 'ar-cond',
          text: ut(locale, `cond.${special.kind}` as UiKey, {
            a: special.current,
            b: special.target,
          }),
        }),
        el('span', { class: 'ar-prog' }, [el('i', { style: { width: `${pct}%` } })])
      );
    }

    const label = owned
      ? `${name} · ${ut(locale, `grade.${c.grade}` as UiKey)}`
      : `${ut(locale, 'roster.locked')} · ${ut(locale, `grade.${c.grade}` as UiKey)}` +
        (special
          ? ` · ${ut(locale, `cond.${special.kind}` as UiKey, { a: special.current, b: special.target })}`
          : '');

    const node = el(
      'div',
      {
        class: `ar-crit ${owned ? `own g-${c.grade}` : 'miss'}`,
        role: 'listitem',
        ariaLabel: label,
        dataset: { critId: c.id },
      },
      kids
    );
    if (opts.highlightId === c.id) node.classList.add('ar-pop');
    return node;
  }

  function render(): void {
    const body = modal.body;
    body.textContent = '';
    const st = collectionStatus(p);
    modal.setCount(
      st.complete
        ? ut(locale, 'roster.complete')
        : ut(locale, 'roster.owned', { a: st.owned, b: st.total })
    );

    for (const group of rosterByGrade()) {
      const ownedInGroup = group.members.filter((c) => isOwned(c, p)).length;
      body.appendChild(
        el('section', { class: 'ar-sec' }, [
          el('h3', { class: 'ar-sec-h' }, [
            el('span', { text: ut(locale, `grade.${group.grade}` as UiKey) }),
            el('span', {
              class: 'sub',
              text: ut(locale, 'roster.owned', { a: ownedInGroup, b: group.members.length }),
            }),
            // 제목과 오른쪽 여백 사이를 «선»으로 잇는다 — 섹션 폭이 눈에 잡힌다.
            el('span', { class: 'rule', ariaHidden: true }),
          ]),
          // ★ 「선반」 — 등급별 얕은 판 위에 형상을 올린다. 개편 전엔 여기가
          //   «동일 카드 24장 격자»였다(impeccable Absolute bans 정면 위반).
          //   등급은 선반 하나가 말한다 — 카드 24개에 각각 등급색 테두리를 두르는
          //   중복을 없앴다(섹션 제목이 이미 「일반/레어/에픽/스페셜」이라고 말한다).
          el(
            'div',
            { class: `ar-shelf g-${group.grade}`, role: 'list' },
            group.members.map((c) => card(c))
          ),
        ])
      );
    }
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
  return handle;
}
