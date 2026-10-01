import { describe, expect, it, vi } from 'vitest';
import { LoadSlots } from './load-slots';

describe('LoadSlots (BUG-0028)', () => {
  it('starts up to the limit at once and the rest in request order as slots free', () => {
    const slots = new LoadSlots(2);
    const started: number[] = [];
    const releases = [1, 2, 3, 4].map((n) => slots.request(() => started.push(n)));

    expect(started).toEqual([1, 2]);
    releases[0]!();
    expect(started).toEqual([1, 2, 3]);
    releases[1]!();
    expect(started).toEqual([1, 2, 3, 4]);
  });

  it('drops a waiting request that is released before it starts', () => {
    const slots = new LoadSlots(1);
    const second = vi.fn();
    const third = vi.fn();
    const releaseFirst = slots.request(() => undefined);
    const releaseSecond = slots.request(second);
    slots.request(third);

    releaseSecond();
    releaseFirst();

    expect(second).not.toHaveBeenCalled();
    expect(third).toHaveBeenCalledOnce();
  });

  it('frees a slot only once, however often it is released', () => {
    const slots = new LoadSlots(1);
    const started: number[] = [];
    const release = slots.request(() => started.push(1));
    slots.request(() => started.push(2));
    slots.request(() => started.push(3));

    release();
    release();

    expect(started).toEqual([1, 2]);
  });
});
