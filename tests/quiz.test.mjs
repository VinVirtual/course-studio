import assert from 'node:assert/strict';
import { test } from 'node:test';
import { answerSupport, findProof } from '../cli/lib/quiz.mjs';
import { lesson } from './helpers.mjs';

const body = lesson({
  blocks: [
    { type: 'paragraph', text: 'Clouds form when the air cools below the [[dew point]]. Then vapour condenses.' },
    { type: 'list', items: ['Small drops are round like a ball.'] },
    { type: 'code', text: 'Hidden sentence in code.' },
  ],
});

test('a proof is found inside a paragraph, through inline markup', () => {
  const found = findProof(body, 'Clouds form when the air cools below the dew point.');
  assert.ok(found);
  assert.equal(found.start, 0);
});

test('quote style, dashes and spacing do not matter; words do', () => {
  const curly = lesson({ blocks: [{ type: 'paragraph', text: 'It is “round” — like a ball.' }] });
  assert.ok(findProof(curly, 'It is "round"  - like a ball.'));
  assert.equal(findProof(curly, 'It is round like a ball.'), null);
});

test('list items count, code does not', () => {
  assert.ok(findProof(body, 'Small drops are round like a ball.'));
  assert.equal(findProof(body, 'Hidden sentence in code.'), null);
});

test('answerSupport measures how much of the answer the proof says', () => {
  const item = { question: 'Why does rising air cool?', options: ['It spreads out under less pressure', 'Sun'], answer: 0, proof: 'As it rises it is under less pressure, so it spreads out.' };
  assert.equal(answerSupport(item), 1);
  assert.ok(answerSupport({ ...item, proof: 'Rain falls.' }) < 0.5);
});
