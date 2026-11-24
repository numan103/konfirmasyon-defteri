import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveCloudChoice } from '../assets/alfa-cloud-conflict.mjs';
function fixture() {
  const s = { local: { chartType: 'line' }, remote: { settings: { chartType: 'candles' }, revision: 3 }, done: false, writes: 0 };
  const options = {
    readLocal: () => s.local, load: async () => structuredClone(s.remote),
    archive: async () => true, apply: async value => { s.local = value; },
    save: async (value, revision) => {
      assert.equal(revision, s.remote.revision); s.writes++;
      s.remote = { settings: value, revision: revision + 1 }; return { ok: true, revision: revision + 1 };
    }, finish: () => { s.done = true; }
  };
  return { s, options };
}
test('keep local uses fresh cloud revision and confirms the written copy before unblocking', async () => {
  const { s, options } = fixture();
  await resolveCloudChoice({ ...options, choice: 'local' });
  assert.equal(s.done, true); assert.equal(s.writes, 1);
  assert.equal(s.remote.settings.chartType, 'line');
});
test('use cloud requires verification and archive without overwriting cloud', async () => {
  const { s, options } = fixture();
  await resolveCloudChoice({ ...options, choice: 'cloud' });
  assert.equal(s.done, true); assert.equal(s.writes, 0); assert.equal(s.local.chartType, 'candles');
});
test('a false acknowledgement, concurrent edit, archive failure or account change leaves sync blocked', async () => {
  for (const mode of ['ack', 'edit', 'archive', 'account']) {
    const { s, options } = fixture();
    if (mode === 'ack') options.save = async () => ({ ok: true, revision: 4 });
    if (mode === 'edit') options.save = async () => { s.local = { chartType: 'bars' }; return { ok: true, revision: 4 }; };
    if (mode === 'archive') options.archive = async () => false;
    if (mode === 'account') options.valid = () => false;
    await assert.rejects(resolveCloudChoice({ ...options, choice: 'local' }));
    assert.equal(s.done, false);
  }
});
