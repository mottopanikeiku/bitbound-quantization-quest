import test from 'node:test';
import assert from 'node:assert/strict';
import { breathing, eventElapsed, guardJudgement, guardFeedback, GUARD_WINDOWS, TEACHING_GUARD_WINDOWS } from '../src/battle/timing.js';

test('guard windows include both fair boundaries and stack brace only once', () => {
  for (const error of [-0.07, 0, 0.07]) assert.deepEqual(guardJudgement(error), { grade: 'perfect', multiplier: 0.25, bytes: 2 });
  for (const error of [-0.16, -0.07001, 0.07001, 0.16]) assert.deepEqual(guardJudgement(error), { grade: 'good', multiplier: 0.6, bytes: 0 });
  for (const error of [-0.16001, 0.16001, 1]) assert.deepEqual(guardJudgement(error), { grade: 'miss', multiplier: 1, bytes: 0 });
  assert.equal(guardJudgement(0, true).multiplier, 0.125);
  assert.equal(guardJudgement(0.1, true).multiplier, 0.3);
  assert.equal(guardJudgement(1, true).multiplier, 0.5);
  assert.deepEqual(GUARD_WINDOWS, { perfect: 0.07, good: 0.16 });
});

test('first-beat teaching windows widen once without changing ordinary guards', () => {
  assert.equal(guardJudgement(0.12, false, TEACHING_GUARD_WINDOWS).grade, 'perfect');
  assert.equal(guardJudgement(-0.24, false, TEACHING_GUARD_WINDOWS).grade, 'good');
  assert.equal(guardJudgement(0.24001, false, TEACHING_GUARD_WINDOWS).grade, 'miss');
  assert.equal(guardJudgement(0.12).grade, 'good');
  assert.equal(guardJudgement(0.24).grade, 'miss');
  assert.equal(guardFeedback(-0.4, guardJudgement(-0.4)), 'EARLY');
  assert.equal(guardFeedback(0.4, guardJudgement(0.4)), 'LATE');
  assert.equal(guardFeedback(0, guardJudgement(0)), 'PERFECT');
});

test('breathing reaches both ends and Shift can halve elapsed speed without changing range', () => {
  assert.equal(breathing(0, 2), 0);
  assert.equal(breathing(1, 2), 1);
  assert.ok(Math.abs(breathing(0.5, 2) - 0.5) < 1e-12);
  assert.equal(breathing(2, 2), 0);
  assert.equal(breathing(2 * 0.5, 2), 1);
});

test('locks judge event time, not the delayed rendering frame', () => {
  const input = { pressTime: () => 975 };
  assert.equal(eventElapsed(0.8, input, 1000, 0.05), 0.775);
  assert.equal(eventElapsed(0.8, input, 1000, 0.05, 0.5), 0.7875000000000001);
  assert.equal(eventElapsed(0.8, { pressTime: () => 200 }, 1000, 0.05), 0.75);
  assert.equal(eventElapsed(0.8, { pressTime: () => 1100 }, 1000, 0.05), 0.8);
  assert.equal(eventElapsed(0.01, input, 1000, 0.05), 0);
});
