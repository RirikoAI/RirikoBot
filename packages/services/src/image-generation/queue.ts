export interface QueueTask {
  readonly id: string;
  readonly run: () => Promise<void>;
  readonly cancel: (reason: Error) => void;
  readonly enqueuedAt: Date;
  readonly timeoutMs: number;
}

export interface ImageJobQueueOptions {
  readonly concurrency?: number | undefined;
  readonly defaultTimeoutMs?: number | undefined;
}

export class ImageJobQueue {
  private readonly concurrency: number;
  private readonly defaultTimeoutMs: number;
  private readonly queue: QueueTask[] = [];
  private activeJobs = 0;

  constructor(options: ImageJobQueueOptions = {}) {
    this.concurrency = options.concurrency ?? 2;
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? 120000;
  }

  public get activeCount(): number {
    return this.activeJobs;
  }

  public get queuedCount(): number {
    return this.queue.length;
  }

  public getQueuePosition(id: string): number {
    const idx = this.queue.findIndex((job) => job.id === id);
    return idx === -1 ? 0 : idx + 1;
  }

  public async enqueue<T>(id: string, execute: () => Promise<T>, timeoutMs?: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      let isSettled = false;

      const task: QueueTask = {
        id,
        run: async () => {
          try {
            const result = await execute();
            if (!isSettled) {
              isSettled = true;
              resolve(result);
            }
          } catch (err) {
            if (!isSettled) {
              isSettled = true;
              reject(err);
            }
          }
        },
        cancel: (reason: Error) => {
          if (!isSettled) {
            isSettled = true;
            reject(reason);
          }
        },
        enqueuedAt: new Date(),
        timeoutMs: timeoutMs ?? this.defaultTimeoutMs,
      };

      this.queue.push(task);
      this.processNext();
    });
  }

  private processNext(): void {
    if (this.activeJobs >= this.concurrency || this.queue.length === 0) {
      return;
    }

    const task = this.queue.shift();
    if (!task) return;

    this.activeJobs++;

    let isDone = false;
    let timer: NodeJS.Timeout | undefined;

    if (task.timeoutMs > 0) {
      timer = setTimeout(() => {
        if (!isDone) {
          isDone = true;
          task.cancel(new Error(`Image generation job ${task.id} timed out after ${task.timeoutMs}ms`));
          this.activeJobs--;
          this.processNext();
        }
      }, task.timeoutMs);
    }

    task
      .run()
      .finally(() => {
        if (!isDone) {
          isDone = true;
          if (timer) clearTimeout(timer);
          this.activeJobs--;
          this.processNext();
        }
      });
  }
}
