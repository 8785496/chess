/**
 * Дополнение каталога задач из открытой базы Lichess (CC0):
 *   data/lichess/lichess_db_puzzle.csv  — получается скриптом scripts/decompress-puzzles.py
 *
 * Пайплайн: стриминговое чтение CSV → резервуарный отбор по квотам
 * (тип × число ходов × сложность) → проверка chess.js (легальность, мат/материал,
 * отсутствие более короткого мата) → для матов 3–4 хода проверка Stockfish
 * (точная дистанция мата, как в puzzles.engine.test.ts) → дописывание
 * src/data/puzzles.json с ru/en заголовками и подсказками по темам.
 *
 * Использование: node scripts/generate-puzzles.mjs
 */
import { spawn } from 'node:child_process';
import {
  copyFileSync,
  createReadStream,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createInterface } from 'node:readline';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Chess } from 'chess.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CSV = join(ROOT, 'data', 'lichess', 'lichess_db_puzzle.csv');
const OUT = join(ROOT, 'src', 'data', 'puzzles.json');

/** Квоты добора: сколько задач каждого типа/длины/сложности добавить. */
const QUOTAS = [
  { kind: 'mate', moves: 1, diff: 1, quota: 20 },
  { kind: 'mate', moves: 1, diff: 2, quota: 14 },
  { kind: 'mate', moves: 1, diff: 3, quota: 6 },
  { kind: 'mate', moves: 2, diff: 1, quota: 14 },
  { kind: 'mate', moves: 2, diff: 2, quota: 26 },
  { kind: 'mate', moves: 2, diff: 3, quota: 16 },
  { kind: 'mate', moves: 3, diff: 2, quota: 10 },
  { kind: 'mate', moves: 3, diff: 3, quota: 18 },
  { kind: 'mate', moves: 4, diff: 2, quota: 3 },
  { kind: 'mate', moves: 4, diff: 3, quota: 9 },
  { kind: 'tactic', moves: 0, diff: 1, quota: 10 },
  { kind: 'tactic', moves: 0, diff: 2, quota: 20 },
  { kind: 'tactic', moves: 0, diff: 3, quota: 14 },
];

/** Фильтры качества базы Lichess: стабильные и популярные задачи. */
const MIN_POPULARITY = 90;
const MAX_RATING_DEVIATION = 100;
const MIN_PLAYS = 50;

/** Запас проверенных кандидатов для длинных матов — на случай отбраковки движком. */
const SPARE = 6;
const RESERVOIR_FACTOR = 8;

// ——————————————————————————————————— темы ———————————————————————————————————

/** Приоритетное сопоставление тем Lichess → темы проекта. */
const MATE_THEME_MAP = [
  ['smotheredMate', 'smothered'],
  ['backRankMate', 'backrank'],
  ['promotion', 'promotion'],
  ['fork', 'fork'],
  ['skewer', 'skewer'],
  ['deflection', 'deflection'],
  ['opening', 'opening'],
];
const TACTIC_THEME_MAP = [
  ['fork', 'fork'],
  ['skewer', 'skewer'],
  ['deflection', 'deflection'],
];

