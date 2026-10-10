// ── src/render/zones.ts ────────────────────────────────────────────────────
// 존(테마) 시스템 — «이미지 레이어 렌더링 파이프».
//
// 배경: 48스테이지가 전부 «파란하늘 + 초록언덕» 1종이었다(실측). 로데오 스탬피드
// 벤치마크의 격차표에서 「스테이지 48개에 대응하는 배경/테마 자산 로드맵 필요」로
// 잡힌 항목이다. 2026-08-18 President 지시로 방식이 확정됐다 —
//   「그래픽 퀄리티가 너무 떨어지잖아. 기성 게임 수준으로 만들라고.」
//   ⇒ 캔버스 도형으로 그린 배경은 색을 아무리 잘 잡아도 프로토타입으로 보인다.
//   ⇒ 배경은 «생성된 실제 아트 에셋(PNG)»을 레이어로 깔고, 이 파일은 그 파이프만 맡는다.
//
// ★ 이 파일의 설계 원칙 3가지
//   ① «데이터 주도» — 존을 늘리고 줄이는 건 아래 ZONES 배열 하나만 고치면 된다.
//   ② «에셋이 없어도 게임은 돈다» — 이미지가 없거나 로드에 실패하면 main.ts 의
//      기존 도형 렌더(drawSky/drawMountainLayer/drawClouds/drawNearHillLayer)로
//      그대로 폴백한다. 이 파일은 예외를 던지지 않는다.
//   ③ «main.ts 최소 접촉» — 팔레트(PAL)·critterArt 는 다른 라인 소유라 손대지 않는다.
//      여기서 필요한 색은 «존 전용» 상수로 이 파일 안에만 둔다.
//
// 에셋 배치 규약(아트 라인과의 계약):
//   원본:  05_동물라이더/assets_generated/zone_<id>/{L1_sky,L2_far,L3_mid,L4_near,ground_tile}.png
//   배포:  animal-stunt/public/zones/<id>/...   ← tools/sync_zone_assets.mjs 가 복사
//   런타임 URL: <base>zones/<id>/L1_sky.png
//   ⇒ 아트 라인은 assets_generated 에 «파일만 끼우면» 된다. 코드 수정 불요.
//
// ★★ 에셋 요구사항(아트 라인이 «반드시» 지켜야 하는 것) ★★
//   ① L1~L4 : «좌우 끝이 이어지는» 그림(가로 심리스). 코드는 폭 tileW 로 % 연산해
//      무한 반복만 책임진다 — 그림 자체가 안 이어지면 스크롤할 때마다 세로 이음선이 보인다.
//   ② L2~L4 : 배경이 «투명»(알파)이어야 뒤 레이어가 비친다. 하늘색을 칠해 넣으면
//      원경이 통째로 가려진다.
//   ③ ground_tile : ★가로 «세로» 둘 다 심리스. 지형 채우기 영역은 지형선부터 화면
//      바닥까지라 세로로도 여러 장 반복된다. 세로에 «선형» 명암을 넣으면 타일 경계마다
//      밝기가 끊겨 화면을 가로지르는 실선이 생긴다(실측: 1280x720 에서 y≈490 가로줄).
//   ④ 권장 크기: L1 1024x1024 이상 / L2~L4 1024x512 이상 / ground_tile 512x512 정사각.

// ── 타입 ───────────────────────────────────────────────────────────────────

/** 레이어 파일 키. 순서 = 그리는 순서(먼 것 → 가까운 것). */
export type ZoneLayerKey = 'L1_sky' | 'L2_far' | 'L3_mid' | 'L4_near';

export interface ZoneLayerSpec {
  key: ZoneLayerKey;
  /**
   * 가로 패럴랙스 계수. 0 = 완전 고정, 1 = 지형과 같은 속도.
   * L1(하늘)은 거의 고정, L4(근경)는 거의 1.0 이 되도록 잡는다.
   */
  parallaxX: number;
  /** 세로 패럴랙스 계수. 카메라 상하 이동을 얼마나 따라갈지(0=고정, 1=지형과 동일). */
  parallaxY: number;
  /**
   * 화면 전체를 덮는 레이어인가(하늘). true 면 bottomFrac/heightFrac 을 무시하고
   * 높이=viewH 로 깔아 화면을 채운다.
   */
  cover?: boolean;
  /** 레이어 «아래끝»을 지면 스크린선에서 얼마나 위에 둘지(viewH 대비 비율). */
  bottomFrac?: number;
  /** 레이어 높이(viewH 대비 비율). */
  heightFrac?: number;
  /** 합성 투명도(원경을 옅게 깔고 싶을 때). 기본 1. */
  alpha?: number;
}

