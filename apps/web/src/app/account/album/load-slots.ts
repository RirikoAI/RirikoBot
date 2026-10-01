/**
 * Lets a fixed number of tasks run at once; the rest wait in request order. Each request returns
 * a release function that frees the slot (or leaves the queue) and is safe to call more than once.
 */
export class LoadSlots {
  private active = 0;
  private readonly waiting: Array<() => void> = [];

  constructor(private readonly limit: number) {}

  request(start: () => void): () => void {
    let state: 'waiting' | 'active' | 'released' = 'waiting';
    const grant = () => {
      state = 'active';
      this.active += 1;
      start();
    };
    if (this.active < this.limit) grant();
    else this.waiting.push(grant);

    return () => {
      if (state === 'waiting') {
        this.waiting.splice(this.waiting.indexOf(grant), 1);
      } else if (state === 'active') {
        this.active -= 1;
        this.waiting.shift()?.();
      }
      state = 'released';
    };
  }
}