/** Заголовки и подсказки по темам проекта — выбираются хешем id для разнообразия. */
const TITLES = {
  backrank: [
    ['Мат на последней горизонтали', 'Back-rank mate'],
    ['Слабая восьмая горизонталь', 'The weak back rank'],
    ['Тяжёлая фигура на восьмой', 'Heavy piece on the eighth'],
  ],
  'basic-mate': [
    ['Простой мат', 'Simple mate'],
    ['Матовая сеть', 'The mating net'],
    ['Король без укрытия', 'A king without shelter'],
  ],
  opening: [
    ['Дебютная ловушка', 'An opening trap'],
    ['Наказание в дебюте', 'Punished in the opening'],
    ['Развитие дороже пешки', 'Development beats pawns'],
  ],
  promotion: [
    ['Проходная пешка', 'The passed pawn'],
    ['Превращение с матом', 'Promotion with mate'],
    ['Пешка становится ферзём', 'A pawn becomes a queen'],
  ],
  deflection: [
    ['Отвлечение', 'Deflection'],
    ['Увод защитника', 'Removing the guard'],
    ['Защита не успевает', 'The defence runs out'],
  ],
  fork: [
    ['Вилка', 'The fork'],
    ['Двойной удар', 'A double strike'],
    ['Две цели одним ходом', 'Two targets, one move'],
  ],
  skewer: [
    ['Сквозной удар', 'The skewer'],
    ['Нападение по линии', 'Attack down the line'],
    ['Две фигуры на одной линии', 'Two pieces, one line'],
  ],
  smothered: [
    ['Спёртый мат', 'Smothered mate'],
    ['Конь ставит мат', 'The knight delivers mate'],
    ['Король в клетке', 'The king in a cage'],
  ],
};

const HINTS = {
  backrank: [
    [
      'Король заперт своими пешками — ищите незащищённую горизонталь.',
      'The king is trapped by its own pawns — look for the undefended rank.',
    ],
    [
      'Тяжёлой фигуре часто нужен всего один ход на открытую восьмую.',
      'A heavy piece often needs just one move to the open eighth rank.',
    ],
  ],
  'basic-mate': [
    [
      'Ограничьте короля и найдите поле, откуда фигура поставит мат.',
      'Restrict the king and find the square from which a piece delivers mate.',
    ],
    [
      'Считайте поля вокруг короля: где у него нет убежища?',
      'Count the squares around the king: where has it no shelter?',
    ],
  ],
  opening: [
    [
      'Соперник отстал в развитии или потерял темп — ищите форсированный удар.',
      'The opponent is behind in development or lost a tempo — look for a forcing strike.',
    ],
    [
      'Проверьте, чем защищены ферзевая диагональ и слабые поля.',
      "Check what defends the queen's diagonal and the weak squares.",
    ],
  ],
  promotion: [
    [
      'Пешке остался один шаг — превращение может быть с шахом, а то и с матом.',
      'The pawn is one step away — promotion may come with check, or even mate.',
    ],
    [
      'Сопровождайте пешку: король не должен успеть её догнать.',
      'Escort the pawn: the king must not catch it.',
    ],
  ],
  deflection: [
    [
      'Одна фигура соперника защищает две цели — заставьте её заняться только одной.',
      'One enemy piece defends two targets — force it to deal with only one.',
    ],
    [
      'Ищите жертву, выманивающую ключевого защитника из позиции.',
      'Look for a sacrifice that lures the key defender away.',
    ],
  ],
  fork: [
    [
      'Найдите ход, после которого атакованы две фигуры сразу.',
      'Find a move that attacks two pieces at once.',
    ],
    [
      'Проверьте незащищённые фигуры соперника и поля прыжков коня.',
      "Check the opponent's undefended pieces and the knight's jump squares.",
    ],
  ],
  skewer: [
    [
      'Выстройте две фигуры соперника на одной линии: дальняя падёт.',
      'Line up two enemy pieces on one line: the far one will fall.',
    ],
    [
      'Ищите длинную диагональ или открытую линию с королём впереди.',
      'Look for a long diagonal or open file with the king in front.',
    ],
  ],
  smothered: [
    [
      'Свои фигуры лишают короля полей — конь завершает дело.',
      "The king's own pieces take his squares — the knight finishes the job.",
    ],
    [
      'Классика: конь объявляет шах, пока ферзь жертвуется ради клетки.',
      'The classic: knight checks while the queen sacrifices itself for a square.',
    ],
  ],
};

// ——————————————————————————————————— утилиты ———————————————————————————————————

