// tools/png_min.mjs — 의존성 없는 최소 PNG 인코더(RGBA8, filter 0).
// 왜 직접 쓰나: 이 프로젝트엔 이미지 라이브러리가 없고(devDeps = typescript/vite 뿐),
// «존 파이프 검증용 더미 에셋»을 만들려고 npm 의존성을 새로 붙이고 싶지 않다.
// 실제 아트 에셋은 아트 라인이 assets_generated 에 넣는다 — 이 파일은 검증 전용이다.
import zlib from 'zlib';
import fs from 'fs';

function crc32(buf) {
  let c;
  const table = crc32.table || (crc32.table = (() => {
    const t = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c;
    }
    return t;
  })());
  let crc = -1;
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td), 0);
  return Buffer.concat([len, td, crc]);
}

/**
 * @param {string} file
 * @param {number} w
 * @param {number} h
 * @param {(x:number,y:number)=>[number,number,number,number]} px  RGBA 0..255
 */
export function writePNG(file, w, h, px) {
  const raw = Buffer.alloc(h * (1 + w * 4));
  let p = 0;
  for (let y = 0; y < h; y++) {
    raw[p++] = 0; // filter: None
    for (let x = 0; x < w; x++) {
      const c = px(x, y);
      raw[p++] = c[0] | 0;
      raw[p++] = c[1] | 0;
      raw[p++] = c[2] | 0;
      raw[p++] = c[3] === undefined ? 255 : c[3] | 0;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type RGBA
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  fs.writeFileSync(file, png);
  return png.length;
}

export function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function mix(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}
