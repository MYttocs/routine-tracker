// Data and rotation rules for Routine Tracker.
// Pure functions only (no DOM), so they can be tested with Node:
//   node tests/rules.test.js
// In the browser this file defines a global `Rules`.

(function (root) {
  // A "night" runs from 4:00 am to 3:59 am the next day, so logging at
  // 3 am after a late night still counts for the evening before.
  const NIGHT_END_HOUR = 4;
  // Tonight's skincare sheet only opens between 7 pm and 4 am.
  const EVENING_START_HOUR = 19;

  const STORAGE_KEY = 'routineTracker.v2';
  const OLD_STORAGE_KEY = 'routineTracker.skincare.log';

  // Rules work on slots; product names are labels and can change freely.
  const SLOTS = {
    exfoliant: { routine: 'skin', product: 'COSRX BHA Blackhead Power Liquid', short: 'COSRX BHA' },
    retinoid: { routine: 'skin', product: 'Dr. Reju-All Advanced Retino-Mela serum', short: 'Retino-Mela serum' },
    moisture: { routine: 'hair', product: 'Garnier Fructis Hair Food Avocado Mask', short: 'Avocado mask' },
    protein: { routine: 'hair', product: 'Yellow Reparative Mask', short: 'Reparative mask' },
  };

  const MOISTURE_PER_PROTEIN = 3;

  // ---------- Dates and nights ----------

  function pad(n) { return String(n).padStart(2, '0'); }

  function dateStr(d) {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function parseNight(night) {
    const [y, m, d] = night.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  // Which night a moment belongs to: before 4 am counts as the previous day.
  function nightOf(now) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (now.getHours() < NIGHT_END_HOUR) d.setDate(d.getDate() - 1);
    return dateStr(d);
  }

  function addDays(night, n) {
    const d = parseNight(night);
    d.setDate(d.getDate() + n);
    return dateStr(d);
  }

  function nightsBetween(earlier, later) {
    const [a, b] = [earlier, later].map((s) => {
      const [y, m, d] = s.split('-').map(Number);
      return Date.UTC(y, m - 1, d);
    });
    return Math.round((b - a) / 86400000);
  }

  function isEvening(now) {
    const h = now.getHours();
    return h >= EVENING_START_HOUR || h < NIGHT_END_HOUR;
  }

  // ---------- Entries ----------
  // {
  //   id, night: 'YYYY-MM-DD', routine: 'skin' | 'hair',
  //   kind: 'used' | 'skipped' | 'unsure',
  //   slot: 'exfoliant' | 'retinoid' | 'moisture' | 'protein' | null,
  //   product: name at the time of logging (null unless kind is 'used'),
  //   loggedAt: ISO string, addedLater: boolean
  // }
  // "Skipped" is a saved entry. "No entry" is the absence of one and is
  // never treated as a skip. "Nothing / not sure" is saved as 'unsure'.

  function newId() {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  }

  function byTime(a, b) {
    if (a.night !== b.night) return a.night < b.night ? -1 : 1;
    return a.loggedAt < b.loggedAt ? -1 : a.loggedAt > b.loggedAt ? 1 : 0;
  }

  function sorted(entries) {
    return [...entries].sort(byTime);
  }

  function entriesForNight(entries, night) {
    return sorted(entries).filter((e) => e.night === night);
  }

  function skinEntryFor(entries, night) {
    return entries.find((e) => e.routine === 'skin' && e.night === night) || null;
  }

  function hairEntriesFor(entries, night) {
    return entriesForNight(entries, night).filter((e) => e.routine === 'hair');
  }

  // Returns a new array with the entry added. Throws if the entry is invalid
  // or if that night already has a skincare entry (undo it first).
  function addEntry(entries, { routine, kind, slot = null, night, now = new Date(), addedLater = false }) {
    if (routine !== 'skin' && routine !== 'hair') throw new Error(`Unknown routine: ${routine}`);
    if (!['used', 'skipped', 'unsure'].includes(kind)) throw new Error(`Unknown kind: ${kind}`);
    if (routine === 'hair' && kind !== 'used') throw new Error('Hair entries are always "used"');
    if (kind === 'used') {
      if (!SLOTS[slot] || SLOTS[slot].routine !== routine) throw new Error(`Slot ${slot} is not a ${routine} slot`);
    } else {
      slot = null;
    }
    if (routine === 'skin' && skinEntryFor(entries, night)) {
      throw new Error(`Night ${night} already has a skincare entry`);
    }
    const entry = {
      id: newId(),
      night,
      routine,
      kind,
      slot,
      product: kind === 'used' ? SLOTS[slot].product : null,
      loggedAt: now.toISOString(),
      addedLater,
    };
    return sorted([...entries, entry]);
  }

  function removeEntry(entries, id) {
    return entries.filter((e) => e.id !== id);
  }

  // ---------- Skincare rules ----------

  function otherSkinSlot(slot) {
    return slot === 'exfoliant' ? 'retinoid' : 'exfoliant';
  }

  // Most recent skincare product actually used before `night`.
  // Skipped and unsure nights are ignored here.
  function lastActiveBefore(entries, night) {
    const used = sorted(entries).filter(
      (e) => e.routine === 'skin' && e.kind === 'used' && e.night < night
    );
    return used.length ? used[used.length - 1] : null;
  }

  // What to suggest for `night`:
  //   { kind: 'rest' }               after "Nothing / not sure" last night
  //   { kind: 'product', slot }      otherwise, alternating from the last used
  function skinSuggestion(entries, night) {
    const lastNight = skinEntryFor(entries, addDays(night, -1));
    if (lastNight && lastNight.kind === 'unsure') return { kind: 'rest' };
    const last = lastActiveBefore(entries, night);
    return { kind: 'product', slot: last ? otherSkinSlot(last.slot) : 'exfoliant' };
  }

  // Which sheet to show when the app opens, or null for none.
  //   'last-night'  last night has no skincare entry (any time of day)
  //   'tonight'     it's 7 pm–4 am and tonight isn't logged yet
  function openingSheet(entries, now) {
    const tonight = nightOf(now);
    if (!skinEntryFor(entries, addDays(tonight, -1))) return 'last-night';
    if (isEvening(now) && !skinEntryFor(entries, tonight)) return 'tonight';
    return null;
  }

  // If logging `slot` on `night` would repeat the nearest active before or
  // after it, returns that entry (so the sheet can warn). Otherwise null.
  function repeatedActive(entries, night, slot) {
    const used = sorted(entries).filter(
      (e) => e.routine === 'skin' && e.kind === 'used' && e.night !== night
    );
    const before = [...used].reverse().find((e) => e.night < night);
    const after = used.find((e) => e.night > night);
    if (before && before.slot === slot) return before;
    if (after && after.slot === slot) return after;
    return null;
  }

  // ---------- Hair rules ----------

  // { next, done, of, lastNight, doneOn }
  //   next: slot to suggest; done: moisture masks since the last repair
  //   (capped at 3 for display); lastNight: night of the most recent mask.
  function hairStatus(entries, night) {
    const hair = sorted(entries).filter((e) => e.routine === 'hair' && e.kind === 'used');
    let count = 0;
    for (const e of hair) count = e.slot === 'protein' ? 0 : count + 1;
    const last = hair.length ? hair[hair.length - 1] : null;
    return {
      next: count >= MOISTURE_PER_PROTEIN ? 'protein' : 'moisture',
      done: Math.min(count, MOISTURE_PER_PROTEIN),
      of: MOISTURE_PER_PROTEIN,
      lastNight: last ? last.night : null,
      doneOn: hairEntriesFor(entries, night).length > 0,
    };
  }

  // ---------- Storage ----------

  // Converts the first version's log ({ id, date, type }) to entries.
  // The old app allowed several entries per day; the last one per day wins.
  function migrateOldLog(oldLog) {
    const map = { 'used-bha': 'exfoliant', 'used-retinoid': 'retinoid' };
    const perNight = new Map();
    for (const old of oldLog) {
      const slot = map[old.type] || null;
      if (!slot && old.type !== 'skipped') continue;
      perNight.set(old.date, {
        id: `old-${old.id}`,
        night: old.date,
        routine: 'skin',
        kind: slot ? 'used' : 'skipped',
        slot,
        product: slot ? SLOTS[slot].product : null,
        loggedAt: new Date(old.id).toISOString(),
        addedLater: false,
      });
    }
    return sorted([...perNight.values()]);
  }

  function load(storage = root.localStorage) {
    try {
      const raw = storage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw).entries || [];
      const oldRaw = storage.getItem(OLD_STORAGE_KEY);
      if (oldRaw) {
        // The old key is left in place as a backup.
        const entries = migrateOldLog(JSON.parse(oldRaw));
        save(entries, storage);
        return entries;
      }
    } catch (err) {
      console.error('Could not read saved entries', err);
    }
    return [];
  }

  function save(entries, storage = root.localStorage) {
    storage.setItem(STORAGE_KEY, JSON.stringify({ version: 2, entries }));
  }

  const Rules = {
    NIGHT_END_HOUR, EVENING_START_HOUR, STORAGE_KEY, OLD_STORAGE_KEY,
    SLOTS, MOISTURE_PER_PROTEIN,
    nightOf, addDays, nightsBetween, isEvening, parseNight, dateStr,
    entriesForNight, skinEntryFor, hairEntriesFor, addEntry, removeEntry,
    lastActiveBefore, skinSuggestion, openingSheet, repeatedActive,
    hairStatus, migrateOldLog, load, save,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Rules;
  else root.Rules = Rules;
})(typeof globalThis !== 'undefined' ? globalThis : this);
