import { describe, expect, it } from "vitest";
import { createQueue, QueueFullError } from "./queue";

describe("createQueue", () => {
  it("runs tasks strictly one at a time, in order", async () => {
    const queue = createQueue(5);
    const log: string[] = [];
    let running = 0;
    let maxRunning = 0;
    const task = (name: string, ms: number) => async () => {
      running += 1;
      maxRunning = Math.max(maxRunning, running);
      log.push(`start ${name}`);
      await new Promise((resolve) => setTimeout(resolve, ms));
      log.push(`end ${name}`);
      running -= 1;
      return name;
    };
    const results = await Promise.all([
      queue.run(task("a", 30)),
      queue.run(task("b", 5)),
      queue.run(task("c", 5)),
    ]);
    expect(results).toEqual(["a", "b", "c"]);
    expect(maxRunning).toBe(1);
    expect(log).toEqual(["start a", "end a", "start b", "end b", "start c", "end c"]);
  });

  it("keeps serving after a task fails", async () => {
    const queue = createQueue(2);
    await expect(queue.run(() => Promise.reject(new Error("boom")))).rejects.toThrow("boom");
    await expect(queue.run(async () => "ok")).resolves.toBe("ok");
  });

  it("refuses to queue beyond its waiting limit instead of piling up past the function's time limit", async () => {
    const queue = createQueue(1);
    const slow = queue.run(() => new Promise((resolve) => setTimeout(() => resolve("slow"), 30)));
    const waiting = queue.run(async () => "waiting");
    await expect(queue.run(async () => "third")).rejects.toBeInstanceOf(QueueFullError);
    await expect(Promise.all([slow, waiting])).resolves.toEqual(["slow", "waiting"]);
  });
});
