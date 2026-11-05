// Checks every rule from the product brief. Run with: node tests/rules.test.js
const assert = require('node:assert/strict');
const R = require('../rules.js');

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ok   ${name}`);
  } catch (err) {
    failed++;
    console.log(`  FAIL ${name}\n       ${err.message}`);
  }
}

// Local time helper: at(5, 22) = Nov 5 2026, 22:00
const at = (day, hour, min = 0) => new Date(2026, 10, day, hour, min);
const night = (day) => `2026-11-${String(day).padStart(2, '0')}`;

// Builds a log from [day, routine, kind, slot] rows.
function log(rows) {
  let entries = [];
  rows.forEach(([day, routine, kind, slot], i) => {
    entries = R.addEntry(entries, { routine, kind, slot, night: night(day), now: at(day, 22, i) });
  });
  return entries;
}

console.log('Nights');
test('3 am counts as the night before', () => assert.equal(R.nightOf(at(6, 3, 59)), night(5)));
test('4 am starts a new day', () => assert.equal(R.nightOf(at(6, 4)), night(6)));
test('10 pm is that night', () => assert.equal(R.nightOf(at(5, 22)), night(5)));
test('evening window is 7 pm to 4 am', () => {
  assert.equal(R.isEvening(at(5, 18, 59)), false);
  assert.equal(R.isEvening(at(5, 19)), true);
  assert.equal(R.isEvening(at(6, 3, 59)), true);
  assert.equal(R.isEvening(at(6, 4)), false);
});

console.log('Skincare suggestion');
test('last active BHA -> suggests the retinoid', () => {
  const e = log([[4, 'skin', 'used', 'exfoliant']]);
  assert.deepEqual(R.skinSuggestion(e, night(5)), { kind: 'product', slot: 'retinoid' });
});
test('last active retinoid -> suggests the BHA', () => {
  const e = log([[4, 'skin', 'used', 'retinoid']]);
  assert.deepEqual(R.skinSuggestion(e, night(5)), { kind: 'product', slot: 'exfoliant' });
});
test('skipped last night -> same suggestion as last night, last active 2 nights ago', () => {
  const e = log([[3, 'skin', 'used', 'exfoliant'], [4, 'skin', 'skipped']]);
  assert.deepEqual(R.skinSuggestion(e, night(4)), R.skinSuggestion(e, night(5)));
  assert.equal(R.skinSuggestion(e, night(5)).slot, 'retinoid');
  const last = R.lastActiveBefore(e, night(5));
  assert.equal(R.nightsBetween(last.night, night(5)), 2);
});
test('answered "Nothing / not sure" -> suggests a rest night', () => {
  const e = log([[3, 'skin', 'used', 'exfoliant'], [4, 'skin', 'unsure']]);
  assert.deepEqual(R.skinSuggestion(e, night(5)), { kind: 'rest' });
});
test('after unsure + rest night, alternation resumes from the last known active', () => {
  const e = log([[3, 'skin', 'used', 'exfoliant'], [4, 'skin', 'unsure'], [5, 'skin', 'skipped']]);
  assert.deepEqual(R.skinSuggestion(e, night(6)), { kind: 'product', slot: 'retinoid' });
});
test('no history at all -> suggests the BHA', () => {
  assert.deepEqual(R.skinSuggestion([], night(5)), { kind: 'product', slot: 'exfoliant' });
});

console.log('Opening the app');
test('last night has no entry -> asks about last night first', () => {
  const e = log([[3, 'skin', 'used', 'exfoliant']]);
  assert.equal(R.openingSheet(e, at(5, 21)), 'last-night');
});
test('a missing entry is never treated as a skip', () => {
  const e = log([[3, 'skin', 'used', 'exfoliant']]);
  assert.equal(R.skinEntryFor(e, night(4)), null);
  assert.equal(R.openingSheet(e, at(5, 21)), 'last-night');
});
test('during the day, still asks about a missing last night', () => {
  const e = log([[3, 'skin', 'used', 'exfoliant']]);
  assert.equal(R.openingSheet(e, at(5, 10)), 'last-night');
});
test('during the day with last night logged -> no sheet', () => {
  const e = log([[4, 'skin', 'used', 'exfoliant']]);
  assert.equal(R.openingSheet(e, at(5, 10)), null);
});
test('evening with last night logged -> tonight sheet', () => {
  const e = log([[4, 'skin', 'used', 'exfoliant']]);
  assert.equal(R.openingSheet(e, at(5, 19)), 'tonight');
});
test('3 am, home late -> still tonight sheet for the evening before', () => {
  const e = log([[4, 'skin', 'used', 'exfoliant']]);
  assert.equal(R.openingSheet(e, at(6, 3)), 'tonight');
});
test('tonight already logged -> no sheet', () => {
  const e = log([[4, 'skin', 'used', 'exfoliant'], [5, 'skin', 'used', 'retinoid']]);
  assert.equal(R.openingSheet(e, at(5, 23)), null);
});

console.log('Same active twice');
test('logging the same active as last time -> warning', () => {
  const e = log([[4, 'skin', 'used', 'exfoliant']]);
  assert.equal(R.repeatedActive(e, night(5), 'exfoliant').night, night(4));
  assert.equal(R.repeatedActive(e, night(5), 'retinoid'), null);
});
test('same active after a skipped night still warns', () => {
  const e = log([[3, 'skin', 'used', 'exfoliant'], [4, 'skin', 'skipped']]);
  assert.equal(R.repeatedActive(e, night(5), 'exfoliant').night, night(3));
});
test('adding a forgotten night checks the night after too', () => {
  const e = log([[3, 'skin', 'used', 'retinoid'], [5, 'skin', 'used', 'exfoliant']]);
  assert.equal(R.repeatedActive(e, night(4), 'exfoliant').night, night(5));
  assert.equal(R.repeatedActive(e, night(4), 'retinoid').night, night(3));
});
test('only one skincare entry per night', () => {
  const e = log([[5, 'skin', 'used', 'exfoliant']]);
  assert.throws(() => R.addEntry(e, { routine: 'skin', kind: 'skipped', night: night(5) }));
});
test('undo removes the entry', () => {
  const e = log([[5, 'skin', 'used', 'exfoliant']]);
  assert.deepEqual(R.removeEntry(e, e[0].id), []);
});

console.log('Hair masks');
test('fewer than 3 moisture masks since the last repair -> moisture', () => {
  const e = log([[1, 'hair', 'used', 'moisture'], [3, 'hair', 'used', 'moisture']]);
  const s = R.hairStatus(e, night(5));
  assert.equal(s.next, 'moisture');
  assert.equal(s.done, 2);
  assert.equal(s.lastNight, night(3));
});
test('3 moisture masks since the last repair -> repair', () => {
  const e = log([[1, 'hair', 'used', 'moisture'], [2, 'hair', 'used', 'moisture'], [3, 'hair', 'used', 'moisture']]);
  assert.equal(R.hairStatus(e, night(5)).next, 'protein');
});
test('logging the repair resets to 0 of 3', () => {
  const e = log([
    [1, 'hair', 'used', 'moisture'], [2, 'hair', 'used', 'moisture'],
    [3, 'hair', 'used', 'moisture'], [4, 'hair', 'used', 'protein'],
  ]);
  const s = R.hairStatus(e, night(5));
  assert.equal(s.next, 'moisture');
  assert.equal(s.done, 0);
});
test('a forgotten mask added to a past day updates the count', () => {
  let e = log([[1, 'hair', 'used', 'moisture'], [4, 'hair', 'used', 'moisture']]);
  e = R.addEntry(e, { routine: 'hair', kind: 'used', slot: 'moisture', night: night(2), now: at(5, 10), addedLater: true });
  assert.equal(R.hairStatus(e, night(5)).next, 'protein');
});
test('hair card is done for the day once logged', () => {
  const e = log([[5, 'hair', 'used', 'moisture']]);
  assert.equal(R.hairStatus(e, night(5)).doneOn, true);
  assert.equal(R.hairStatus(e, night(6)).doneOn, false);
});

console.log('Storage');
test('old log is converted, last entry per day wins', () => {
  const t = at(4, 22).getTime();
  const entries = R.migrateOldLog([
    { id: t, date: night(3), type: 'used-bha' },
    { id: t + 1, date: night(4), type: 'skipped' },
    { id: t + 2, date: night(4), type: 'used-retinoid' },
  ]);
  assert.equal(entries.length, 2);
  assert.equal(entries[0].slot, 'exfoliant');
  assert.equal(entries[1].slot, 'retinoid');
});
test('save and load round trip, with migration from the old key', () => {
  const store = {};
  const storage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = v; } };
  store[R.OLD_STORAGE_KEY] = JSON.stringify([{ id: at(4, 22).getTime(), date: night(4), type: 'used-bha' }]);
  const loaded = R.load(storage);
  assert.equal(loaded.length, 1);
  assert.ok(store[R.STORAGE_KEY], 'new key written');
  assert.ok(store[R.OLD_STORAGE_KEY], 'old key kept as backup');
  assert.deepEqual(R.load(storage), loaded);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