/** Детерминированный ГПСЧ — чтобы отбор воспроизводился между запусками. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(0x20260905);

function shuffle(list) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

function hashString(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

const uciMove = (uci) => ({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });

const VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

/** Баланс «решающий − соперник» в пешках — как в puzzles.test.ts. */
function materialBalance(chess, solver) {
  let total = 0;
  for (const row of chess.board()) {
    for (const piece of row) {
      if (!piece) continue;
      total += (piece.color === solver ? 1 : -1) * (VALUE[piece.type] ?? 0);
    }
  }
  return total;
}

/** Есть ли у стороны, чей ход, мат в 1. */
function hasMateIn1(chess) {
  for (const move of chess.moves()) {
    chess.move(move);
    const mate = chess.isCheckmate();
    chess.undo();
    if (mate) return true;
  }
  return false;
}

/** Форсированный мат не более чем за n ходов — порт mate.ts из src. */
function canForceMate(chess, n) {
  if (n <= 0) return false;
  for (const move of chess.moves()) {
    chess.move(move);
    let forced = chess.isCheckmate();
    if (!forced && !chess.isGameOver() && n > 1) {
      const replies = chess.moves();
      forced = replies.length > 0;
      for (const reply of replies) {
        chess.move(reply);
        const ok = canForceMate(chess, n - 1);
        chess.undo();
        if (!ok) {
          forced = false;
          break;
        }
      }
    }
    chess.undo();
    if (forced) return true;
  }
  return false;
}

const solverMovesOf = (solution) => Math.ceil(solution.length / 2);
const fenKey = (fen) => fen.split(' ').slice(0, 4).join(' ');

// ——————————————————————————————————— классификация и отбор ———————————————————————————————————

const difficultyOf = (rating) => (rating < 1500 ? 1 : rating < 2200 ? 2 : 3);

/** Классификация строки CSV: подходит ли задача и в какой квотный бакет она попадает. */
function classify(cols) {
  const rating = Number(cols[3]);
  if (
    Number(cols[5]) < MIN_POPULARITY ||
    Number(cols[4]) > MAX_RATING_DEVIATION ||
    Number(cols[6]) < MIN_PLAYS
  ) {
    return null;
  }
  const themes = cols[7].split(' ');
  const mate = themes.find((t) => /^mateIn[1-4]$/.test(t));
  if (mate) {
    const mapped = MATE_THEME_MAP.find(([lichess]) => themes.includes(lichess));
    return {
      kind: 'mate',
      moves: Number(mate[6]),
      diff: difficultyOf(rating),
      theme: mapped?.[1] ?? 'basic-mate',
    };
  }
  const tactic = TACTIC_THEME_MAP.find(([lichess]) => themes.includes(lichess));
  if (tactic) return { kind: 'tactic', moves: 0, diff: difficultyOf(rating), theme: tactic[1] };
  return null;
}

const buckets = new Map();
for (const q of QUOTAS) {
  buckets.set(`${q.kind}|${q.moves}|${q.diff}`, {
    ...q,
    seen: 0,
    items: [],
    cap: q.quota * RESERVOIR_FACTOR,
  });
}

async function scan() {
  const rl = createInterface({ input: createReadStream(CSV, 'utf8'), crlfDelay: Infinity });
  let headerSkipped = false;
  let lines = 0;
  for await (const line of rl) {
    if (!headerSkipped) {
      headerSkipped = true;
      continue;
    }
    lines++;
    if (lines % 1000000 === 0) console.log(`  … ${lines / 1e6} млн строк`);
    const cols = line.split(',');
    if (cols.length < 10) continue;
    const cls = classify(cols);
    if (!cls) continue;
    const bucket = buckets.get(`${cls.kind}|${cls.moves}|${cls.diff}`);
    if (!bucket) continue;
    bucket.seen++;
    const item = { cols, theme: cls.theme };
    if (bucket.items.length < bucket.cap) {
      bucket.items.push(item);
    } else {
      const j = Math.floor(rng() * bucket.seen);
      if (j < bucket.cap) bucket.items[j] = item;
    }
    // Порядок строк в базе не связан с качеством (id случайны) — можно останавливаться рано.
    if ([...buckets.values()].every((b) => b.items.length >= b.cap)) break;
  }
  rl.close();
  for (const b of buckets.values()) {
    console.log(
      `Бакет ${b.kind} ${b.moves || 'любая длина'}, сложность ${b.diff}: кандидатов ${b.seen}`,
    );
  }
}

