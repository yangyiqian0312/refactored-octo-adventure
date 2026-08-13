import { describe, expect, it } from "vitest";
import { PickSequenceTracker } from "./pickSequence.js";

describe("PickSequenceTracker", () => {
  it("flags an older number that arrives after newer numbers", () => {
    const tracker = new PickSequenceTracker();
    expect(tracker.observe("A 29")).toEqual({ late: false });
    expect(tracker.observe("A 30")).toEqual({ late: false });
    expect(tracker.observe("A 31")).toEqual({ late: false });
    expect(tracker.observe("A 15")).toEqual({ late: true, previousMax: 31 });
  });

  it("tracks each letter series independently", () => {
    const tracker = new PickSequenceTracker();
    tracker.observe("A 31");
    expect(tracker.observe("B 1")).toEqual({ late: false });
    expect(tracker.observe("A 30")).toEqual({ late: true, previousMax: 31 });
  });

  it("allows a new letter series to restart at one after a four-digit number", () => {
    const tracker = new PickSequenceTracker();
    expect(tracker.observe("G 1000")).toEqual({ late: false });
    expect(tracker.observe("K 1")).toEqual({ late: false });
    expect(tracker.observe("K 2")).toEqual({ late: false });
    expect(tracker.observe("K 1")).toEqual({ late: true, previousMax: 2 });
  });

  it("does not flag duplicate or nonnumeric pick codes", () => {
    const tracker = new PickSequenceTracker();
    tracker.observe("30");
    expect(tracker.observe("30")).toEqual({ late: false });
    expect(tracker.observe("SPECIAL")).toEqual({ late: false });
  });
});