/**
 * 지형 «가장자리» 색. 지면 채우기는 타일 이미지가 맡지만, 그 위에 얹히는
 * 잔디캡·텁·외곽선은 여전히 도형이다. 이걸 존별로 안 바꾸면 사막·설원·밤하늘 위에
 * 형광 초록 잔디가 그려진다(실측: 첫 렌더에서 그렇게 나왔다).
 * ★ main.ts 의 PAL 은 «다른 라인 소유»라 손대지 않는다. 여기 값이 있으면 덮어쓰고,
 *   없으면(null) main.ts 가 PAL 을 그대로 쓴다 — 초원은 PAL 그대로가 정답이다.
 */
export interface ZoneTrim {
  cap: string;   // 지형 상단 띠(§5.2 grassCap 자리)
  tuft: string;  // 상단 스파이크(§5.4 grassTuft 자리)
  line: string;  // 상단 외곽선(§5.3 groundLine 자리)
  /** 스파이크(풀포기)를 그릴지. 사막·설원처럼 «풀이 없어야» 하는 존은 false. */
  tufts: boolean;
}

export interface ZoneDef {
  /** 폴더명·저장키에 쓰는 영문 소문자 식별자. 에셋 폴더는 zone_<id>. */
  id: string;
  nameKo: string;
  nameEn: string;
  /** 스테이지 선택 화면의 존 뱃지 색(존 전용 상수 — main.ts PAL 과 무관). */
  accent: string;
  /** 뱃지 글자색(accent 위에 얹힌다). */
  accentInk: string;
  layers: ZoneLayerSpec[];
  /** 지형 채우기 타일 파일명. null 이면 기존 그라디언트 채우기를 쓴다. */
  groundTile: string | null;
  /** 지형 가장자리 색. null 이면 main.ts 의 PAL 값을 그대로 쓴다. */
  trim: ZoneTrim | null;
}

/** main.ts 가 넘기는 «이번 프레임의 카메라 상태». 렌더 모듈은 게임 상태를 모른다. */
export interface ZoneViewport {
  viewW: number;
  viewH: number;
  /** 월드 px -> 화면 CSS px 배율 */
  scale: number;
  camX: number;
  camY: number;
  /** 접지 시 라이더가 놓이는 화면 Y(= main.ts GROUND_SCREEN_Y) */
  groundScreenY: number;
}

// ── 레이어 배치 프리셋 ─────────────────────────────────────────────────────
// ★ 존마다 다른 «그림»을 쓰되 «배치»는 공통이다. 배치까지 존별로 흩어놓으면
//   에셋 한 장 교체할 때마다 숫자를 다시 맞춰야 한다(유지보수 비용이 존 수만큼 곱해진다).
//   존별로 배치를 달리 해야 할 사정이 생기면 그때 해당 존만 layers 를 덮어쓰면 된다.
//
// 패럴랙스 값 근거: 기존 도형 배경이 쓰던 계수(먼산 0.15 / 구름 0.35 / 근경둔덕 0.6)를
//   그대로 계승했다. 체감 깊이가 이미 검증된 값이라 새로 만들 이유가 없다.
//   L1(하늘)만 0.02 로 «거의 고정» — 하늘이 지형을 따라 흐르면 원근이 무너진다.
const DEFAULT_LAYERS: ZoneLayerSpec[] = [
  { key: 'L1_sky', parallaxX: 0.02, parallaxY: 0.04, cover: true },
  { key: 'L2_far', parallaxX: 0.15, parallaxY: 0.10, bottomFrac: 0.10, heightFrac: 0.46 },
  { key: 'L3_mid', parallaxX: 0.35, parallaxY: 0.14, bottomFrac: 0.045, heightFrac: 0.34 },
  { key: 'L4_near', parallaxX: 0.62, parallaxY: 0.20, bottomFrac: 0.0, heightFrac: 0.26, alpha: 0.95 },
];

