import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { UciEngine, parseInfoLine, type WorkerLike } from './uci';
import { applyLevel, BOT_LEVELS, getLevel } from './levels';

/** Мок воркера: отвечает на UCI-команды по протоколу. */
class MockWorker implements WorkerLike {
  sent: string[] = [];
  private listener?: (ev: { data: unknown }) => void;
  private positions = 0;

  postMessage(data: unknown): void {
    const cmd = String(data);
    this.sent.push(cmd);
    if (cmd === 'uci') {
      this.reply('id name Stockfish mock');
      this.reply('option name UCI_LimitStrength type check default false');
      this.reply('option name UCI_Elo type spin default 1350 min 1350 max 2850');
      this.reply('option name Skill Level type spin default 20 min 0 max 20');
      this.reply('option name MultiPV type spin default 1 min 1 max 500');
      this.reply('uciok');
    } else if (cmd === 'isready') {
      this.reply('readyok');
    } else if (cmd.startsWith('go')) {
      this.positions++;
      this.reply(`info depth 10 seldepth 12 multipv 1 score cp ${this.positions * 10} nodes 12345 nps 100000 pv e2e4 e7e5 g1f3`);
      this.reply(`info depth 11 multipv 1 score cp ${this.positions * 10} nodes 23456 pv e2e4 e7e5 g1f3 b8c6`);
      this.reply(`bestmove e2e4 ponder e7e5`);
    }
  }

  addEventListener(_type: 'message', listener: (ev: { data: unknown }) => void): void {
    this.listener = listener;
  }

  removeEventListener(): void {
    this.listener = undefined;
  }

  terminate(): void {
    /* noop */
  }

  private reply(line: string): void {
    setTimeout(() => this.listener?.({ data: line }), 0);
  }
}

describe('UciEngine', () => {
  it('инициализируется и парсит опции', async () => {
    const engine = await UciEngine.create(new MockWorker());
    expect(engine.hasOption('UCI_Elo')).toBe(true);
    expect(engine.hasOption('Skill Level')).toBe(true);
    expect(engine.hasOption('Unknown')).toBe(false);
  });

  it('go() резолвится bestmove и собирает info', async () => {
    const engine = await UciEngine.create(new MockWorker());
    const res = await engine.go({ fen: new Chess().fen(), depth: 11 });
    expect(res.bestmove).toBe('e2e4');
    expect(res.info).toHaveLength(1); // multipv 1 объединяется
    expect(res.info[0]).toMatchObject({ depth: 11, cp: 10, pv: ['e2e4', 'e7e5', 'g1f3', 'b8c6'] });
  });

  it('setOption пропускает неподдерживаемые опции', async () => {
    const worker = new MockWorker();
    const engine = await UciEngine.create(worker);
    worker.sent = [];
    engine.setOption('Threads', 4); // нет в списке — должно игнорироваться
    expect(worker.sent).toHaveLength(0);
    engine.setOption('Skill Level', 5);
    expect(worker.sent).toEqual(['setoption name Skill Level value 5']);
  });

  it('applyLevel выставляет Elo и Skill', async () => {
    const worker = new MockWorker();
    const engine = await UciEngine.create(worker);
    worker.sent = [];
    applyLevel(engine, BOT_LEVELS[0]);
    expect(worker.sent).toEqual([
      'setoption name UCI_LimitStrength value true',
      'setoption name UCI_Elo value 1350',
      'setoption name Skill Level value 1',
    ]);
    expect(getLevel(9).id).toBe(3);
  });
});

describe('parseInfoLine', () => {
  it('разбирает score cp и pv', () => {
    const info = parseInfoLine('info depth 15 multipv 2 score cp -34 nodes 100 pv d7d5 e4d5 g8f6');
    expect(info).toMatchObject({ depth: 15, multipv: 2, cp: -34, pv: ['d7d5', 'e4d5', 'g8f6'] });
  });

  it('разбирает score mate', () => {
    const info = parseInfoLine('info depth 12 score mate 3 pv f6g8');
    expect(info).toMatchObject({ mate: 3 });
  });

  it('игнорирует info без pv', () => {
    expect(parseInfoLine('info depth 5 nodes 10 nps 5')).toBeNull();
  });
});
