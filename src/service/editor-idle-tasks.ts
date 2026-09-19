export class EditorIdleTasks {
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private lastActivity = -Infinity;
  private disposed = false;

  constructor(private readonly quietMs: number) {}
  noteActivity(): void { this.lastActivity = Date.now(); }

  schedule(key: string, task: () => void, delay: number, replace = true): void {
    if (this.disposed) return;
    const previous = this.timers.get(key);
    if (previous !== undefined) {
      if (!replace) return;
      clearTimeout(previous);
    }
    const run = () => {
      const remaining = this.quietMs - (Date.now() - this.lastActivity);
      if (remaining > 0) {
        this.timers.set(key, setTimeout(run, remaining));
        return;
      }
      this.timers.delete(key);
      task();
    };
    this.timers.set(key, setTimeout(run, delay));
  }

  dispose(): void {
    this.disposed = true;
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
  }
}
