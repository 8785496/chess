import { UciEngine, type EngineInfoLine } from './uci';
import { applyLevel, type BotLevel } from './levels';
import { ENGINE_JS } from './files.gen';
import { useEngine } from '../stores/engine';

export interface AnalysisLine extends EngineInfoLine {
  /** UCI первого хода линии. */
  uci: string;
}

export interface AnalysisResult {
  best: string | null;
  /** Сантипешки с точки зрения сходящего (может быть мат — см. mate). */
  cp: number;
  mate: number | null;
  lines: AnalysisLine[];
}

export function engineUrl(): string {
  const base = import.meta.env.BASE_URL || '/';
  return `${base}engine/${ENGINE_JS}`;
}

/**
 * Единственный менеджер движка: лениво поднимает воркер, выполняет задачи
 * (ход бота / подсказка / разбор) последовательно, чтобы не смешивать поиски.
 */
class EngineManager {
  private engine: UciEngine | null = null;
  private initPromise: Promise<UciEngine> | null = null;
  private chain: Promise<unknown> = Promise.resolve();
  private readonly store = useEngine;

  async getEngine(): Promise<UciEngine> {
    if (this.engine && !this.engine.isTerminated) return this.engine;
    if (!this.initPromise) {
      this.store.getState().setStatus('loading');
      this.initPromise = (async () => {
        const worker = new Worker(engineUrl());
        const engine = await UciEngine.create(worker);
        this.engine = engine;
        this.store.getState().setStatus('ready');
        return engine;
      })().catch((err) => {
        this.initPromise = null;
        this.store.getState().setStatus('error');
        throw err;
      });
    }
    return this.initPromise;
  }

  /** Прогрев после первого визита — движок попадает в SW-кэш и дальше работает офлайн. */
  warmup(): void {
    if (this.engine || this.initPromise) return;
    void this.getEngine().catch(() => undefined);
  }

  private run<T>(task: (engine: UciEngine) => Promise<T>): Promise<T> {
    const result = this.chain.then(async () => {
      const engine = await this.getEngine();
      this.store.getState().setStatus('busy');
      try {
        return await task(engine);
      } finally {
        this.store.getState().setStatus('ready');
      }
    });
    this.chain = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  /** Ход бота на заданном уровне. */
  async bestMove(fen: string, level: BotLevel): Promise<string | null> {
    return this.run(async (engine) => {
      await engine.isReady();
      applyLevel(engine, level);
      const res = await engine.go({
        fen,
        depth: level.depth,
        movetime: level.movetime,
        multipv: 1,
      });
      return res.bestmove && res.bestmove !== '(none)' ? res.bestmove : null;
    });
  }

  /** Анализ позиции (подсказка, оценка). */
  async analyse(fen: string, opts: { depth?: number; movetime?: number; multipv?: number } = {}): Promise<AnalysisResult> {
    return this.run(async (engine) => {
      await engine.isReady();
      engine.setOption('UCI_LimitStrength', 'false');
      engine.setOption('Skill Level', 20);
      engine.setOption('MultiPV', opts.multipv ?? 1);
      const res = await engine.go({
        fen,
        depth: opts.depth ?? 14,
        movetime: opts.movetime,
        multipv: opts.multipv,
      });
      const lines: AnalysisLine[] = res.info
        .filter((l) => l.pv.length)
        .map((l) => ({ ...l, uci: l.pv[0] }));
      const top = lines[0];
      return {
        best: top?.uci ?? (res.bestmove !== '(none)' ? res.bestmove : null),
        cp: top?.cp ?? (top?.mate !== undefined ? (top.mate > 0 ? 10000 : -10000) : 0),
        mate: top?.mate ?? null,
        lines,
      };
    });
  }

  /** Оценка позиции для разбора партии: только счёт, без длинных линий. */
  async evaluate(fen: string, depth: number, movetime: number): Promise<{ cp: number; mate: number | null; best: string | null }> {
    const res = await this.analyse(fen, { depth, movetime, multipv: 1 });
    return { cp: res.cp, mate: res.mate, best: res.best };
  }

  stop(): void {
    this.engine?.stop();
  }
}

export const engineManager = new EngineManager();
