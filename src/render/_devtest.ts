// render/_devtest.ts — critterArt «단독» 렌더 하네스.
// COMMON 8종을 한 화면에 나란히 그려 «라이더가 몸통 위에 자연스럽게 앉는지»를
// 대조 확인한다. 제품 번들에 들어가지 않는다(index.html 이 참조하지 않음).
//
//   npm run dev  →  http://localhost:5183/src/render/_devtest.html
//
// 표의 «등라인/배라인» 수치는 손계산이 아니라 «오프스크린 캔버스 픽셀 스캔»
// 실측이다 — 몸통만 그린 뒤 좌석 x 열에서 최상단/최하단 불투명 픽셀을 찾는다.
// (내 path 대수계산이 틀려도 이 숫자는 틀리지 않는다.)

import type { Grade } from '../game/roster';
import {
  FEET_MAY_HANG,
  GRADE_PALETTES,
  MOUNT_POINTS_SPEC,
  RIDER_METRICS,
  SPECIES_LABEL_KO,
  SPECIES_ORDER,
  SPECIES_ORDER_V13,
  SPECIES_PARAMS,
  drawCritterArt,
  drawCritterBody,
  drawRiderFigure,
  getMountPoint,
  riderFootY,
  riderSeatY,
} from './critterArt';
import type { MountSource, Species } from './critterArt';

const QS = new URLSearchParams(location.search);
const GRADES: Grade[] = ['COMMON', 'RARE', 'EPIC', 'SPECIAL'];

let grade: Grade = (GRADES as string[]).includes((QS.get('grade') ?? '').toUpperCase())
  ? ((QS.get('grade') ?? '').toUpperCase() as Grade)
  : 'COMMON';
let mountSource: MountSource = QS.get('mount') === 'spec' ? 'spec' : 'applied';
let guides = QS.get('guides') === '1';
let animate = QS.get('anim') !== '0';
/** ?t=0.6 — 애니메이션 시각 «고정»(anim=0 과 함께). 시머 스윕·망토 웨이브처럼
 *  t=0 프레임엔 «화면에 존재하지 않는» 요소를 캡처로 검증할 때 쓴다. */
const T_FIXED = QS.has('t') ? Number(QS.get('t')) : null;

/** ?only=frog,duck — 일부 종만 크게 본다(근접 검수용). 미지정 = 8종 전부. */
const onlyParam = (QS.get('only') ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean) as Species[];
/** ?set=all|v11|v13 — 표시 집합(기본 all 24종). v11=COMMON 8, v13=RARE~SPECIAL 16. */
const SET = QS.get('set') ?? 'all';
const BASE_SET: readonly Species[] =
  SET === 'v11' ? SPECIES_ORDER.slice(0, 8) : SET === 'v13' ? SPECIES_ORDER_V13 : SPECIES_ORDER;
const SHOWN: readonly Species[] =
  onlyParam.length > 0 ? SPECIES_ORDER.filter((s) => onlyParam.indexOf(s) >= 0) : BASE_SET;
/** ?scale=1.8 — 셀 확대배율(기본 0.9). */
const CELL_SCALE = Number(QS.get('scale') ?? 0.9) || 0.9;

/**
 * ?only=frog&variants=-64,-70,-76 — 한 종을 여러 mount.y 후보로 «한 화면 비교».
 * ?variants=-64:-6,-70:0 처럼 `y:x` 로 x 도 같이 흔들 수 있다. 앵커 튜닝 전용.
 */
const VARIANTS: { x: number | null; y: number }[] = (QS.get('variants') ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)
  .map((s) => {
    const [ys, xs] = s.split(':');
    return { y: Number(ys), x: xs === undefined ? null : Number(xs) };
  })
  .filter((v) => Number.isFinite(v.y));
const VARIANT_MODE = VARIANTS.length > 0 && SHOWN.length === 1;

const stage = document.getElementById('stage') as HTMLCanvasElement;
const ctx = stage.getContext('2d') as CanvasRenderingContext2D;
const tableHost = document.getElementById('table') as HTMLElement;
const noteHost = document.getElementById('note') as HTMLElement;
const ctrls = document.getElementById('ctrls') as HTMLElement;

// ── 실측: 오프스크린 픽셀 스캔 ─────────────────────────────────────────────

