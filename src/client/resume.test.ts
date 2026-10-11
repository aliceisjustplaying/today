import { expect, test } from "bun:test";
import { throttle } from "./resume";

test("a resume refetches only once the gap since the last load has passed", () => {
  let t = 1_000;
  let calls = 0;
  const refetch = throttle(() => calls++, 15_000, () => t);
  t += 3_000;
  refetch();
  expect(calls).toBe(0);
  t += 12_000;
  refetch();
  expect(calls).toBe(1);
  t += 5_000;
  refetch();
  expect(calls).toBe(1);
  t += 15_000;
  refetch();
  expect(calls).toBe(2);
});
