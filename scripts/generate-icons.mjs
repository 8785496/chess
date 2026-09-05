/**
 * Генерирует PNG-иконки приложения (192/512/180 + maskable) без внешних
 * зависимостей: гладкая пешка на зелёном фоне. Фигура собирается из SDF-примитивов
 * и рендерится с суперсэмплингом, PNG пишется вручную.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public', 'icons');
mkdirSync(outDir, { recursive: true });

// --- минимальный PNG-энкодер (RGBA, 8 бит) ---
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};
const encodePng = (width, height, rgba) => {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // фильтр None
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
};

// --- палитра ---
const OUTLINE = [20, 38, 28]; // #14261c — как во встроенном favicon.svg
const IVORY_TOP = [252, 250, 244];
const IVORY_BOTTOM = [222, 213, 192];
const SHADE = [178, 165, 138];
const BG_LIGHT = [68, 143, 106];
const BG_DARK = [31, 78, 55];
const SHADOW = [10, 26, 18];

const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);
const lerp = (a, b, t) => a + (b - a) * t;
const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const sstep = (e0, e1, x) => {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};

// --- SDF-примитивы в нормированных координатах [0,1] ---
const sdDisc = (x, y, cx, cy, r) => Math.hypot(x - cx, y - cy) - r;
const sdEllipse = (x, y, cx, cy, rx, ry) =>
  (Math.hypot((x - cx) / rx, (y - cy) / ry) - 1) * Math.min(rx, ry);
// выпуклая оболочка двух кругов (конусный переход между радиусами)
const sdHull2 = (x, y, ax, ay, ra, bx, by, rb) => {
  const abx = bx - ax;
  const aby = by - ay;
  const len2 = abx * abx + aby * aby;
  const t = clamp01(((x - ax) * abx + (y - ay) * aby) / len2);
  return Math.hypot(x - (ax + abx * t), y - (ay + aby * t)) - (ra + (rb - ra) * t);
};

// силуэт пешки: голова, воротник, тулово, расширяющееся основание (d < 0 внутри)
const pawnSdf = (x, y) => {
  const head = sdDisc(x, y, 0.5, 0.255, 0.145);
  const collar = sdHull2(x, y, 0.425, 0.415, 0.048, 0.575, 0.415, 0.048);
  const body = sdHull2(x, y, 0.5, 0.42, 0.085, 0.5, 0.68, 0.15);
  const base = sdHull2(x, y, 0.5, 0.68, 0.15, 0.5, 0.855, 0.262);
  return Math.max(Math.min(head, collar, body, base), y - 0.875);
};
const shadowSdf = (x, y) => sdEllipse(x, y, 0.512, 0.868, 0.31, 0.045);

const STROKE = 0.024;

// цвет сэмплa: фон не масштабируется, фигура сжимается к центру для maskable
const shade = (x, y, scale) => {
  // фон: радиальный градиент + едва заметная «доска» + виньетка
  let col = mix3(BG_LIGHT, BG_DARK, sstep(0, 1, Math.hypot(x - 0.5, y - 0.33) / 0.82));
  const checker = (Math.floor(x * 4) + Math.floor(y * 4)) % 2 === 0 ? 1.035 : 0.965;
  const vig = 1 - 0.16 * sstep(0.45, 1.0, Math.hypot(x - 0.5, y - 0.5));
  col = [col[0] * checker * vig, col[1] * checker * vig, col[2] * checker * vig];

  const cx = 0.5 + (x - 0.5) / scale;
  const cy = 0.5 + (y - 0.5) / scale;

  // мягкая тень под фигурой
  col = mix3(col, SHADOW, 0.32 * (1 - sstep(-0.015, 0.06, shadowSdf(cx, cy))));

  const d = pawnSdf(cx, cy);
  if (d <= STROKE) {
    if (d <= 0) {
      let body = mix3(IVORY_TOP, IVORY_BOTTOM, clamp01((cy - 0.1) / 0.73));
      // контактное затемнение по контуру, сильнее к низу
      const rim = sstep(-0.075, -0.004, d);
      body = mix3(body, SHADE, rim * (0.05 + 0.16 * clamp01((cy - 0.17) / 0.6)));
      // блик на голове
      const hl = 1 - sstep(0, 0.06, Math.hypot(cx - 0.452, cy - 0.21));
      body = mix3(body, [255, 255, 251], hl * 0.6);
      col = body;
    } else {
      col = OUTLINE;
    }
  }
  return col;
};

const renderIcon = (size, { maskable = false } = {}) => {
  const rgba = Buffer.alloc(size * size * 4);
  const ss = size >= 400 ? 4 : 3; // суперсэмплинг по каждой оси
  const n = size * ss;
  const step = 1 / n;
  // maskable: контент вписывается в круглую безопасную зону лаунчера
  const scale = maskable ? 0.76 : 1;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const c = shade((px * ss + sx + 0.5) * step, (py * ss + sy + 0.5) * step, scale);
          r += c[0];
          g += c[1];
          b += c[2];
        }
      }
      const k = ss * ss;
      const i = (py * size + px) * 4;
      rgba[i] = Math.round(r / k);
      rgba[i + 1] = Math.round(g / k);
      rgba[i + 2] = Math.round(b / k);
      rgba[i + 3] = 255;
    }
  }
  return encodePng(size, size, rgba);
};

writeFileSync(join(outDir, 'icon-192.png'), renderIcon(192));
writeFileSync(join(outDir, 'icon-512.png'), renderIcon(512));
writeFileSync(join(outDir, 'icon-maskable-192.png'), renderIcon(192, { maskable: true }));
writeFileSync(join(outDir, 'icon-maskable-512.png'), renderIcon(512, { maskable: true }));
writeFileSync(join(outDir, 'icon-180.png'), renderIcon(180));
console.log('Icons generated in public/icons/');