interface BodyMetrics {
  topAtSeatX: number; // 좌석 x 열의 몸통 최고점(등라인) y
  botAtSeatX: number; // 같은 열의 최하단 y(배/발 라인)
  topGlobal: number; // 몸통 전체 최고점 y
}

const MEAS_W = 400;
const MEAS_H = 400;
const MEAS_OX = 200; // 원점 x(접지점)
const MEAS_OY = 300; // 원점 y(접지점)

function measureBody(species: Species): BodyMetrics {
  const c = document.createElement('canvas');
  c.width = MEAS_W;
  c.height = MEAS_H;
  const g = c.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;
  g.clearRect(0, 0, MEAS_W, MEAS_H);
  g.save();
  g.translate(MEAS_OX, MEAS_OY);
  drawCritterBody(g, species, GRADE_PALETTES[grade]); // ★ 라이더 없이 «몸통만»
  g.restore();

  const img = g.getImageData(0, 0, MEAS_W, MEAS_H).data;
  const seatX = Math.round(getMountPoint(species, mountSource).x) + MEAS_OX;

  let topAtSeatX = NaN;
  let botAtSeatX = NaN;
  for (let py = 0; py < MEAS_H; py++) {
    if (img[(py * MEAS_W + seatX) * 4 + 3] > 24) {
      if (Number.isNaN(topAtSeatX)) topAtSeatX = py;
      botAtSeatX = py;
    }
  }
  let topGlobal = NaN;
  outer: for (let py = 0; py < MEAS_H; py++) {
    for (let px = 0; px < MEAS_W; px++) {
      if (img[(py * MEAS_W + px) * 4 + 3] > 24) {
        topGlobal = py;
        break outer;
      }
    }
  }
  return {
    topAtSeatX: topAtSeatX - MEAS_OY,
    botAtSeatX: botAtSeatX - MEAS_OY,
    topGlobal: topGlobal - MEAS_OY,
  };
}

interface Row {
  species: Species;
  spec: [number, number];
  applied: [number, number];
  used: { x: number; y: number };
  m: BodyMetrics;
  seatY: number;
  footY: number;
  clearance: number; // 등라인 - 좌석선 (양수 = 라이더가 등 위에 뜸 = 정상)
  footInside: boolean;
  ok: boolean;
}

// 판정 대역. «여유» = 좌석 x 열의 실루엣 최고점 - 좌석선(mount.y+11).
//   음수 = 라이더가 몸통에 파묻힘(불합격)
//   0     = 엉덩이가 등/가시능선에 정확히 얹힘(고슴도치의 목표값)
//   >16   = 등 위로 떠서 다리가 허공에 뜬 것처럼 보임(불합격)
// ★ 대역 안 «어느 값이 예쁜지»는 수치로 못 정한다(둥근 조류는 3~4 가,
//   평평한 포유류는 11~13 이 자연스럽다) — 실제 렌더 몽타주로 골랐다.
const CLEAR_MIN = 0;
const CLEAR_MAX = 16;

function buildRows(): Row[] {
  return SPECIES_ORDER.map((species) => {
    const m = measureBody(species);
    const used = getMountPoint(species, mountSource);
    const seatY = riderSeatY(used);
    const footY = riderFootY(used);
    const clearance = m.topAtSeatX - seatY;
    // ★ 이무기는 몸통 두께(19px) < 라이더 다리길이(30.5px) 라 이 조건을 «구조적으로»
    //   만족할 수 없다. 규칙을 느슨하게 바꾸는 대신 예외 종만 명시하고 표에 표기한다.
    const footStructurallyExempt = FEET_MAY_HANG.indexOf(species) >= 0;
    const footInside =
      (footY > m.topAtSeatX && footY < m.botAtSeatX) || footStructurallyExempt;
    return {
      species,
      spec: MOUNT_POINTS_SPEC[species],
      applied: SPECIES_PARAMS[species].mountPoint,
      used,
      m,
      seatY,
      footY,
      clearance,
      footInside,
      ok: clearance >= CLEAR_MIN && clearance <= CLEAR_MAX && footInside,
    };
  });
}