function zone(
  id: string,
  nameKo: string,
  nameEn: string,
  accent: string,
  accentInk: string,
  trim: ZoneTrim | null
): ZoneDef {
  return {
    id, nameKo, nameEn, accent, accentInk,
    layers: DEFAULT_LAYERS, groundTile: 'ground_tile.png', trim,
  };
}

// ── 존 정의(정본) ──────────────────────────────────────────────────────────
// ★ 6존 × 8스테이지 = 48. 존을 늘리려면 여기에 추가하고 STAGES_PER_ZONE 만 맞추면 된다
//   (배분 함수는 존 개수를 «세어서» 쓰므로 다른 곳을 고칠 필요가 없다).
// ★ 왜 8존이 아니라 6존인가 — 존 하나당 에셋 5장(4레이어+지면타일)이고, 8존이면 40장을
//   생성·검수해야 한다. 6존 30장으로 시작하고, 아트 라인 산출 속도를 보고 늘린다.
//   48/6 = 8 이라 나누어떨어져 «8스테이지마다 전환»이라는 체감 규칙도 깔끔하다.
export const ZONES: ZoneDef[] = [
  // 초원은 trim=null — 기존 PAL 초록이 그대로 정답이다(존 시스템 도입 전 화면과 동일).
  zone('meadow', '초원', 'Meadow', '#5FAE52', '#FFFFFF', null),
  zone('forest', '깊은 숲', 'Deep Forest', '#2F7D5B', '#FFFFFF',
    { cap: '#6FD98F', tuft: '#3FA268', line: '#0C3A26', tufts: true }),
  zone('desert', '모래바람', 'Dunes', '#D9A441', '#3A2A10',
    { cap: '#F2D28A', tuft: '#C79A4E', line: '#7A5320', tufts: false }),
  zone('snow', '눈 덮인 봉우리', 'Snow Peaks', '#7FB6D9', '#12303F',
    { cap: '#FFFFFF', tuft: '#DCEBF5', line: '#7E9AAE', tufts: false }),
  zone('volcano', '불의 계곡', 'Ember Valley', '#C24B2C', '#FFFFFF',
    { cap: '#FF9A4D', tuft: '#C0552A', line: '#3A140E', tufts: true }),
  zone('starry', '별밤 언덕', 'Starlit Hills', '#3B3A78', '#FFFFFF',
    { cap: '#8E86D6', tuft: '#5B54A0', line: '#1A1738', tufts: true }),
];

/** 존 하나가 담당하는 스테이지 수. ZONES.length * STAGES_PER_ZONE 가 48 이 되게 유지한다. */
export const STAGES_PER_ZONE = 8;

/** 0-based 전역 스테이지 인덱스 -> 존. 범위를 벗어나면 끝 존으로 물린다(예외 없음). */
export function zoneForStageIndex(index0: number): ZoneDef {
  const i = Math.floor((Number.isFinite(index0) ? Math.max(0, index0) : 0) / STAGES_PER_ZONE);
  return ZONES[Math.min(i, ZONES.length - 1)];
}

/** 1-based 스테이지 번호 -> 존. UI 쪽 편의용. */
export function zoneForStageNumber(number1: number): ZoneDef {
  return zoneForStageIndex((number1 || 1) - 1);
}

/** 존 전환이 «일어나는» 스테이지 번호인가(1-based). 스테이지 선택 화면의 구분선용. */
export function isZoneStartStage(number1: number): boolean {
  return (number1 - 1) % STAGES_PER_ZONE === 0;
}

// ── 에셋 로더 ──────────────────────────────────────────────────────────────
// ★ 이 로더는 «절대 던지지 않는다». 실패는 상태값 'error' 로만 남고, 렌더는 폴백한다.
//   네트워크·파일부재·디코드실패를 구분하지 않는다 — 어느 쪽이든 화면에서 할 일은 같다.

