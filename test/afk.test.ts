import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { distance3, isSignificantMove, secondsToTicks } from "../sapi/src/afk-util.ts";

describe("afk util", () => {
  it("distance3 欧氏距离", () => {
    assert.equal(distance3({ x: 0, y: 0, z: 0 }, { x: 3, y: 4, z: 0 }), 5);
  });

  it("≥1.0 判定有效位移", () => {
    assert.equal(isSignificantMove({ x: 0, y: 0, z: 0 }, { x: 0.9, y: 0, z: 0 }), false);
    assert.equal(isSignificantMove({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }), true);
  });

  it("secondsToTicks", () => {
    assert.equal(secondsToTicks(15), 300);
  });
});
