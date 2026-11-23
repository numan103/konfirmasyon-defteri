import test from 'node:test';
import assert from 'node:assert/strict';
import { makeDrawing, emptyDocument, DrawingHistory, translateSelection, validateDocument } from '../assets/alfa-drawings-model.mjs';
import { DrawingEngine } from '../assets/alfa-drawings.mjs';
import { FloatingToolbar } from '../assets/alfa-floating-toolbar.mjs';
const a = { time: 1700000000, price: 100 }, b = { time: 1700003600, price: 95 };
test('multi-move translates all unlocked anchors/targets atomically, including brush and position geometry', () => {
  const trend = makeDrawing('trend', [a, b]), position = makeDrawing('long', [a, b]), brush = makeDrawing('brush', [a, b, { time: b.time + 600, price: 99 }]);
  const locked = makeDrawing('horizontal', [a]); locked.locked = true;
  const doc = { ...emptyDocument(), drawings: [trend, position, brush, locked] };
  const moved = translateSelection(doc, doc.drawings.map(d => d.id), 7200, 5);
  for (let i = 0; i < 3; i++) assert.deepEqual(moved.drawings[i].points, doc.drawings[i].points.map(p => ({ time: p.time + 7200, price: p.price + 5 })));
  assert.equal(moved.drawings[1].target, position.target + 5);
  assert.deepEqual(moved.drawings[3], locked);
  assert.equal(doc.drawings[0].points[0].price, 100);
  assert.throws(() => translateSelection(doc, [trend.id, position.id], 0, -200));
  assert.throws(() => translateSelection(doc, [trend.id], Infinity, 0));
});
function engine(drawings) {
  const e = Object.create(DrawingEngine.prototype);
  e.history = new DrawingHistory({ ...emptyDocument(), drawings }); e.ready = true; e.selected = null;
  e.cancel = () => {}; e.refresh = () => {}; e.step = () => 3600; e.commit = doc => e.history.commit(doc);
  return e;
}
test('Ctrl-style selection toggles independently; deletion is one undo step and keeps locked objects', () => {
  const one = makeDrawing('trend', [a, b]), two = makeDrawing('rectangle', [a, b]), locked = makeDrawing('horizontal', [a]); locked.locked = true;
  const e = engine([one, two, locked]);
  e.selectObjects([one.id]); e.selectObjects([two.id], { toggle: true }); e.selectObjects([locked.id], { toggle: true });
  assert.equal(e.selection.size, 3);
  e.action('remove');
  assert.deepEqual(e.history.doc.drawings.map(d => d.id), [locked.id]);
  assert.equal(e.history.past.length, 1); e.history.undo();
  assert.equal(e.history.doc.drawings.length, 3);
  e.selectObjects([two.id], { toggle: true }); assert.equal(e.selection.has(two.id), false);
});
test('copy, hide/lock and layer reordering operate on the selected subset only', () => {
  const drawings = [makeDrawing('trend', [a, b]), makeDrawing('rectangle', [a, b]), makeDrawing('text', [a])];
  const e = engine(drawings); e.selectObjects([drawings[0].id, drawings[1].id]);
  e.action('front'); assert.deepEqual(e.history.doc.drawings.map(d => d.id), [drawings[2].id, drawings[0].id, drawings[1].id]);
  e.action('hide'); assert.equal(e.history.doc.drawings.filter(d => d.hidden).length, 2);
  e.action('lock'); assert.equal(e.history.doc.drawings.filter(d => d.locked).length, 2);
  e.action('copy'); assert.equal(e.history.doc.drawings.length, 5); assert.equal(e.selection.size, 2);
  assert.ok(e.history.doc.drawings.slice(-2).every(d => !d.locked && !d.hidden));
});
test('optional folder/name metadata survives validation without changing legacy documents', () => {
  const d = makeDrawing('trend', [a, b]); d.group = 'Destekler'; d.name = 'Ana trend';
  const doc = validateDocument({ ...emptyDocument(), drawings: [d] });
  assert.equal(doc.drawings[0].group, 'Destekler');
  d.name = 'a'.repeat(81); assert.throws(() => validateDocument({ ...emptyDocument(), drawings: [d] }));
  assert.deepEqual(validateDocument(emptyDocument()), emptyDocument());
});
test('floating toolbar coordinates stay inside the plot and survive normalized resizing', () => {
  const toolbar = Object.create(FloatingToolbar.prototype);
  toolbar.element = { offsetWidth: 200, offsetHeight: 36, style: {}, hidden: false }; let bounds = { width: 600, height: 400 };
  toolbar.getBounds = () => bounds;
  toolbar.place(1000, -20);
  assert.equal(toolbar.element.style.left, '396px'); assert.equal(toolbar.element.style.top, '0px');
  bounds = { width: 300, height: 200 }; toolbar.apply();
  assert.equal(toolbar.element.style.left, '96px'); assert.equal(toolbar.element.style.top, '0px');
});