function renderTable(rows: Row[]): void {
  const head = `<tr>
    <th>종</th><th>base</th><th>스펙 mount.y</th><th>적용 mount.y</th>
    <th>등라인 y<br>(좌석x 실측)</th><th>배라인 y<br>(좌석x 실측)</th>
    <th>좌석선 y<br>=mount.y+11</th><th>여유<br>(등라인-좌석)</th>
    <th>발끝 y<br>=mount.y+41.5</th><th>발 몸통안</th><th>판정</th>
  </tr>`;
  const body = rows
    .map((r) => {
      const cls = r.ok ? 'ok' : 'bad';
      const changed = r.spec[1] !== r.applied[1];
      return `<tr>
      <td class="name">${SPECIES_LABEL_KO[r.species]}</td>
      <td class="name">${SPECIES_PARAMS[r.species].base}</td>
      <td${changed ? ' class="bad"' : ''}>${r.spec[1]}</td>
      <td>${r.applied[1]}${changed ? ' *' : ''}</td>
      <td>${r.m.topAtSeatX.toFixed(1)}</td>
      <td>${r.m.botAtSeatX.toFixed(1)}</td>
      <td>${r.seatY.toFixed(1)}</td>
      <td class="${cls}">${r.clearance.toFixed(1)}</td>
      <td>${r.footY.toFixed(1)}</td>
      <td class="${r.footInside ? 'ok' : 'bad'}">${
        FEET_MAY_HANG.indexOf(r.species) >= 0 ? 'Y*' : r.footInside ? 'Y' : 'N'
      }</td>
      <td class="${cls}">${r.ok ? 'PASS' : 'FAIL'}</td>
    </tr>`;
    })
    .join('');
  const pass = rows.filter((r) => r.ok).length;
  tableHost.innerHTML =
    `<table>${head}${body}</table>` +
    `<div class="note"><b>mount=${mountSource} / grade=${grade} → PASS ${pass}/${rows.length}</b> · ` +
    `정상 대역: 여유 ${CLEAR_MIN}~${CLEAR_MAX}px &amp; 발끝이 몸통 내부. ` +
    `여유가 음수면 라이더가 몸통에 파묻힌 것, ${CLEAR_MAX} 초과면 뜬 것이다. ` +
    `등/배라인은 «몸통만 그린 오프스크린 캔버스»의 픽셀 스캔 실측이다.</div>`;
}

// ── 스테이지 렌더(8종 한 화면) ─────────────────────────────────────────────

const TILES = VARIANT_MODE ? VARIANTS.length : SHOWN.length;
const COLS = Math.min(4, TILES);
const ROWS = Math.ceil(TILES / COLS);
// 종 수에 맞춰 캔버스 높이를 늘린다(24종이면 6행). 셀이 찌그러지면 «파묻힘/뜸»
// 판별이 안 되므로 셀 높이는 항상 280px 이상 유지한다.
stage.height = Math.max(280, ROWS * 280);
const CELL_W = stage.width / COLS;
const CELL_H = stage.height / ROWS;

