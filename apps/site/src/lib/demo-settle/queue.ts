/**
 * Serialises settlements inside one server instance: the submitting account has
 * a single sequence number, so two in-flight transactions would collide. A
 * bounded line keeps a burst from queueing past the function's time limit:
 * one task runs, up to `maxWaiting` more wait, the rest are refused.
 */
export class QueueFullError extends Error {}

export function createQueue(maxWaiting: number) {
  let tail: Promise<unknown> = Promise.resolve();
  let inLine = 0;

  return {
    get waiting() {
      return Math.max(0, inLine - 1);
    },
    run<T>(task: () => Promise<T>): Promise<T> {
      if (inLine >= maxWaiting + 1) return Promise.reject(new QueueFullError("queue_full"));
      inLine += 1;
      const leave = () => {
        inLine -= 1;
      };
      const result = tail.then(task);
      tail = result.then(leave, leave);
      return result;
    },
  };
}
