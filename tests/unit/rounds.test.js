import test from 'node:test';
import assert from 'node:assert/strict';
import { ROUNDS, MAX_TOTAL } from '../../src/data.js';

test('the four official rounds remain in order with their original maximums', () => {
  assert.deepEqual(ROUNDS.map(round => [round.id, round.name, round.max]), [
    [1, 'Prompt Golf', 25],
    [2, 'Guardrail Challenge', 30],
    [3, 'Artifact Forge', 35],
    [4, 'AI Survival Dilemma', 40]
  ]);
  assert.equal(MAX_TOTAL, 130);
});

test('every round rubric adds up to its advertised maximum', () => {
  for (const round of ROUNDS) {
    assert.ok(round.criteria.length > 0, `${round.name} needs scoring criteria`);
    assert.equal(
      round.criteria.reduce((sum, criterion) => sum + criterion.max, 0),
      round.max,
      `${round.name} criterion totals must equal ${round.max}`
    );
    for (const criterion of round.criteria) {
      assert.ok(Number.isInteger(criterion.max) && criterion.max > 0,
        `${round.name}: ${criterion.name} should have a positive integer maximum`);
    }
  }
});
