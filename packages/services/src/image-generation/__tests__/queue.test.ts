import { describe, it, expect } from 'vitest';
import { ImageJobQueue } from '../queue.js';

describe('ImageJobQueue (TASK-1321)', () => {
  it('enforces concurrency limit and processes jobs sequentially/concurrently', async () => {
    const queue = new ImageJobQueue({ concurrency: 2 });
    let activeNow = 0;
    let maxSeen = 0;

    const makeTask = (id: string, delayMs: number) => {
      return queue.enqueue(id, async () => {
        activeNow++;
        if (activeNow > maxSeen) maxSeen = activeNow;
        await new Promise((res) => setTimeout(res, delayMs));
        activeNow--;
        return `done-${id}`;
      });
    };

    const p1 = makeTask('job-1', 40);
    const p2 = makeTask('job-2', 40);
    const p3 = makeTask('job-3', 20);

    expect(queue.activeCount).toBeLessThanOrEqual(2);
    expect(queue.getQueuePosition('job-3')).toBe(1);

    const results = await Promise.all([p1, p2, p3]);
    expect(results).toEqual(['done-job-1', 'done-job-2', 'done-job-3']);
    expect(maxSeen).toBe(2);
    expect(queue.activeCount).toBe(0);
    expect(queue.queuedCount).toBe(0);
  });

  it('handles job timeouts properly', async () => {
    const queue = new ImageJobQueue({ concurrency: 1, defaultTimeoutMs: 30 });

    const slowJob = queue.enqueue('slow', async () => {
      await new Promise((res) => setTimeout(res, 200));
      return 'completed';
    });

    await expect(slowJob).rejects.toThrow(/timed out/i);
    expect(queue.activeCount).toBe(0);
  });

  it('propagates task errors without breaking the queue for subsequent jobs', async () => {
    const queue = new ImageJobQueue({ concurrency: 1 });

    const failedJob = queue.enqueue('fail', async () => {
      throw new Error('API failure');
    });

    const successJob = queue.enqueue('success', async () => {
      return 'ok';
    });

    await expect(failedJob).rejects.toThrow('API failure');
    const result = await successJob;
    expect(result).toBe('ok');
    expect(queue.activeCount).toBe(0);
  });
});
