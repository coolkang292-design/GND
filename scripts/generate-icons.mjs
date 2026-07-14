// PWA 아이콘 생성: 청록 배경 + 흰 덤벨 (외부 의존성 없이 PNG 직접 인코딩)
// 실행: node scripts/generate-icons.mjs
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";

const TEAL = [0x0d, 0x94, 0x88, 255];
const WHITE = [255, 255, 255, 255];

function crc32(buf) {
  let c,
    table = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePNG(size, pixels) {
  // pixels: Uint8Array RGBA, 행마다 filter byte 0 삽입
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function render(size, { padScale = 1 } = {}) {
  const px = Buffer.alloc(size * size * 4);
  const put = (x, y, [r, g, b, a]) => {
    const i = (y * size + x) * 4;
    px[i] = r;
    px[i + 1] = g;
    px[i + 2] = b;
    px[i + 3] = a;
  };
  const rect = (x0, y0, x1, y1, color, radius = 0) => {
    for (let y = Math.round(y0); y < Math.round(y1); y++)
      for (let x = Math.round(x0); x < Math.round(x1); x++) {
        if (x < 0 || y < 0 || x >= size || y >= size) continue;
        if (radius > 0) {
          const rx = Math.max(x0 + radius - x, x - (x1 - radius), 0);
          const ry = Math.max(y0 + radius - y, y - (y1 - radius), 0);
          if (rx * rx + ry * ry > radius * radius) continue;
        }
        put(x, y, color);
      }
  };

  // 배경: 청록 (maskable은 여백 크게)
  rect(0, 0, size, size, TEAL);

  // 흰 덤벨: 중앙 가로 바 + 양쪽 플레이트 2장씩
  const s = (v) => (v / 100) * size * padScale + ((1 - padScale) * size) / 2;
  const w = (v) => (v / 100) * size * padScale;
  rect(s(30), s(46), s(70), s(54), WHITE, w(2)); // 바
  rect(s(18), s(30), s(27), s(70), WHITE, w(3)); // 왼쪽 안쪽 플레이트
  rect(s(9), s(37), s(16), s(63), WHITE, w(3)); // 왼쪽 바깥 플레이트
  rect(s(73), s(30), s(82), s(70), WHITE, w(3)); // 오른쪽 안쪽 플레이트
  rect(s(84), s(37), s(91), s(63), WHITE, w(3)); // 오른쪽 바깥 플레이트

  return px;
}

mkdirSync("public/icons", { recursive: true });
writeFileSync("public/icons/icon-512.png", encodePNG(512, render(512)));
writeFileSync("public/icons/icon-192.png", encodePNG(192, render(192)));
writeFileSync(
  "public/icons/icon-maskable-512.png",
  encodePNG(512, render(512, { padScale: 0.72 })),
);
console.log("icons generated: public/icons/{icon-192,icon-512,icon-maskable-512}.png");
