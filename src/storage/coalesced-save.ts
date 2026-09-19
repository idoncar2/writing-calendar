export class CoalescedSave {
  private pending?: Promise<void>;
  private dirty = false;

  constructor(private readonly persist: () => Promise<void>) {}

  request(): Promise<void> {
    this.dirty = true;
    this.pending ??= Promise.resolve().then(async () => {
      try {
        while (this.dirty) {
          this.dirty = false;
          await this.persist();
        }
      } finally {
        this.pending = undefined;
      }
    });
    return this.pending;
  }
}
