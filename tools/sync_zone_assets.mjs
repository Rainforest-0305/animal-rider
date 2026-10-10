// tools/sync_zone_assets.mjs — 존 배경 에셋을 «배포 가능한 위치»로 복사한다.
//
// 왜 필요한가: 에셋 원본은 vite 프로젝트 루트 «밖»에 있다
//   (05_동물라이더/assets_generated/). vite 는 루트 밖 파일을 URL 로 서빙하지 않는다.
//   그래서 public/zones/<id>/ 로 복사해 정적 자산으로 만든다.
//   public/ 아래 파일은 dev 서버에서 «재시작 없이» 즉시 서빙되고, build 시 dist 로 그대로 복사된다.
//
// 우선순위: assets_generated(실물 아트) > assets_dummy(검증용 더미)
//   같은 파일명이 양쪽에 있으면 «실물»이 이긴다. 아트가 순차 도착해도 섞여 돌아간다.
//
// 사용:
//   node tools/sync_zone_assets.mjs                # 실물만
//   node tools/sync_zone_assets.mjs --with-dummy   # 빈 자리를 더미로 채움(검증용)
//   node tools/sync_zone_assets.mjs --clean        # public/zones 를 비우고 다시
//
// ★ --with-dummy 는 «기본 OFF» 다. 더미가 배포본에 섞여 나가는 사고를 막기 위해서다.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROJECT = path.resolve(HERE, '..');
const ROOT = path.resolve(PROJECT, '..', '..'); // 05_동물라이더
const REAL = path.join(ROOT, 'assets_generated');
const DUMMY = path.join(ROOT, 'assets_dummy');
const DEST = path.join(PROJECT, 'public', 'zones');

const args = process.argv.slice(2);
const withDummy = args.includes('--with-dummy');
const clean = args.includes('--clean');

// ★ src/render/zones.ts 의 ZONES 와 «같아야» 한다. 여기서 다시 적는 이유:
//   빌드 스크립트가 TS 를 파싱하지 않게 하려는 것. 어긋나면 아래 검사가 잡는다.
const ZONE_IDS = ['meadow', 'forest', 'desert', 'snow', 'volcano', 'starry'];
const FILES = ['L1_sky.png', 'L2_far.png', 'L3_mid.png', 'L4_near.png', 'ground_tile.png'];

// zones.ts 와의 어긋남을 «조용히» 넘기지 않는다 — 존을 추가하고 여기를 안 고치면
// 그 존만 영원히 폴백으로 뜨는데, 화면만 봐서는 원인을 못 찾는다.
function crossCheckZoneIds() {
  const src = path.join(PROJECT, 'src', 'render', 'zones.ts');
  if (!fs.existsSync(src)) return;
  const txt = fs.readFileSync(src, 'utf8');
  const found = [...txt.matchAll(/zone\('([a-z0-9_]+)'/g)].map((m) => m[1]);
  const missing = found.filter((z) => !ZONE_IDS.includes(z));
  const extra = ZONE_IDS.filter((z) => !found.includes(z));
  if (missing.length || extra.length) {
    console.error('!! zones.ts 와 ZONE_IDS 불일치 — zones.ts에만:', missing, '/ 이 스크립트에만:', extra);
    process.exitCode = 2;
  }
}

function copyIfExists(from, to) {
  if (!fs.existsSync(from)) return false;
  const st = fs.statSync(from);
  if (!st.isFile() || st.size === 0) return false;
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
  return true;
}

crossCheckZoneIds();

if (clean && fs.existsSync(DEST)) fs.rmSync(DEST, { recursive: true, force: true });

const report = [];
for (const id of ZONE_IDS) {
  const row = { zone: id, real: 0, dummy: 0, missing: [] };
  for (const file of FILES) {
    const to = path.join(DEST, id, file);
    if (copyIfExists(path.join(REAL, `zone_${id}`, file), to)) { row.real++; continue; }
    if (withDummy && copyIfExists(path.join(DUMMY, `zone_${id}`, file), to)) { row.dummy++; continue; }
    row.missing.push(file);
    // 이전 동기화에서 남은 파일이 있으면 지운다 — 지우지 않으면 «지금 없는 에셋»이
    // 계속 뜨면서 실제 상태를 가린다.
    if (fs.existsSync(to)) fs.rmSync(to);
  }
  report.push(row);
}

console.log(`원본(실물): ${REAL}`);
console.log(`원본(더미): ${DUMMY}  ${withDummy ? '[사용]' : '[미사용 — --with-dummy 로 켠다]'}`);
console.log(`배포:      ${DEST}\n`);
for (const r of report) {
  const tag = r.missing.length === 0 ? 'OK ' : '부분';
  console.log(`[${tag}] ${r.zone.padEnd(8)} 실물 ${r.real}/5  더미 ${r.dummy}/5  누락 ${r.missing.length ? r.missing.join(',') : '-'}`);
}
const fullReal = report.filter((r) => r.real === 5).length;
console.log(`\n실물 에셋 완비 존: ${fullReal}/${ZONE_IDS.length}`);
console.log('누락 존은 런타임에서 «기존 도형 렌더»로 폴백한다(게임은 정상 동작).');
