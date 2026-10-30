import { test } from "node:test";
import assert from "node:assert/strict";
import { fromMeta, planBatch } from "../src/core/funnel.ts";

const view = { width: 1280, height: 800 };

test("Meta's 0-1000 grid maps to viewport pixels, clamped at the edges", () => {
  assert.deepEqual(fromMeta({ action: "left_click", coordinate: [500, 500] }, view), [{ type: "click", button: "left", x: 640, y: 400 }]);
  assert.deepEqual(fromMeta({ action: "double_click", coordinate: [1000, 1000] }, view), [{ type: "double_click", x: 1279, y: 799 }]);
  assert.deepEqual(fromMeta({ action: "mouse_move", coordinate: [-5, 0] }, view), [{ type: "move", x: 0, y: 0 }]);
});

test("keys, typing, scrolling, and drags become driver actions", () => {
  assert.deepEqual(fromMeta({ action: "key", text: "ctrl + a" }, view), [{ type: "keypress", keys: ["ctrl", "a"] }]);
  assert.deepEqual(fromMeta({ action: "type", text: "SAVE20" }, view), [{ type: "type", text: "SAVE20" }]);
  assert.deepEqual(fromMeta({ action: "scroll", scroll_direction: "up", scroll_amount: 3 }, view), [{ type: "scroll", x: 640, y: 400, scroll_x: 0, scroll_y: -300 }]);
  assert.deepEqual(fromMeta({ action: "left_click_drag", start_coordinate: [0, 0], coordinate: [500, 500] }, view), [{ type: "drag", path: [{ x: 0, y: 0 }, { x: 640, y: 400 }] }]);
});

test("bad actions come back as errors the model can fix, not crashes", () => {
  assert.match(fromMeta({ action: "left_click" }, view) as string, /needs a coordinate/);
  assert.match(fromMeta({ action: "key" }, view) as string, /needs text/);
  assert.match(fromMeta({ action: "hold_key", text: "shift" }, view) as string, /unsupported/);
});

test("one bad action stops the whole batch: no typing or Enter after a rejected click", () => {
  const plan = planBatch([{ action: "left_click" }, { action: "type", text: "test@offertest.ai" }, { action: "key", text: "enter" }], view);
  assert.equal(typeof plan, "string");
  assert.match(plan as string, /nothing was run. action 1: left_click needs a coordinate/);
  assert.match(planBatch([], view) as string, /non-empty actions list/);
  const ok = planBatch([{ action: "left_click", coordinate: [500, 500] }, { action: "type", text: "SAVE20" }], view);
  assert.deepEqual(Array.isArray(ok) && ok.map((p) => p.action), ["left_click", "type"]);
});
