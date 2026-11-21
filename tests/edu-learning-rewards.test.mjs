import test from 'node:test';
import assert from 'node:assert/strict';
import { learningRewards } from '../assets/edu-learning-rewards.mjs';
import fs from 'node:fs';
const course = (id, count, done, locked = false) => ({ id, items: Array.from({ length: count }, (_, i) => ({ id: id + ':' + i, done: i < done, locked })) });
test('XP and badges are derived from unique accessible completion marks, not click counts', () => {
  const c = course('a', 5, 5);
  const rewards = learningRewards([c, c]);
  assert.equal(rewards.done, 5); assert.equal(rewards.finished, 1); assert.equal(rewards.xp, 225);
  assert.equal(rewards.badges.find(b => b.id === 'first').earned, true);
  assert.equal(rewards.badges.find(b => b.id === 'five').earned, true);
  assert.equal(rewards.badges.find(b => b.id === 'ten').earned, false);
  assert.deepEqual(rewards, learningRewards([c]));
});
test('locked content cannot earn XP or a full-course award; an undone lesson recalculates totals', () => {
  const mixed = course('a', 2, 2); mixed.items[1].locked = true;
  assert.equal(learningRewards([mixed]).xp, 25);
  assert.equal(learningRewards([mixed]).finished, 0);
  mixed.items[0].done = false;
  assert.equal(learningRewards([mixed]).xp, 0);
  assert.equal(learningRewards([course('paid', 10, 10, true)]).xp, 0);
});
test('empty curriculum never awards a completed section or fabricated reward', () => {
  assert.equal(learningRewards([{ id: 'empty', items: [] }]).finished, 0);
  assert.equal(learningRewards([]).xp, 0);
  assert.equal(learningRewards([]).badges.some(b => b.earned), false);
});
test('real education completion and catalog rendering feed the student-only reward panel', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.ok(html.includes('id="edu-learning-rewards"'));
  const progress = html.slice(html.indexOf('function chProgSet('), html.indexOf('function chIsAdmin()'));
  assert.ok(progress.includes('refreshEduLearningRewards()'));
  const renderer = html.slice(html.indexOf('function refreshEduLearningRewards()'), html.indexOf('function chCanEdit('));
  assert.ok(renderer.includes("account: AUTH.user?.id || ''"));
  assert.ok(renderer.includes('done: chIsDone(c.t, item.video)'));
  assert.ok(renderer.includes('locked: chItemLocked(item.video)'));
  assert.ok(renderer.includes('admin: chIsAdmin()'));
});
