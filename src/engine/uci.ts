export interface EngineOption {
  name: string;
  type: string;
  default?: string;
  min?: number;
  max?: number;
  vars?: string[];
}

export interface EngineInfoLine {
  depth: number;
  multipv: number;
  /** Сантипешки с точки зрения сходящего (если не мат). */
  cp?: number;
  /** Мат через N ходов (со знаком) с точки зрения сходящего. */
  mate?: number;
  pv: string[];
}

export interface SearchResult {
  bestmove: string;
  info: EngineInfoLine[];
}

export interface WorkerLike {
  postMessage(data: unknown): void;
  addEventListener(type: 'message', listener: (ev: { data: unknown }) => void): void;
  removeEventListener?(type: 'message', listener: (ev: { data: unknown }) => void): void;
  terminate(): void;
}

/**
 * Тонкая обёртка над Stockfish-воркером, говорящим по UCI.
 * Все команды выполняются последовательно; go() собирает info-строки до bestmove.
 */
export class UciEngine {
  private queue: Promise<unknown> = Promise.resolve();
  private listeners = new Set<(line: string) => void>();
  private terminated = false;
  readonly options = new Map<string, EngineOption>();

  private constructor(private readonly worker: WorkerLike) {
    worker.addEventListener('message', (ev) => {
      let data: unknown = ev.data;
      if (data && typeof data === 'object' && 'data' in data) data = (data as { data: unknown }).data;
      if (typeof data !== 'string') return;
      for (const line of data.split('\n')) {
        const trimmed = line.trim();
        if (trimmed) for (const l of this.listeners) l(trimmed);
      }
    });
  }

  static async create(worker: WorkerLike): Promise<UciEngine> {
    const engine = new UciEngine(worker);
    await engine.uci();
    return engine;
  }

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task, task);
    this.queue = run.catch(() => undefined);
    return run;
  }

  private waitUntil(predicate: (line: string) => boolean, timeoutMs = 30000): Promise<string> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.listeners.delete(listener);
        reject(new Error('Engine response timeout'));
      }, timeoutMs);
      const listener = (line: string) => {
        if (predicate(line)) {
          clearTimeout(timer);
          this.listeners.delete(listener);
          resolve(line);
        }
      };
      this.listeners.add(listener);
    });
  }

  send(cmd: string): void {
    if (this.terminated) throw new Error('Engine is terminated');
    this.worker.postMessage(cmd);
  }

  private async uci(): Promise<void> {
    await this.enqueue(async () => {
      const done = this.waitUntil((l) => l === 'uciok');
      this.send('uci');
      const collector = (line: string) => {
        if (line.startsWith('option ')) {
          const opt = parseOptionLine(line);
          if (opt) this.options.set(opt.name, opt);
        }
      };
      this.listeners.add(collector);
      try {
        await done;
      } finally {
        this.listeners.delete(collector);
      }
    });
  }

  async isReady(): Promise<void> {
    await this.enqueue(async () => {
      const done = this.waitUntil((l) => l === 'readyok', 60000);
      this.send('isready');
      await done;
    });
  }

  hasOption(name: string): boolean {
    return this.options.has(name);
  }

  setOption(name: string, value: string | number | boolean): void {
    if (!this.options.has(name)) return;
    this.send(`setoption name ${name} value ${value}`);
  }

  /**
   * Запуск поиска. depth/movetime задают лимиты; multipv — число линий.
   * Резолвится по bestmove.
   */
  go(params: {
    depth?: number;
    movetime?: number;
    multipv?: number;
    fen?: string;
    searchmoves?: string[];
  }): Promise<SearchResult> {
    return this.enqueue(
      () =>
        new Promise<SearchResult>((resolve, reject) => {
          const info: EngineInfoLine[] = [];
          const listener = (line: string) => {
            if (line.startsWith('info ')) {
              const parsed = parseInfoLine(line);
              if (parsed) mergeInfo(info, parsed);
            } else if (line.startsWith('bestmove')) {
              this.listeners.delete(listener);
              const bestmove = line.slice('bestmove '.length).split(/\s+/)[0];
              resolve({ bestmove, info });
            }
          };
          this.listeners.add(listener);
          if (params.fen) this.send(`position fen ${params.fen}`);
          let cmd = 'go';
          if (params.depth) cmd += ` depth ${params.depth}`;
          if (params.movetime) cmd += ` movetime ${params.movetime}`;
          this.send(cmd);
          // Страховка от зависания движка без bestmove.
          setTimeout(() => {
            if (this.listeners.has(listener)) {
              this.listeners.delete(listener);
              reject(new Error('Engine search timeout'));
            }
          }, (params.movetime ?? 0) + 60000);
        }),
    );
  }

  stop(): void {
    if (!this.terminated) this.send('stop');
  }

  async quit(): Promise<void> {
    if (this.terminated) return;
    this.terminated = true;
    try {
      this.send('quit');
    } catch {
      /* уже мёртв */
    }
    setTimeout(() => this.worker.terminate(), 100);
  }

  get isTerminated(): boolean {
    return this.terminated;
  }
}

function parseOptionLine(line: string): EngineOption | null {
  const m = line.match(/^option name (.+?) type (\w+)(.*)$/);
  if (!m) return null;
  const opt: EngineOption = { name: m[1], type: m[2] };
  const rest = m[3];
  const def = rest.match(/ default (\S+)/);
  if (def) opt.default = def[1];
  const min = rest.match(/ min (-?\d+)/);
  if (min) opt.min = Number(min[1]);
  const max = rest.match(/ max (-?\d+)/);
  if (max) opt.max = Number(max[1]);
  const vars = [...rest.matchAll(/ var (\S+)/g)].map((v) => v[1]);
  if (vars.length) opt.vars = vars;
  return opt;
}

export function parseInfoLine(line: string): EngineInfoLine | null {
  if (!line.includes(' pv ')) return null;
  const tokens = line.split(/\s+/);
  const info: EngineInfoLine = { depth: 0, multipv: 1, pv: [] };
  for (let i = 1; i < tokens.length; i++) {
    const t = tokens[i];
    if (t === 'depth' && tokens[i + 1]) info.depth = Number(tokens[i + 1]);
    else if (t === 'multipv' && tokens[i + 1]) info.multipv = Number(tokens[i + 1]);
    else if (t === 'score') {
      if (tokens[i + 1] === 'cp' && tokens[i + 2]) info.cp = Number(tokens[i + 2]);
      else if (tokens[i + 1] === 'mate' && tokens[i + 2]) info.mate = Number(tokens[i + 2]);
    } else if (t === 'pv') {
      info.pv = tokens.slice(i + 1);
      break;
    }
  }
  return info.pv.length ? info : null;
}

function mergeInfo(list: EngineInfoLine[], fresh: EngineInfoLine): void {
  const idx = list.findIndex((l) => l.multipv === fresh.multipv);
  if (idx >= 0) list[idx] = fresh;
  else list.push(fresh);
}
