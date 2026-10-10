// ui/critterPortrait.ts — 도감 초상화. ★새로 그리지 않는다: render/critterArt.ts 재사용.
//
// 왜 필요한가:
//   ui/roster.ts 의 FACE 맵 주석이 「스프라이트 도착 전 플레이스홀더 아이콘」이었다.
//   그 «스프라이트»는 2026-08-09 에 critterArt.ts(2,035줄, 24종 전량)로 도착했는데
//   플레이스홀더 이모지(🐇🐿️🦔…)가 그대로 남아 있었다. 이 파일이 그 교체다.
//
// 설계 결정 2건 (근거 명시):
//  ① 라이더를 «그리지 않는다». drawCritterArt() 는 동물+등급장식+라이더를 한 번에 그리지만,
//     라이더는 24종 «전부 동일»하다(같은 사람이 탄다). 도감 카드는 «동물»을 식별하는
//     화면이고 카드 옆에 animalKo(산토끼·다람쥐…)가 붙는다 — 24장 전부에 같은 라이더를
//     얹으면 정작 구분해야 할 동물을 가린다. 그래서 body + gradeDecor 만 쓴다.
//     (EPIC 림라이트는 drawCritterArt 안에 있어 여기서 동일 로직을 재현한다.)
//  ② bbox 를 «추측하지 않고 실측»한다. 종마다 크기가 크게 다르다(이무기=길고 낮음,
//     학=bodyLift 16 로 높음, 고슴도치=가시). 고정 박스를 박으면 어떤 종은 잘리고 어떤
//     종은 작게 뜬다. 오프스크린에 한 번 그려 «알파 경계»를 스캔해 종별 bbox 를 구하고
//     캐시한다(종당 1회, 24회 총합).
import {
  drawCritterBody,
  drawGradeDecor,
  critterBodyPath,
  paletteFor,
  getMountPoint,
  type Species,
} from '../render/critterArt';
import type { Grade } from '../game/roster';

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 종별 잉크 bbox(로컬좌표, 원점=접지점). 종당 1회만 실측하고 캐시한다. */
const BBOX_CACHE = new Map<string, Box>();

/** 실측용 오프스크린 크기. 로컬 bbox 는 대략 x -90..90 / y -160..10 안이라 넉넉히 잡는다. */
const M_SIZE = 400;
const M_ORIGIN_X = 200;
const M_ORIGIN_Y = 300;

function measureBBox(species: Species, grade: Grade): Box {
  const key = `${species}|${grade}`;
  const cached = BBOX_CACHE.get(key);
  if (cached) return cached;

  const fallback: Box = { x: -70, y: -120, w: 140, h: 124 };
  let box = fallback;

  try {
    const c = document.createElement('canvas');
    c.width = M_SIZE;
    c.height = M_SIZE;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    if (ctx) {
      ctx.save();
      ctx.translate(M_ORIGIN_X, M_ORIGIN_Y);
      // ★등급별로 «따로» 잰다 — 장식이 등급마다 몸통 밖으로 나가는 양이 다르다
      // (SPECIAL 후광은 머리 위로 크게 뜨고 COMMON 은 장식이 없다). 한 등급으로
      // 재서 돌려쓰면 장식 없는 등급이 그만큼 «작게» 뜬다(실렌더로 확인).
      const pal = paletteFor(grade);
      drawCritterBody(ctx, species, pal);
      drawGradeDecor(ctx, species, pal, grade, 0, getMountPoint(species));
      ctx.restore();

      const data = ctx.getImageData(0, 0, M_SIZE, M_SIZE).data;
      let minX = M_SIZE;
      let minY = M_SIZE;
      let maxX = -1;
      let maxY = -1;
      for (let y = 0; y < M_SIZE; y++) {
        for (let x = 0; x < M_SIZE; x++) {
          if (data[(y * M_SIZE + x) * 4 + 3] > 8) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }
      if (maxX >= minX && maxY >= minY) {
        box = {
          x: minX - M_ORIGIN_X,
          y: minY - M_ORIGIN_Y,
          w: maxX - minX + 1,
          h: maxY - minY + 1,
        };
      }
    }
  } catch {
    /* 캔버스를 못 쓰는 환경 — fallback 박스로 간다. 도감이 죽는 것보다 낫다. */
  }

  BBOX_CACHE.set(key, box);
  return box;
}

export interface PortraitOptions {
  species: Species;
  grade: Grade;
  /** CSS px 기준 한 변. 정사각으로 그린다. */
  size: number;
  /** 내부 여백 비율(0~0.4). 기본 0.12. */
  pad?: number;
}

/**
 * 캔버스 하나에 동물 초상화를 «맞춰» 그린다.
 * ★ 24종이 서로 다른 크기여도 카드 안에서 «같은 시각 무게»가 되도록 bbox 기준으로 맞춘다.
 */
export function drawCritterPortrait(canvas: HTMLCanvasElement, opts: PortraitOptions): void {
  const { species, grade, size } = opts;
  const pad = opts.pad ?? 0.06;

  const dpr = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, 3);
  canvas.width = Math.round(size * dpr);
  canvas.height = Math.round(size * dpr);
  canvas.style.width = `${size}px`;
  canvas.style.height = `${size}px`;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, size, size);

  const box = measureBBox(species, grade);
  const avail = size * (1 - pad * 2);
  const s = Math.min(avail / box.w, avail / box.h);

  ctx.save();
  // bbox 중심을 캔버스 중심에 오도록 이동 후 스케일
  ctx.translate(size / 2, size / 2);
  ctx.scale(s, s);
  ctx.translate(-(box.x + box.w / 2), -(box.y + box.h / 2));

  const pal = paletteFor(grade);

  // EPIC 림라이트 — drawCritterArt() 와 «같은» 처리(1.06배 glow 선깔기)
  if (grade === 'EPIC' && pal.glow) {
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.scale(1.06, 1.06);
    const g = pal.glow;
    drawCritterBody(ctx, species, { ...pal, bodyTop: g, bodyBottom: g, bodyOutline: g });
    ctx.restore();
  }

  drawCritterBody(ctx, species, pal);
  drawGradeDecor(ctx, species, pal, grade, 0, getMountPoint(species));

  // SPECIAL 시머 — 정지 초상화라 «고정 위치»로 한 줄만(애니메이션 없음)
  if (pal.shimmer) {
    ctx.save();
    critterBodyPath(ctx, species);
    ctx.clip();
    ctx.globalAlpha = 0.45;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 12;
    ctx.beginPath();
    ctx.moveTo(-30, 10);
    ctx.lineTo(20, -70);
    ctx.stroke();
    ctx.restore();
  }

  ctx.restore();
}
