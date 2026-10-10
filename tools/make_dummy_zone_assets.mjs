// tools/make_dummy_zone_assets.mjs — «존 파이프 검증용» 더미 에셋 생성기.
//
// ★★ 이건 최종 아트가 아니다 ★★
//   실제 배경은 아트 라인이 Kling 으로 생성해 assets_generated\zone_<id>\ 에 넣는다.
//   이 스크립트는 그 에셋이 «도착하기 전에» 렌더 파이프(타일링·패럴랙스·지면패턴·폴백)가
//   실제로 도는지 눈으로 확인하려고 만든 것이다. 에셋이 오면 sync 가 실물로 덮어쓴다.
//
// 좌우 심리스: 모든 무늬를 x 에 대해 «주기함수»로만 만든다(sin/모듈로). 그래서 타일
//   경계에서 이음매가 생기지 않는다 — 실제 에셋 생성 프롬프트에도 같은 요구가 들어가야 한다.
//
// 출력: 05_동물라이더/assets_dummy/zone_<id>/{L1_sky,L2_far,L3_mid,L4_near,ground_tile}.png
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { writePNG, hexToRgb, mix } from './png_min.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROJECT = path.resolve(HERE, '..');            // build/animal-stunt
const ROOT = path.resolve(PROJECT, '..', '..');      // 05_동물라이더
const OUT = path.join(ROOT, 'assets_dummy');

// ★ 존 팔레트는 «더미 전용»이다. src/main.ts 의 PAL 이나 critterArt 의 등급 팔레트와
//   무관하며 그 파일들을 참조하지도 않는다(다른 라인 소유 — 무접촉 규칙).
const ZONES = [
  { id: 'meadow',  sky: ['#7FCFF2', '#BEE8F5', '#FDEFD8'], far: '#B9C9E8', mid: '#8FC98A', near: '#5FAE52', g1: '#5FAE52', g2: '#2E6B3E' },
  { id: 'forest',  sky: ['#2E5F6E', '#4E8C86', '#CDE7C8'], far: '#3D6F63', mid: '#2F7D5B', near: '#1E5A41', g1: '#3E7A4A', g2: '#14361F' },
  { id: 'desert',  sky: ['#F5B94E', '#F7D79A', '#FDEBC6'], far: '#C9A06A', mid: '#D9A441', near: '#B37E32', g1: '#E0B45E', g2: '#8A5C22' },
  { id: 'snow',    sky: ['#6FA8CE', '#AFD3E8', '#EAF4FB'], far: '#9FC0DA', mid: '#CFE3F1', near: '#EAF4FB', g1: '#E6F1F8', g2: '#9BB4C6' },
  { id: 'volcano', sky: ['#2B1418', '#6E2A21', '#C24B2C'], far: '#4A2320', mid: '#7A3025', near: '#3A1A18', g1: '#5A2A22', g2: '#1C0C0B' },
  { id: 'starry',  sky: ['#0E1030', '#232457', '#4A3C77'], far: '#2A2A5E', mid: '#3B3A78', near: '#241F4A', g1: '#33305F', g2: '#12102A' },
];

const W = 512;

function skyPNG(file, stops) {
  const a = hexToRgb(stops[0]);
  const b = hexToRgb(stops[1]);
  const c = hexToRgb(stops[2]);
  const H = 512;
  writePNG(file, W, H, (x, y) => {
    const t = y / (H - 1);
    const col = t < 0.65 ? mix(a, b, t / 0.65) : mix(b, c, (t - 0.65) / 0.35);
    return [col[0], col[1], col[2], 255];
  });
}

// 실루엣 레이어: 아래는 꽉 찬 색, 위쪽 경계는 주기 곡선(좌우 심리스).
function ridgePNG(file, hex, opts) {
  const { H = 256, waves = [[1, 0.30, 0.0], [2, 0.14, 1.7], [3, 0.07, 3.1]], alpha = 255, jag = 0 } = opts || {};
  const col = hexToRgb(hex);
  writePNG(file, W, H, (x, y) => {
    const u = x / W;
    let top = 0.45;
    for (const [k, amp, ph] of waves) top -= amp * 0.5 * Math.sin(2 * Math.PI * k * u + ph);
    if (jag) {
      // 톱니(나무·바위 느낌) — 주기가 정수라 좌우가 이어진다.
      top += jag * 0.5 * (1 - Math.abs(((u * 24) % 1) * 2 - 1));
    }
    const topPx = Math.max(0, Math.min(H - 1, top * H));
    if (y < topPx) return [0, 0, 0, 0];
    // 아래로 갈수록 살짝 어둡게 — 평면으로 안 보이게.
    const d = (y - topPx) / Math.max(1, H - topPx);
    const c2 = mix(col, [0, 0, 0], d * 0.22);
    return [c2[0], c2[1], c2[2], alpha];
  });
}

// ★★ 지면 타일은 «가로 세로 둘 다» 심리스여야 한다 ★★
//   지형 채우기 영역은 지형선부터 화면 바닥까지라 세로로도 여러 장이 반복된다.
//   처음엔 v(세로)에 «선형» 명암을 넣었다가, 타일 경계마다 밝기가 뚝 끊겨 화면을 가로지르는
//   실선이 생겼다(실측: 1280x720 에서 y≈490 에 가로줄). 세로도 주기함수만 쓴다.
function groundTilePNG(file, hexA, hexB) {
  const H = 256;
  const A = hexToRgb(hexA);
  const B = hexToRgb(hexB);
  writePNG(file, 256, H, (x, y) => {
    const u = x / 256;
    const v = y / H;
    // u·v 모두 «정수 주기» sin 만 쓴다 -> 상하좌우 어느 방향으로 이어붙여도 이음매가 없다.
    const band = 0.5 + 0.5 * Math.sin(2 * Math.PI * 3 * u + 2 * Math.PI * 1 * v);
    const dot = 0.5 + 0.5 * Math.sin(2 * Math.PI * 8 * u) * Math.sin(2 * Math.PI * 6 * v);
    const t = 0.30 + band * 0.34 + dot * 0.18;
    const c = mix(A, B, Math.max(0, Math.min(1, t)));
    return [c[0], c[1], c[2], 255];
  });
}

let n = 0;
for (const z of ZONES) {
  const dir = path.join(OUT, `zone_${z.id}`);
  fs.mkdirSync(dir, { recursive: true });
  skyPNG(path.join(dir, 'L1_sky.png'), z.sky);
  ridgePNG(path.join(dir, 'L2_far.png'), z.far, { H: 256, waves: [[1, 0.34, 0.4], [2, 0.12, 2.1]] });
  ridgePNG(path.join(dir, 'L3_mid.png'), z.mid, { H: 224, waves: [[2, 0.26, 1.2], [3, 0.10, 0.3]] });
  ridgePNG(path.join(dir, 'L4_near.png'), z.near, { H: 192, waves: [[3, 0.18, 2.6]], jag: 0.10 });
  groundTilePNG(path.join(dir, 'ground_tile.png'), z.g1, z.g2);
  n += 5;
  console.log('dummy zone:', z.id, '->', dir);
}
console.log(`\n생성 ${n}장 (${ZONES.length}존 x 5). 이건 «검증용 더미»다 — 실제 아트로 교체 대상.`);