// ——————————————————————————————————— проверка chess.js ———————————————————————————————————

const drops = {
  line: 0,
  notMate: 0,
  fasterMate: 0,
  notForced: 0,
  material: 0,
  underpromotion: 0,
  duplicate: 0,
};
const seenKeys = new Set();

/**
 * Проверка кандидата и перевод в формат проекта. Первый ход линии Lichess —
 * ошибка соперника: позиция задачи начинается после него.
 */
function verifyCandidate(cols, cls, theme) {
  const chess = new Chess(cols[1]);
  const ucis = cols[2].split(' ');
  try {
    chess.move(uciMove(ucis[0]));
  } catch {
    drops.line++;
    return null;
  }
  const puzzleFen = chess.fen();

  const solution = [];
  for (let i = 1; i < ucis.length; i++) {
    if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(ucis[i])) break;
    let move;
    try {
      move = chess.move(uciMove(ucis[i]));
    } catch {
      drops.line++;
      return null;
    }
    // Решатель в приложении превращает только в ферзя — прочие исключаем.
    if (i % 2 === 1 && move.promotion && move.promotion !== 'q') {
      drops.underpromotion++;
      return null;
    }
    solution.push(move.san);
  }

  if (solution.length < 1 || solution.length % 2 !== 1) {
    drops.line++;
    return null;
  }
  const key = fenKey(puzzleFen) + '|' + solution[0];
  if (seenKeys.has(key)) {
    drops.duplicate++;
    return null;
  }

  if (cls.kind === 'mate') {
    if (!chess.isCheckmate()) {
      drops.notMate++;
      return null;
    }
    const start = new Chess(puzzleFen);
    if (solverMovesOf(solution) > 1 && hasMateIn1(start)) {
      drops.fasterMate++;
      return null;
    }
    if (solverMovesOf(solution) === 2 && !canForceMate(start, 2)) {
      drops.notForced++;
      return null;
    }
    // Для n ≥ 3 отсутствие мата за 2 хода дёшево доказывается здесь,
    // точную дистанцию дальше подтверждает Stockfish.
    if (solverMovesOf(solution) >= 3 && canForceMate(start, 2)) {
      drops.fasterMate++;
      return null;
    }
  } else {
    // Тактика не должна заканчиваться матом или патом и обязана выигрывать материал.
    if (chess.isGameOver()) {
      drops.material++;
      return null;
    }
    const solver = puzzleFen.split(' ')[1] === 'b' ? 'b' : 'w';
    const gain = materialBalance(chess, solver) - materialBalance(new Chess(puzzleFen), solver);
    if (gain < 2) {
      drops.material++;
      return null;
    }
  }

  seenKeys.add(key);
  return {
    id: 'l' + cols[0],
    fen: puzzleFen,
    kind: cls.kind,
    theme,
    difficulty: cls.diff,
    solution,
  };
}

// ——————————————————————————————————— проверка Stockfish ———————————————————————————————————

function locateEngine() {
  const engineDir = join(ROOT, 'public', 'engine');
  if (!existsSync(engineDir)) return null;
  const files = readdirSync(engineDir);
  const js = files.find((f) => f.endsWith('.js'));
  const wasm = files.find((f) => f.endsWith('.wasm'));
  return js && wasm ? { js: join(engineDir, js), wasm: join(engineDir, wasm) } : null;
}

