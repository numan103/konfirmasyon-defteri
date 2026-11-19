import test from 'node:test';
import assert from 'node:assert/strict';
import { moveItem } from '../assets/content-sortable.mjs';
const items = () => ['a', 'b', 'c', 'd'].map(id => ({ id, title:id }));
test('moving before/after works in both directions and retains the original objects', () => {
  const list = items(), a = list[0];
  assert.equal(moveItem(list, 'a', 'd', true), true);
  assert.deepEqual(list.map(x => x.id), ['b','c','d','a']);
  assert.equal(list[3], a);
  assert.equal(moveItem(list, 'a', 'b'), true);
  assert.deepEqual(list.map(x => x.id), ['a','b','c','d']);
  assert.equal(moveItem(list, 'd', 'b', true), true);
  assert.deepEqual(list.map(x => x.id), ['a','b','d','c']);
  assert.equal(moveItem(list, 'a', 'd'), true);
  assert.deepEqual(list.map(x => x.id), ['b','a','d','c']);
});
test('self drops, missing ids and equivalent placements do not mutate order', () => {
  const list = items();
  for (const args of [['a','a'],['bad','a'],['a','bad'],['a','b'],['b','a',true]]) assert.equal(moveItem(list, ...args), false);
  assert.deepEqual(list, items());
});