function drawCell(
  species: Species,
  cx: number,
  groundY: number,
  t: number,
  override?: { x: number; y: number }
): void {
  ctx.save();
  ctx.translate(cx, groundY);
  ctx.scale(CELL_SCALE, CELL_SCALE);

  // 접지 그림자
  ctx.fillStyle = 'rgba(0,0,0,0.16)';
  ctx.beginPath();
  ctx.ellipse(0, 0, 40, 7, 0, 0, Math.PI * 2);
  ctx.fill();

  drawCritterArt(ctx, { species, grade, t, mountSource, mountOverride: override });

  if (guides) {
    const mp = override ?? getMountPoint(species, mountSource);
    const seat = riderSeatY(mp);
    const foot = riderFootY(mp);
    ctx.save();
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    const line = (y: number, color: string) => {
      ctx.strokeStyle = color;
      ctx.beginPath();
      ctx.moveTo(-60, y);
      ctx.lineTo(70, y);
      ctx.stroke();
    };
    line(seat, '#C02626'); // 좌석선
    line(foot, '#1E5FC0'); // 발끝선
    ctx.setLineDash([]);
    ctx.fillStyle = '#C02626';
    ctx.beginPath();
    ctx.arc(mp.x, mp.y, 2.5, 0, Math.PI * 2); // mountPoint 자체
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

function frame(now: number): void {
  const t = T_FIXED !== null ? T_FIXED : animate ? now / 1000 : 0;
  ctx.clearRect(0, 0, stage.width, stage.height);

  for (let i = 0; i < TILES; i++) {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const cx = col * CELL_W + CELL_W / 2;
    const groundY = row * CELL_H + CELL_H - 44;

    // 셀 지면
    ctx.save();
    ctx.strokeStyle = 'rgba(31,74,42,.55)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(col * CELL_W + 10, groundY);
    ctx.lineTo((col + 1) * CELL_W - 10, groundY);
    ctx.stroke();
    ctx.restore();

    const sp = VARIANT_MODE ? SHOWN[0] : SHOWN[i];
    const base = getMountPoint(sp, mountSource);
    const override = VARIANT_MODE
      ? { x: VARIANTS[i].x ?? base.x, y: VARIANTS[i].y }
      : undefined;
    drawCell(sp, cx, groundY, t, override);

    // 라벨
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,.86)';
    const mpL = override ?? base;
    const label = `${SPECIES_LABEL_KO[sp]}  mount(${mpL.x},${mpL.y})`;
    ctx.font = 'bold 13px system-ui, sans-serif';
    const w = ctx.measureText(label).width + 12;
    ctx.beginPath();
    ctx.roundRect?.(cx - w / 2, groundY + 8, w, 20, 6);
    if (!ctx.roundRect) ctx.rect(cx - w / 2, groundY + 8, w, 20);
    ctx.fill();
    ctx.fillStyle = '#123';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, cx, groundY + 18);
    ctx.restore();
  }

  if (animate) requestAnimationFrame(frame);
}

// ── 컨트롤 ─────────────────────────────────────────────────────────────────

function btn(label: string, pressed: boolean, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.className = 'hbtn';
  b.textContent = label;
  b.setAttribute('aria-pressed', String(pressed));
  b.addEventListener('click', () => {
    onClick();
    rebuild();
  });
  return b;
}

function rebuild(): void {
  ctrls.innerHTML = '';
  for (const g of GRADES) ctrls.appendChild(btn(g, grade === g, () => (grade = g)));
  ctrls.appendChild(
    btn(`mount: ${mountSource}`, mountSource === 'spec', () => {
      mountSource = mountSource === 'applied' ? 'spec' : 'applied';
    })
  );
  ctrls.appendChild(btn(`guides: ${guides ? 'on' : 'off'}`, guides, () => (guides = !guides)));
  ctrls.appendChild(
    btn(`anim: ${animate ? 'on' : 'off'}`, animate, () => {
      animate = !animate;
      if (animate) requestAnimationFrame(frame);
    })
  );

  const rows = buildRows();
  renderTable(rows);
  noteHost.innerHTML =
    '★ 이 페이지는 <b>drawCritterBody + drawRiderFigure</b> 만 쓴다(main.ts 미참조). ' +
    'mount 토글로 <b>스펙 §10.9 원문값 ↔ 적용값</b> A/B 대조가 된다 — ' +
    'spec 쪽에서 고슴도치·참새·오리·개구리 라이더가 몸통에 파묻히는 것이 보인다. ' +
    `<br>drawRiderFigure 는 mountPoint 를 재킷 «중심»으로 쓴다(좌석선 = mount.y+${RIDER_METRICS.seatOffsetY}, ` +
    `발끝 = mount.y+${RIDER_METRICS.footVisualOffsetY}).`;

  if (!animate) requestAnimationFrame(frame);
}

rebuild();
requestAnimationFrame(frame);

// 콘솔에도 실측표를 뿌린다(헤드리스 캡처/로그 수집용)
console.table(
  buildRows().map((r) => ({
    종: SPECIES_LABEL_KO[r.species],
    base: SPECIES_PARAMS[r.species].base,
    spec_y: r.spec[1],
    applied_y: r.applied[1],
    등라인: +r.m.topAtSeatX.toFixed(1),
    좌석선: +r.seatY.toFixed(1),
    여유: +r.clearance.toFixed(1),
    발끝: +r.footY.toFixed(1),
    발_몸통안: r.footInside,
    판정: r.ok ? 'PASS' : 'FAIL',
  }))
);

// 사용하지 않는 import 경고 방지용(모듈 표면 확인 목적으로 남겨둔다)
void drawRiderFigure;
