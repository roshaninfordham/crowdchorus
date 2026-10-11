import { expect, it } from "vitest";
import { stepStates } from "./steps";

it("marks a step done only after the job moved past it", () => {
  expect(stepStates("pending")).toEqual(["active", "todo", "todo", "todo", "todo", "todo"]);
  expect(stepStates("generating_art")).toEqual(["done", "done", "active", "todo", "todo", "todo"]);
  expect(stepStates("mixing")).toEqual(["done", "done", "done", "done", "active", "todo"]);
  expect(stepStates("completed")).toEqual(Array(6).fill("done"));
});

it("locates a failure from the durations that succeeded", () => {
  expect(stepStates("failed", { brief: 1, art: 2 })).toEqual(["done", "done", "done", "failed", "todo", "todo"]);
  expect(stepStates("failed", {})).toEqual(["done", "failed", "todo", "todo", "todo", "todo"]);
  expect(stepStates("failed", { brief: 1, art: 1, music: 1, mix: 1 })).toEqual([
    "done", "done", "done", "done", "done", "failed",
  ]);
});