type SlotState = 'idle' | 'loading' | 'ready' | 'error';

interface Slot {
  url: string;
  state: SlotState;
  img: HTMLImageElement | null;
}

const slots = new Map<string, Slot>();

function assetUrl(zoneId: string, file: string): string {
  // vite base 는 './' (상대) 라 BASE_URL 이 './' 또는 '/' 로 온다. 둘 다 그대로 이어붙이면 된다.
  const base = (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? './';
  return `${base}zones/${zoneId}/${file}`;
}

function getSlot(url: string): Slot {
  let s = slots.get(url);
  if (s) return s;
  s = { url, state: 'idle', img: null };
  slots.set(url, s);
  return s;
}

function loadSlot(url: string): Slot {
  const s = getSlot(url);
  if (s.state !== 'idle') return s;
  // 브라우저가 아닌 환경(헤드리스 검산 스크립트 등)에서 import 될 수 있다 — 조용히 포기한다.
  if (typeof Image === 'undefined') {
    s.state = 'error';
    return s;
  }
  s.state = 'loading';
  const img = new Image();
  img.decoding = 'async';
  img.onload = () => {
    // 0x0 디코드는 «로드 성공»으로 보고되더라도 그릴 수 없다. ready 로 올리면 안 된다.
    if (img.naturalWidth > 0 && img.naturalHeight > 0) {
      s.img = img;
      s.state = 'ready';
    } else {
      s.state = 'error';
    }
  };
  img.onerror = () => {
    s.state = 'error';
  };
  img.src = url;
  return s;
}

/** 존 에셋 5종의 로드를 «시작»한다. 완료를 기다리지 않는다(첫 프레임을 막지 않기 위해). */
export function preloadZone(z: ZoneDef): void {
  for (const l of z.layers) loadSlot(assetUrl(z.id, `${l.key}.png`));
  if (z.groundTile) loadSlot(assetUrl(z.id, z.groundTile));
}

// ── 활성 존 ────────────────────────────────────────────────────────────────

let active: ZoneDef = ZONES[0];

/**
 * 검증용 훅 ?zone=<id> — 존을 강제 고정한다. 존별 스크린샷을 스테이지 진행 없이 찍기 위한 것.
 * 다른 디버그 파라미터들과 같은 «URL 이 있을 때만» 정책을 따른다.
 */
function forcedZone(): ZoneDef | null {
  if (typeof location === 'undefined') return null;
  const id = new URLSearchParams(location.search).get('zone');
  if (!id) return null;
  return ZONES.find((z) => z.id === id) ?? null;
}

/** 런 시작 시 호출. 존이 바뀌면 새 존 에셋 로드를 시작한다. */
export function setActiveZone(z: ZoneDef): void {
  const forced = forcedZone();
  const next = forced ?? z;
  active = next;
  preloadZone(next);
}

export function activeZone(): ZoneDef {
  return active;
}

// ── 렌더 ───────────────────────────────────────────────────────────────────

/**
 * 하늘 세로 «여유분»(viewH 대비). 카메라 상하 패럴랙스로 하늘이 위로 밀릴 때
 * 화면 아래가 비지 않도록 이만큼 더 길게 그린다. 종전 코드의 «위로 6% 물리기»와
 * 같은 폭이라 체감 깊이는 그대로 유지된다.
 */
const SKY_OVERSCAN_Y = 0.06;

/** 레이어 «아래끝» 화면 Y. 기존 horizonY() 와 같은 형태 — 카메라 세로이동을 약하게 반영. */
function layerBottomY(vp: ZoneViewport, bottomFrac: number, parallaxY: number): number {
  return vp.groundScreenY - vp.viewH * bottomFrac + vp.camY * vp.scale * parallaxY;
}

/**
 * 가로 심리스 타일링. scrollPx 만큼 왼쪽으로 흐르며 화면을 채운다.
 * ★ 이음매 방지의 핵심은 «타일 폭을 정수로 반올림하지 않는 것»이 아니라 «항상 화면 오른쪽
 *   끝을 넘길 때까지 한 장 더 그리는 것»이다. x < viewW 조건이 그 역할을 한다.
 */
function drawTiled(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  scrollPx: number,
  y: number,
  h: number,
  viewW: number,
  extendToY: number
): void {
  const tileW = img.naturalWidth * (h / img.naturalHeight);
  if (!(tileW > 0.5) || !(h > 0.5)) return; // 비정상 크기 방어(0 나누기·무한 루프 차단)
  let off = scrollPx % tileW;
  if (off < 0) off += tileW;
  // 1px 겹쳐 그려서 서브픽셀 반올림 때문에 생기는 «세로 실선»을 막는다.
  const step = tileW - 0.5;
  // ★ 레이어 아래끝이 화면 중간에서 «뚝» 끊기면 가로 실선처럼 보인다(실측: 첫 렌더에서
  //   L4_near 아래 경계가 그대로 드러났다). 이미지 «맨 아랫줄 1px»을 화면 바닥까지
  //   늘려 채워 그 경계를 없앤다 — 지형이 그 위에 덮이므로 늘어난 부분은 보이지 않는다.
  const fillH = extendToY - (y + h);
  const srcY = Math.max(0, img.naturalHeight - 1);
  for (let x = -off; x < viewW; x += step) {
    ctx.drawImage(img, x, y, tileW, h);
    if (fillH > 0.5) {
      ctx.drawImage(img, 0, srcY, img.naturalWidth, 1, x, y + h - 0.5, tileW, fillH + 1);
    }
  }
}

/**
 * 하늘(cover) 레이어 렌더 — «가로 타일링을 쓰지 않는다».
 *
 * ★ 왜 다른 레이어와 다른가 (2026-08-18 실측 결함 수정)
 *   L2~L4 는 «좌우가 이어지는» 반복 소재라 drawTiled 가 맞다. 그러나 L1_sky 는
 *   1024x1024 «유일 구도»다 — 해·달이 그림 «안»에 하나씩 들어 있다. 이걸 가로로
 *   반복하면 해가 2개가 된다:
 *     1920x1080 -> tileW = 1024 * (1080/1024) = 1080 -> 화면에 1.78장 -> 해 2개.
 *   meadow/desert/snow/starry 4존에서 «데스크톱 가로 화면»으로 재현했다(캡처 보관).
 *   MS Store 는 데스크톱 스토어라 심사자가 보는 게 정확히 이 화면이다.
 *
 * ★ 왜 «cover(폭 맞춤 + 세로 크롭)» 가 아니라 «높이 맞춤 + 가장자리 클램프» 인가
 *   1920 폭을 1024 그림으로 덮으려면 1.875배가 필요하다. 실제로 그려 보니 해가
 *   화면 높이의 40% 를 차지하고 원경 산줄기와 겹쳐 «확대 사고»처럼 보였다
 *   (SKYFIT_meadow_cover_1920x1080.png). 높이 맞춤은 원화 배율을 그대로 지키고
 *   남는 좌우만 «가장자리 1px 열»로 늘려 채운다 — L1 좌우 끝은 어느 존이든
 *   구름·별이 닿지 않는 순수 그라디언트라 이음매가 눈에 띄지 않는다(6존 실측).
 *   1920/390 «양쪽»에서 그려 보고 고른 값이다. 한쪽만 보고 정하지 않았다.
 */
function drawSkyFitted(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  scrollPx: number,
  panY: number,
  overscanY: number,
  viewW: number,
  viewH: number
): void {
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  if (!(iw > 0) || !(ih > 0) || !(viewW > 0.5) || !(viewH > 0.5)) return;

  // 세로 패럴랙스(panY, 0 이하)만큼 위로 밀리므로 그만큼 «더 길게» 그려야 아래가 안 빈다.
  const dh = viewH + overscanY;
  const dw = iw * (dh / ih);
  const slack = dw - viewW;

  let x0: number;
  if (slack > 0) {
    // 그림이 화면보다 넓다(세로 화면). 남는 폭 «안에서만» 패럴랙스로 움직인다.
    // 넘어가게 두면 그림 바깥(빈 캔버스)이나 다음 장이 화면에 들어온다.
    x0 = Math.min(0, Math.max(-slack, -slack / 2 - scrollPx));
  } else {
    // 그림이 화면보다 좁다(가로 화면). 중앙에 고정하고 좌우는 가장자리 색으로 잇는다.
    x0 = -slack / 2;
  }

  // ★ 좌우 여백은 «가장자리 1px 열»을 늘려 채운다. 왜 «거울 반복»이 아닌가 —
  //   실제로 6존 전부 그려 보니 snow 는 해가 그림 «오른쪽»에 있어서, 거울 사본이
  //   그 해를 화면 오른쪽 끝으로 도로 데려왔다(FILL_snow_mirror.png). 지금 고치는
  //   결함이 그대로 재발한다. 1px 열은 «물체를 담을 수 없으므로» 구조적으로 안전하다.
  //   meadow/desert/starry/volcano/forest 에서는 거울 쪽이 더 예뻤지만, 존마다 방식을
  //   달리하면 새 존 에셋이 들어올 때마다 같은 함정을 다시 밟는다.
  // ★ 채우기를 «먼저» 깔고 본체를 나중에 그린다. 순서를 바꾸면 본체 위에 늘린 띠가
  //   겹쳐 테두리처럼 보인다.
  const right = x0 + dw;
  if (x0 > 0.5) {
    ctx.drawImage(img, 0, 0, 1, ih, 0, panY, Math.ceil(x0) + 1, dh);
  }
  if (right < viewW - 0.5) {
    ctx.drawImage(img, iw - 1, 0, 1, ih, right - 1, panY, viewW - right + 2, dh);
  }
  ctx.drawImage(img, x0, panY, dw, dh);
}

/**
 * 존 배경(이미지 레이어)을 그린다.
 * @returns true = 이미지로 그렸다 / false = 에셋이 없다, 호출부가 «기존 도형 렌더»로 폴백해야 한다.
 *
 * ★ 폴백 기준을 «L1_sky 하나»로 잡은 이유: 하늘은 화면을 덮는 유일한 레이어라 이게 없으면
 *   나머지가 있어도 배경이 뚫린다(캔버스 잔상이 남는다). 반대로 하늘만 있으면 나머지는
 *   있는 것만 얹어도 화면이 성립한다 — 에셋이 순차 도착하는 동안에도 깨지지 않는다.
 */
export function drawZoneBackground(ctx: CanvasRenderingContext2D, vp: ZoneViewport): boolean {
  const z = active;
  const skySpec = z.layers.find((l) => l.key === 'L1_sky');
  if (!skySpec) return false;
  const sky = loadSlot(assetUrl(z.id, 'L1_sky.png'));
  if (sky.state !== 'ready' || !sky.img) {
    // 아직 로딩 중이어도 폴백으로 그린다 — 첫 프레임이 검게 뜨는 것보다 낫다.
    return false;
  }

  for (const spec of z.layers) {
    const slot = loadSlot(assetUrl(z.id, `${spec.key}.png`));
    if (slot.state !== 'ready' || !slot.img) continue;
    const img = slot.img;
    const scrollPx = vp.camX * spec.parallaxX * vp.scale;

    // ★ 하늘(cover)은 «가로로 반복하지 않는다» — 해·달이 그림 안에 있어 반복하면 2개가 된다.
    if (spec.cover) {
      const overscanY = vp.viewH * SKY_OVERSCAN_Y;
      const panY = Math.min(0, Math.max(-overscanY, vp.camY * vp.scale * spec.parallaxY));
      const a0 = spec.alpha ?? 1;
      if (a0 !== 1) {
        ctx.save();
        ctx.globalAlpha = a0;
        drawSkyFitted(ctx, img, scrollPx, panY, overscanY, vp.viewW, vp.viewH);
        ctx.restore();
      } else {
        drawSkyFitted(ctx, img, scrollPx, panY, overscanY, vp.viewW, vp.viewH);
      }
      continue;
    }

    const h = vp.viewH * (spec.heightFrac ?? 0.3);
    const y = layerBottomY(vp, spec.bottomFrac ?? 0, spec.parallaxY) - h;

    const extendToY = vp.viewH;
    const a = spec.alpha ?? 1;
    if (a !== 1) {
      ctx.save();
      ctx.globalAlpha = a;
      drawTiled(ctx, img, scrollPx, y, h, vp.viewW, extendToY);
      ctx.restore();
    } else {
      drawTiled(ctx, img, scrollPx, y, h, vp.viewW, extendToY);
    }
  }
  return true;
}

// 지면 타일 «월드» 높이(px). 지형과 같이 스크롤·확대되도록 월드 단위로 잡는다.
// 지형 기복이 -83~+124(실측 폭 약 207px) 이므로 타일 한 장이 그 절반쯤 되게 두면
// 언덕 하나에 타일이 2~3장 들어가 반복이 눈에 덜 띈다.
const GROUND_TILE_WORLD_H = 150;

/**
 * 지형 채우기용 패턴. 곡선 path 를 fill 할 때 fillStyle 로 쓴다.
 * @returns null 이면 타일 에셋이 없다 — 호출부가 기존 그라디언트 채우기를 써야 한다.
 *
 * ★ 패턴 원점을 «월드 y=0 의 화면 Y» 에 맞춘다. 화면 좌상단에 맞추면 카메라가 위아래로
 *   움직일 때 지면 무늬가 지형과 «따로» 미끄러져 붙어 있지 않은 것처럼 보인다.
 */
export function zoneGroundPattern(
  ctx: CanvasRenderingContext2D,
  vp: ZoneViewport
): CanvasPattern | null {
  const z = active;
  if (!z.groundTile) return null;
  const slot = loadSlot(assetUrl(z.id, z.groundTile));
  if (slot.state !== 'ready' || !slot.img) return null;
  if (typeof DOMMatrix === 'undefined') return null; // setTransform 불가 환경은 폴백

  const img = slot.img;
  const pat = ctx.createPattern(img, 'repeat');
  if (!pat || typeof pat.setTransform !== 'function') return null;

  const k = (GROUND_TILE_WORLD_H * vp.scale) / img.naturalHeight;
  if (!(k > 0)) return null;
  const tw = img.naturalWidth * k;
  const th = img.naturalHeight * k;

  // 큰 좌표를 그대로 넣으면 float 정밀도가 떨어져 무늬가 떨린다 — 타일 크기로 접어 넣는다.
  const worldZeroY = vp.groundScreenY + vp.camY * vp.scale;
  const ox = -((((vp.camX * vp.scale) % tw) + tw) % tw);
  const oy = ((worldZeroY % th) + th) % th;

  pat.setTransform(new DOMMatrix([k, 0, 0, k, ox, oy]));
  return pat;
}

/**
 * 현재 존의 지형 가장자리 색. null 이면 호출부가 기존 PAL 값을 써야 한다.
 * ★ 지면 «타일 이미지»가 실제로 깔린 경우에만 값을 준다 — 폴백(도형) 상태에서
 *   가장자리만 존 색으로 바꾸면 초록 언덕에 보라 테두리가 생기는 식으로 어긋난다.
 */
export function zoneTrim(): ZoneTrim | null {
  const z = active;
  if (!z.trim || !z.groundTile) return null;
  const slot = getSlot(assetUrl(z.id, z.groundTile));
  return slot.state === 'ready' ? z.trim : null;
}

// ── 진단(디버그 HUD·자동검증용) ────────────────────────────────────────────
export interface ZoneAssetStatus {
  zoneId: string;
  zoneNameKo: string;
  files: Record<string, SlotState>;
  ready: number;
  total: number;
  usingImages: boolean;
}

export function zoneAssetStatus(): ZoneAssetStatus {
  const z = active;
  const files: Record<string, SlotState> = {};
  let ready = 0;
  let total = 0;
  const names = z.layers.map((l) => `${l.key}.png`).concat(z.groundTile ? [z.groundTile] : []);
  for (const n of names) {
    const s = getSlot(assetUrl(z.id, n));
    files[n] = s.state;
    total++;
    if (s.state === 'ready') ready++;
  }
  return {
    zoneId: z.id,
    zoneNameKo: z.nameKo,
    files,
    ready,
    total,
    usingImages: files['L1_sky.png'] === 'ready',
  };
}
