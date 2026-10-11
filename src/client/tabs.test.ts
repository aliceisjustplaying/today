import { expect, test } from "bun:test";
import { resolveTab } from "./tabs";

test("restores the remembered tab while it still exists, else falls back to To do", () => {
  const tabs = ["Dev", "To do"];
  expect(resolveTab("Dev", tabs)).toBe("Dev");
  expect(resolveTab("Limits", tabs)).toBe("Limits");
  expect(resolveTab("Limits", [])).toBe("Limits");
  expect(resolveTab("Old team", tabs)).toBe("To do");
  expect(resolveTab(null, tabs)).toBe("To do");
  expect(resolveTab("Old team", ["Dev", "Ops"])).toBe("Dev");
  expect(resolveTab(null, [])).toBeNull();
});
