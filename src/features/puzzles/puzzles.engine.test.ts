/// <reference types="node" />
// Тест запускает движок как дочерний процесс Node — node-типы нужны только здесь,
// поэтому подключены точечно, а не в tsconfig (глобальная область приложения чище).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Chess } from 'chess.js';
import { ENGINE_JS, ENGINE_WASM } from '../../engine/files.gen';
import { PUZZLES, solverMovesOf } from './puzzles';

/**
 * Маты на 3–4 хода: полный перебор слишком дорог, поэтому форсированность
 * доказывает идущий с приложением Stockfish. Для каждого хода решателя
 * проверяем, что движок в оставшейся позиции видит мат ровно за оставшееся
 * число ходов (иначе заявленная длина задачи неверна).
 */
const LONG_MATES = PUZZLES.filter((p) => p.kind === 'mate' && solverMovesOf(p) >= 3);

describe('длинные маты: проверка движком Stockfish', () => {
  let dir = '';
  let proc: ChildProcessWithoutNullStreams | null = null;
  let ready = false;
  let buf = '';
  let waiters: ((line: string) => void)[] = [];
  let lastInfo = '';

  beforeAll(async () => {
    const jsPath = join(process.cwd(), 'public', 'engine', ENGINE_JS);
    if (!existsSync(jsPath)) return; // движок не скопирован — проверка недоступна
    dir = mkdtempSync(join(tmpdir(), 'sf-puzzles-'));
    // Emscripten-сборка ищет wasm по имени скрипта: копируем парой под одним именем.
    // Расширение .cjs нужно, чтобы Node не считал файл ES-модулем (в проекте "type": "module").
    copyFileSync(jsPath, join(dir, 'sf.cjs'));
    copyFileSync(join(process.cwd(), 'public', 'engine', ENGINE_WASM), join(dir, 'sf.wasm'));
    proc = spawn(process.execPath, [join(dir, 'sf.cjs')], { stdio: ['pipe', 'pipe', 'pipe'] });
    proc.stdout.on('data', (chunk: Buffer) => {
      buf += chunk.toString();
      let index: number;
      while ((index = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, index).trim();
        buf = buf.slice(index + 1);
        if (line.startsWith('info') && line.includes(' score ')) lastInfo = line;
        if (line.startsWith('bestmove')) {
          const waiter = waiters.shift();
          waiters = [];
          if (waiter) waiter(line);
        }
        if (line.startsWith('uciok')) ready = true;
      }
    });
    proc.stderr.on('data', () => {});
    proc.on('exit', () => {
      ready = false;
      for (const waiter of waiters) waiter('bestmove (none)');
      waiters = [];
    });
    proc.stdin.write('uci\n');
    const deadline = Date.now() + 15000;
    while (!ready && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 50));
    }
    proc.stdin.write('ucinewgame\nisready\n');
    await new Promise((r) => setTimeout(r, 200));
  }, 30000);

  afterAll(() => {
    proc?.stdin.write('quit\n');
    proc?.kill();
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  /** Оценка позиции: «mate N» из последнего info перед bestmove. */
  function engineMateScore(fen: string): Promise<number | null> {
    return new Promise((resolve) => {
      lastInfo = '';
      const onInfo = (chunk: Buffer) => {
        for (const l of chunk.toString().split('\n')) {
          if (l.startsWith('info') && l.includes(' score ')) lastInfo = l;
          if (l.startsWith('bestmove')) {
            proc!.stdout.removeListener('data', onInfo);
            const m = lastInfo.match(/score mate (-?\d+)/)?.[1];
            resolve(m !== undefined ? Number(m) : null);
            return;
          }
        }
      };
      proc!.stdout.on('data', onInfo);
      proc!.stdin.write(`position fen ${fen}\n`);
      proc!.stdin.write('go depth 26\n');
    });
  }

  it('линия решения форсирует мат ровно за заявленное число ходов', async () => {
    if (!proc || !ready) {
      console.warn('Stockfish недоступен — проверка длинных матов пропущена');
      return;
    }
    expect(LONG_MATES.length).toBeGreaterThanOrEqual(3);
    for (const p of LONG_MATES) {
      const chess = new Chess(p.fen);
      let remaining = solverMovesOf(p);
      for (let i = 0; i < p.solution.length; i++) {
        if (i % 2 === 0) {
          const mate = await engineMateScore(chess.fen());
          expect(
            mate,
            `${p.id}, ход ${p.solution[i]}: движок видит «mate ${mate}», ожидался форсированный мат за ${remaining}`,
          ).toBe(remaining);
          remaining--;
        }
        chess.move(p.solution[i]);
      }
      expect(chess.isCheckmate(), `${p.id}: линия должна кончаться матом`).toBe(true);
    }
    // Каталог пополняется из базы Lichess (см. scripts/generate-puzzles.mjs),
    // длинных матов десятки — на глубине 26 им нужно больше времени.
  }, 600000);
});
