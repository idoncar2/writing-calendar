/**
 * Read-only, in-memory startup profiling. No note names, paths, text, or
 * activity contents are collected. Never persisted or synchronized.
 */
export interface StartupSpan {
  name: string;
  startedMs: number;
  durationMs: number;
}

export class StartupProfiler {
  private readonly startedAt: number;
  private readonly spans: StartupSpan[] = [];
  private readonly milestones = new Map<string, number>();
  private readonly counters = new Map<string, number>();
  private readonly maxSpans = 80;

  constructor(private readonly clock: () => number = () => performance.now()) {
    this.startedAt = clock();
  }

  begin(name: string): () => void {
    const start = this.clock();
    let completed = false;
    return () => {
      if (completed) return;
      completed = true;
      if (this.spans.length >= this.maxSpans) return;
      this.spans.push({
        name,
        startedMs: Math.max(0, start - this.startedAt),
        durationMs: Math.max(0, this.clock() - start),
      });
    };
  }

  mark(name: string): void {
    if (!this.milestones.has(name)) {
      this.milestones.set(name, Math.max(0, this.clock() - this.startedAt));
    }
  }

  count(name: string, count: number): void {
    if (Number.isFinite(count) && count >= 0) this.counters.set(name, Math.round(count));
  }

  snapshot(): { spans: StartupSpan[]; milestones: Array<{ name: string; atMs: number }>; counters: Array<{ name: string; value: number }> } {
    return {
      spans: [...this.spans],
      milestones: [...this.milestones].map(([name, atMs]) => ({ name, atMs })),
      counters: [...this.counters].map(([name, value]) => ({ name, value })),
    };
  }

  formatReport(version: string): string {
    const data = this.snapshot();
    const time = (ms: number): string => `${ms.toFixed(1)} ms`;
    const lines = [
      "Writing Calendar — 启动性能诊断",
      `插件版本：${version}`,
      "记录方式：仅本次启动、仅内存，不包含笔记内容或路径",
      "",
      "时间节点（从插件 onload 开始计时）：",
      ...data.milestones.map((mark) => `  ${mark.name}：+${time(mark.atMs)}`),
      "",
      "分阶段耗时（并行任务的时间不能直接相加）：",
      ...data.spans.sort((a, b) => a.startedMs - b.startedMs).map((span) =>
        `  ${span.name}：${time(span.durationMs)}（始于 +${time(span.startedMs)}）`),
      "",
      "处理规模：",
      ...data.counters.map((counter) => `  ${counter.name}：${counter.value}`),
    ];
    return lines.join("\n");
  }
}