/** Урезанный повтор puzzles.engine.test.ts: оценка «mate N» для позиции. */
function startEngine() {
  const pair = locateEngine();
  if (!pair) {
    console.warn('Stockfish не найден в public/engine — проверка длинных матов пропущена');
    return null;
  }
  const dir = mkdtempSync(join(tmpdir(), 'sf-generate-'));
  copyFileSync(pair.js, join(dir, 'sf.cjs'));
  copyFileSync(pair.wasm, join(dir, 'sf.wasm'));
  const proc = spawn(process.execPath, [join(dir, 'sf.cjs')], { stdio: ['pipe', 'pipe', 'pipe'] });
  let buf = '';
  let lastInfo = '';
  let ready = false;
  const waiters = [];
  proc.stdout.on('data', (chunk) => {
    buf += chunk.toString();
    let index;
    while ((index = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, index).trim();
      buf = buf.slice(index + 1);
      if (line.startsWith('info') && line.includes(' score ')) lastInfo = line;
      if (line.startsWith('bestmove')) {
        const waiter = waiters.shift();
        if (waiter) waiter();
      }
      if (line.startsWith('uciok')) ready = true;
    }
  });
  proc.stderr.on('data', () => {});
  proc.on('exit', () => {
    ready = false;
    while (waiters.length) waiters.shift()();
  });
  proc.stdin.write('uci\n');
  return {
    waitReady: async () => {
      const deadline = Date.now() + 15000;
      while (!ready && Date.now() < deadline) await new Promise((r) => setTimeout(r, 50));
      if (ready) proc.stdin.write('ucinewgame\nisready\n');
      return ready;
    },
    mateScore: (fen, depth = 26) =>
      new Promise((resolve) => {
        if (!ready) return resolve(null);
        lastInfo = '';
        const timer = setTimeout(() => resolve(null), 30000);
        const onData = (chunk) => {
          for (const l of chunk.toString().split('\n')) {
            if (l.startsWith('info') && l.includes(' score ')) lastInfo = l;
            if (l.startsWith('bestmove')) {
              proc.stdout.removeListener('data', onData);
              clearTimeout(timer);
              const m = lastInfo.match(/score mate (-?\d+)/)?.[1];
              resolve(m !== undefined ? Number(m) : null);
              return;
            }
          }
        };
        proc.stdout.on('data', onData);
        proc.stdin.write(`position fen ${fen}\n`);
        proc.stdin.write(`go depth ${depth}\n`);
      }),
    stop: () => {
      proc.stdin.write('quit\n');
      proc.kill();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

/** Дистанция мата вдоль линии решения должна совпадать с заявленной на каждом ходе решателя. */
async function engineVerifyLine(engine, fen, solution) {
  const chess = new Chess(fen);
  let remaining = solverMovesOf(solution);
  for (let i = 0; i < solution.length; i++) {
    if (i % 2 === 0) {
      const mate = await engine.mateScore(chess.fen());
      if (mate !== remaining) return false;
      remaining--;
    }
    chess.move(solution[i]);
  }
  return chess.isCheckmate();
}

// ——————————————————————————————————— сборка ———————————————————————————————————

function entryOf(p) {
  const [ru, en] = TITLES[p.theme][hashString(p.id) % TITLES[p.theme].length];
  const [hru, hen] = HINTS[p.theme][hashString(p.id + 'h') % HINTS[p.theme].length];
  return { ...p, title: { ru, en }, hint: { ru: hru, en: hen } };
}

function orderKey(p) {
  return [
    p.kind === 'mate' ? 0 : 1,
    p.kind === 'mate' ? solverMovesOf(p.solution) : 0,
    p.difficulty,
    p.id,
  ];
}

async function main() {
  if (!existsSync(CSV)) {
    console.error(
      `Нет базы: ${CSV}\nСкачайте lichess_db_puzzle.csv.zst и распакуйте scripts/decompress-puzzles.py`,
    );
    process.exit(1);
  }

  const existing = JSON.parse(readFileSync(OUT, 'utf8'));
  for (const p of existing) seenKeys.add(fenKey(p.fen) + '|' + p.solution[0]);
  const existingIds = new Set(existing.map((p) => p.id));

  console.log('Сканирование базы Lichess…');
  await scan();

  console.log('Проверка кандидатов chess.js…');
  const chosen = [];
  const spares = []; // проверенные длинные маты на замену отбракованным движком
  for (const bucket of buckets.values()) {
    let accepted = 0;
    const themeCount = {};
    const cap = Math.ceil(bucket.quota * 0.6);
    for (const item of shuffle(bucket.items)) {
      const wantSpare = bucket.kind === 'mate' && bucket.moves >= 3 && spares.length < SPARE;
      if (accepted >= bucket.quota && !wantSpare) break;
      const verified = verifyCandidate(item.cols, bucket, item.theme);
      if (!verified) continue;
      if (accepted < bucket.quota && (themeCount[verified.theme] ?? 0) < cap) {
        themeCount[verified.theme] = (themeCount[verified.theme] ?? 0) + 1;
        accepted++;
        chosen.push(verified);
      } else if (wantSpare) {
        spares.push(verified);
      }
    }
    if (accepted < bucket.quota) {
      console.warn(
        `  недобор: ${bucket.kind} ${bucket.moves || 'любая длина'}, сложность ${bucket.diff} — ${accepted}/${bucket.quota}`,
      );
    }
  }
  for (const [reason, n] of Object.entries(drops)) {
    if (n) console.log(`Отбраковано (${reason}): ${n}`);
  }

  const longMates = chosen.filter((p) => p.kind === 'mate' && solverMovesOf(p.solution) >= 3);
  if (longMates.length) {
    const engine = startEngine();
    if (engine && (await engine.waitReady())) {
      console.log(`Проверка Stockfish ${longMates.length} длинных матов…`);
      for (let i = 0; i < longMates.length; i++) {
        if (await engineVerifyLine(engine, longMates[i].fen, longMates[i].solution)) continue;
        const bad = longMates.splice(i, 1)[0];
        seenKeys.delete(fenKey(bad.fen) + '|' + bad.solution[0]);
        console.warn(`  движок отбраковал ${bad.id}`);
        const idx = spares.findIndex(
          (p) => solverMovesOf(p.solution) === solverMovesOf(bad.solution),
        );
        const spare = idx >= 0 ? spares.splice(idx, 1)[0] : null;
        if (spare && (await engineVerifyLine(engine, spare.fen, spare.solution))) {
          longMates.splice(i, 0, spare);
        } else {
          i--;
        }
      }
    } else {
      console.warn('  движок недоступен — длинные маты останутся непроверенными до npm test');
    }
    engine?.stop();
  }

  const isLongMate = (p) => p.kind === 'mate' && solverMovesOf(p.solution) >= 3;
  const fresh = [...chosen.filter((p) => !isLongMate(p)), ...longMates]
    .filter((p) => !existingIds.has(p.id))
    .sort((a, b) => {
      const ka = orderKey(a);
      const kb = orderKey(b);
      return ka[0] !== kb[0]
        ? ka[0] - kb[0]
        : ka[1] !== kb[1]
          ? ka[1] - kb[1]
          : ka[2] !== kb[2]
            ? ka[2] - kb[2]
            : ka[3] < kb[3]
              ? -1
              : 1;
    })
    .map(entryOf);

  const all = [...existing, ...fresh];
  writeFileSync(OUT, JSON.stringify(all, null, 2) + '\n');

  const tally = (fn) => {
    const m = {};
    for (const p of all) {
      const k = fn(p);
      m[k] = (m[k] ?? 0) + 1;
    }
    return m;
  };
  console.log(`Добавлено ${fresh.length}, всего ${all.length}.`);
  console.log(`По типу: ${JSON.stringify(tally((p) => p.kind))}`);
  console.log(`По сложности: ${JSON.stringify(tally((p) => p.difficulty))}`);
  console.log(`По теме: ${JSON.stringify(tally((p) => p.theme))}`);
  console.log(`Готово: ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
