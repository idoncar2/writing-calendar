/** Avoid constructing an Intl formatter in every editor transaction. */
export class ActivityTimezone {
  private timezone = "UTC";
  private refreshedAt = -Infinity;

  constructor(private readonly resolve = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC") {}

  get(now: number): string {
    // Refresh periodically so changing the device timezone does not require a reload.
    if (now < this.refreshedAt || now - this.refreshedAt >= 60_000) {
      this.timezone = this.resolve();
      this.refreshedAt = now;
    }
    return this.timezone;
  }
}
