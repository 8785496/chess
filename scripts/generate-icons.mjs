/**
 * Генерирует PNG-иконки приложения (192/512/180 + maskable) без внешних
 * зависимостей: пиксельная пешка на зелёной шахматной доске, PNG пишет вручную.
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

// --- рисунок: пешка (пиксель-арт 16×16) на фоне в клетку ---
const PAWN = [
  '................',
  '.....ooooo......',
  '....oxxxxxo.....',
  '...oxxxxxxxo....',
  '...oxxxxxxxo....',
  '....oxxxxxo.....',
  '.....oxxxo......',
  '.....oxxxo......',
  '....ooxxxoo.....',
  '...oxxxxxxxo....',
  '..oxxxxxxxxxo...',
  '..oxxxxxxxxxo...',
  '.oxxxxxxxxxxxo..',
  '.ooooooooooooo..',
  '................',
  '................',
];
const COLORS = {
  '.': null,
  o: [20, 42, 30, 255], // тёмная обводка
  x: [248, 246, 240, 255], // белая фигура
};
const BG_A = [47, 107, 79, 255]; // зелёная клетка
const BG_B = [58, 122, 92, 255];

const mix = (a, t) => [a[0], a[1], a[2], Math.round(255 * t)];

const renderIcon = (size, { maskable = false } = {}) => {
  const rgba = Buffer.alloc(size * size * 4);
  const cell = size / 8;
  const pawnScale = (size * (maskable ? 0.72 : 0.84)) / 16;
  const offset = (size - 16 * pawnScale) / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let c;
      const px = Math.floor((x - offset) / pawnScale);
      const py = Math.floor((y - offset) / pawnScale);
      if (px >= 0 && px < 16 && py >= 0 && py < 16) c = COLORS[PAWN[py][px]];
      if (!c) {
        const checker = (Math.floor(x / cell) + Math.floor(y / cell)) % 2 === 0;
        c = checker ? BG_A : BG_B;
      }
      const i = (y * size + x) * 4;
      rgba[i] = c[0];
      rgba[i + 1] = c[1];
      rgba[i + 2] = c[2];
      rgba[i + 3] = c[3];
    }
  }
  return encodePng(size, size, rgba);
};

writeFileSync(join(outDir, 'icon-192.png'), renderIcon(192));
writeFileSync(join(outDir, 'icon-512.png'), renderIcon(512));
writeFileSync(join(outDir, 'icon-maskable-512.png'), renderIcon(512, { maskable: true }));
writeFileSync(join(outDir, 'icon-180.png'), renderIcon(180));
console.log('Icons generated in public/icons/');
