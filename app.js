// Home screen: date strip, Track and History. Rules and storage live in rules.js.
const R = window.Rules;

const state = {
  entries: R.load(),
  selected: null, // night string; null means today
};

function today() {
  return R.nightOf(new Date());
}

function selectedNight() {
  return state.selected || today();
}

function setEntries(entries) {
  state.entries = entries;
  try {
    R.save(entries);
  } catch (err) {
    console.error(err);
    alert('Could not save on this phone. The entry is shown but may be lost when the app closes.');
  }
  render();
}

// Ask the browser not to clear the log when the phone is low on space.
navigator.storage?.persist?.().catch(() => {});

// ---------- Formatting ----------

const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function dayTitle(night) {
  const d = R.parseNight(night);
  const month = d.toLocaleDateString('en-US', { month: 'long' });
  const prefix = night === today()
    ? 'Today'
    : d.toLocaleDateString('en-US', { weekday: 'long' });
  return `${prefix}, ${d.getDate()} of ${month}`;
}

function shortDate(night) {
  return R.parseNight(night).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function timeOf(entry) {
  if (entry.addedLater) return 'Added later';
  const d = new Date(entry.loggedAt);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function entryText(entry) {
  if (entry.kind === 'skipped') return 'Skipped / rest night';
  if (entry.kind === 'unsure') return 'Nothing / not sure';
  return entry.product;
}

// Small helper for building elements without innerHTML.
function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  Object.assign(node, props);
  for (const child of [].concat(children)) {
    if (child != null) node.append(child);
  }
  return node;
}

// ---------- Date strip ----------

// Monday of the week that contains `night`.
function weekStart(night) {
  const offset = (R.parseNight(night).getDay() + 6) % 7;
  return R.addDays(night, -offset);
}

// Markers for a day: one per skincare product used, one for a hair mask.
// Skipped and unsure nights get none.
function markersFor(entries) {
  const marks = [];
  const skin = entries.find((e) => e.routine === 'skin' && e.kind === 'used');
  if (skin) marks.push(skin.slot);
  if (entries.some((e) => e.routine === 'hair')) marks.push('hair');
  return marks;
}

// How far back the strip goes: at least 8 weeks, or to the first entry.
const MIN_WEEKS_BACK = 8;

function renderStrip() {
  const scroller = document.getElementById('weeks');
  const now = today();
  const thisWeek = weekStart(now);
  const earliest = state.entries.reduce((min, e) => (e.night < min ? e.night : min), R.addDays(now, -7 * MIN_WEEKS_BACK));

  const weeks = [];
  for (let w = weekStart(earliest); w <= thisWeek; w = R.addDays(w, 7)) {
    weeks.push(renderWeek(w, now));
  }
  scroller.replaceChildren(...weeks);

  // Show the week that holds the selected day.
  const index = weeks.findIndex((w) => w.dataset.start === weekStart(selectedNight()));
  scroller.scrollLeft = index * scroller.clientWidth;
}

function renderWeek(start, now) {
  const container = el('div', { className: 'week' });
  container.dataset.start = start;

  for (let i = 0; i < 7; i++) {
    const night = R.addDays(start, i);
    const d = R.parseNight(night);
    const entries = R.entriesForNight(state.entries, night);
    const logged = entries.length > 0;

    const btn = el('button', {
      className: 'day',
      type: 'button',
      disabled: night > now,
    }, [
      el('span', { className: 'letter', textContent: DAY_LETTERS[d.getDay()] }),
      el('span', { className: 'num', textContent: d.getDate() }),
      el('span', { className: 'marks' },
        markersFor(entries).map((m) => el('i', { className: `mark ${m}` }))),
    ]);
    btn.classList.toggle('selected', night === selectedNight());
    btn.classList.toggle('logged', logged);
    btn.setAttribute('aria-label', dayTitle(night));
    if (night === selectedNight()) btn.setAttribute('aria-current', 'date');
    btn.addEventListener('click', () => {
      state.selected = night === now ? null : night;
      render();
    });
    container.append(btn);
  }
  return container;
}

// ---------- Track ----------

function renderTrack() {
  const section = document.getElementById('track');
  const container = document.getElementById('track-cards');
  container.replaceChildren();

  // Track is only for today, and only holds the hair mask.
  const night = selectedNight();
  const hair = R.hairStatus(state.entries, night);
  const show = night === today() && !hair.doneOn;
  section.hidden = !show;
  if (!show) return;

  const next = R.SLOTS[hair.next];
  const progress = hair.lastNight
    ? `${hair.done} of ${hair.of} done · last one ${shortDate(hair.lastNight)}`
    : 'No masks logged yet';

  const add = el('button', { className: 'add', type: 'button', textContent: '+' });
  add.setAttribute('aria-label', 'Log a hair mask');
  add.addEventListener('click', () => showHair(night));

  container.append(el('article', { className: 'card hair-track' }, [
    el('div', { className: 'card-head' }, [el('h3', { textContent: 'Haircare' }), add]),
    el('p', { textContent: `Next: ${next.product}` }),
    el('p', { className: 'meta', textContent: progress }),
  ]));
}

// ---------- History ----------

function renderHistory() {
  const container = document.getElementById('history-cards');
  const night = selectedNight();
  const entries = R.entriesForNight(state.entries, night);
  container.replaceChildren();

  // Past days can be filled in afterwards.
  document.getElementById('add-forgot').hidden = night === today();

  if (!entries.length) {
    container.append(el('p', {
      className: 'empty',
      textContent: night === today() ? 'Nothing logged yet today.' : 'Nothing logged this day.',
    }));
    return;
  }

  // Skincare first, then hair, matching the mockups.
  entries.sort((a, b) => (a.routine === b.routine ? 0 : a.routine === 'skin' ? -1 : 1));

  for (const entry of entries) {
    const head = el('div', { className: 'card-head' }, [
      el('h3', { textContent: entry.routine === 'skin' ? 'Skincare' : 'Haircare' }),
    ]);
    // Undo works for anything logged today, and for anything added later
    // (including the answer to "What did you use last night?").
    if (night === today() || entry.addedLater) {
      const undo = el('button', { className: 'undo', type: 'button', textContent: 'Undo' });
      undo.addEventListener('click', () => setEntries(R.removeEntry(state.entries, entry.id)));
      head.append(undo);
    }
    container.append(el('article', { className: 'card' }, [
      head,
      el('p', { textContent: timeOf(entry) }),
      el('p', { textContent: entryText(entry) }),
    ]));
  }
}

// ---------- Sheet ----------
// One layout reused for: the last-night question, tonight's skincare,
// logging a hair mask, and the same-active warning.

const sheetEl = document.getElementById('sheet');

function isSheetOpen() {
  return sheetEl.classList.contains('open');
}

// buttons: [{ text, style: 'primary' | 'quiet' | undefined, onClick }]
function showSheet({ label, title, sub = '', hint = '', buttons }) {
  document.getElementById('sheet-label').textContent = label;
  document.getElementById('sheet-title').textContent = title;
  document.getElementById('sheet-sub').textContent = sub;
  document.getElementById('sheet-hint').textContent = hint;

  const actions = document.getElementById('sheet-actions');
  actions.replaceChildren(...buttons.map(({ text, style, onClick }) => {
    const btn = el('button', { type: 'button', textContent: text, className: style || '' });
    btn.addEventListener('click', onClick);
    return btn;
  }));

  sheetEl.classList.add('open');
  sheetEl.setAttribute('aria-hidden', 'false');
}

function closeSheet() {
  sheetEl.classList.remove('open');
  sheetEl.setAttribute('aria-hidden', 'true');
}

sheetEl.querySelector('[data-close]').addEventListener('click', closeSheet);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && isSheetOpen()) closeSheet();
});

// ---------- Skincare flows ----------

// How products are called in sentences ("You used the serum last night too").
const CALLED = { exfoliant: 'COSRX BHA', retinoid: 'serum' };

function otherSkin(slot) {
  return slot === 'exfoliant' ? 'retinoid' : 'exfoliant';
}

function logAndClose(fields) {
  closeSheet();
  setEntries(R.addEntry(state.entries, { now: new Date(), ...fields }));
}

function lastActiveText(night) {
  const last = R.lastActiveBefore(state.entries, night);
  if (!last) return 'No actives logged yet';
  const n = R.nightsBetween(last.night, night);
  const when = n === 1 ? 'yesterday' : `${n} nights ago`;
  return `Last active: ${R.SLOTS[last.slot].short}, ${when}`;
}

// State A: last night has no entry, so ask before suggesting anything.
// The answer is a fact about the past, so it's saved without a warning.
function showLastNight() {
  const night = R.addDays(today(), -1);
  const answer = (kind, slot) => () => {
    setEntries(R.addEntry(state.entries, {
      routine: 'skin', kind, slot, night, now: new Date(), addedLater: true,
    }));
    const now = new Date();
    if (R.isEvening(now) && !R.skinEntryFor(state.entries, today())) showTonight();
    else closeSheet();
  };
  showSheet({
    label: 'Last night',
    title: 'What did you use last night?',
    buttons: [
      { text: R.SLOTS.retinoid.short, onClick: answer('used', 'retinoid') },
      { text: R.SLOTS.exfoliant.short, onClick: answer('used', 'exfoliant') },
      { text: 'Nothing / not sure', onClick: answer('unsure', null) },
    ],
  });
}

// State B: tonight's skincare.
function showTonight() {
  const night = today();
  const suggestion = R.skinSuggestion(state.entries, night);
  const skip = { text: 'Skipped / rest night', onClick: () => logAndClose({ routine: 'skin', kind: 'skipped', night }) };

  if (suggestion.kind === 'rest') {
    showSheet({
      label: 'Tonight',
      title: 'Rest night',
      sub: `You weren't sure about last night, so a rest night is the safe choice. ${lastActiveText(night)}.`,
      buttons: [
        { ...skip, style: 'primary' },
        { text: 'Used something else', onClick: () => showOtherSkin(night, ['retinoid', 'exfoliant']) },
      ],
    });
    return;
  }

  showSheet({
    label: 'Tonight',
    title: R.SLOTS[suggestion.slot].product,
    sub: lastActiveText(night),
    buttons: [
      { text: 'Used it', style: 'primary', onClick: () => logSkinProduct(night, suggestion.slot) },
      skip,
      { text: 'Used something else', onClick: () => showOtherSkin(night, [otherSkin(suggestion.slot)]) },
    ],
  });
}

function showOtherSkin(night, slots) {
  showSheet({
    label: 'Tonight',
    title: 'Used something else',
    hint: 'Which one did you actually use?',
    buttons: [
      ...slots.map((slot) => ({ text: R.SLOTS[slot].product, onClick: () => logSkinProduct(night, slot) })),
      { text: 'Back', style: 'quiet', onClick: showTonight },
    ],
  });
}

// Logs a product, or warns first if it repeats the nearest active (state D).
// For a past day (addedLater), `back` returns to the choice.
function logSkinProduct(night, slot, { addedLater = false, back = null } = {}) {
  const log = (s) => () => logAndClose({ routine: 'skin', kind: 'used', slot: s, night, addedLater });
  const repeat = R.repeatedActive(state.entries, night, slot);
  if (!repeat) {
    log(slot)();
    return;
  }
  const n = Math.abs(R.nightsBetween(repeat.night, night));
  const isTonight = night === today();
  const when = repeat.night < night
    ? (n === 1 ? (isTonight ? 'last night' : 'the night before') : `${n} nights ${isTonight ? 'ago' : 'before'}`)
    : (n === 1 ? 'the night after' : `${n} nights later`);
  const other = otherSkin(slot);

  if (addedLater) {
    // It already happened, so the question is only "is this right?"
    showSheet({
      label: 'Heads up',
      title: `You used the ${CALLED[slot]} ${when} too`,
      sub: 'Check this is right before saving.',
      buttons: [
        { text: 'Log it anyway', style: 'primary', onClick: log(slot) },
        { text: 'Choose again', onClick: back },
      ],
    });
    return;
  }

  showSheet({
    label: 'Heads up',
    title: `You used the ${CALLED[slot]} ${when} too`,
    sub: 'Keep the BHA and the retinoid on separate nights so your skin doesn\'t get irritated.',
    buttons: [
      { text: `Use the ${CALLED[other]} instead`, style: 'primary', onClick: () => logAndClose({ routine: 'skin', kind: 'used', slot: other, night }) },
      { text: 'Log it anyway', onClick: () => logAndClose({ routine: 'skin', kind: 'used', slot, night }) },
    ],
  });
}

// ---------- Hair flow ----------

// State C: logging a hair mask from the Track card.
function showHair(night) {
  const hair = R.hairStatus(state.entries, night);
  const other = hair.next === 'protein' ? 'moisture' : 'protein';
  const log = (slot) => () => logAndClose({ routine: 'hair', kind: 'used', slot, night });
  const progress = hair.lastNight
    ? `${hair.done} of ${hair.of} done · last one ${shortDate(hair.lastNight)}`
    : 'No masks logged yet';

  showSheet({
    label: 'Hair mask',
    title: R.SLOTS[hair.next].product,
    sub: progress,
    buttons: [
      { text: 'Used it', style: 'primary', onClick: log(hair.next) },
      {
        text: 'Used something else',
        onClick: () => showSheet({
          label: 'Hair mask',
          title: 'Used something else',
          hint: 'Which one did you actually use?',
          buttons: [
            { text: R.SLOTS[other].product, onClick: log(other) },
            { text: 'Back', style: 'quiet', onClick: () => showHair(night) },
          ],
        }),
      },
    ],
  });
}

// ---------- Adding something forgotten to a past day ----------

function dayLabel(night) {
  return R.parseNight(night).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function showAddForgot(night) {
  const buttons = [];
  // One skincare entry per night: undo the existing one to change it.
  if (!R.skinEntryFor(state.entries, night)) {
    buttons.push({ text: 'Skincare', onClick: () => showForgotSkin(night) });
  }
  buttons.push({ text: 'Hair mask', onClick: () => showForgotHair(night) });
  buttons.push({ text: 'Cancel', style: 'quiet', onClick: closeSheet });
  showSheet({ label: dayLabel(night), title: 'What did you forget to log?', buttons });
}

function showForgotSkin(night) {
  const back = () => showForgotSkin(night);
  showSheet({
    label: dayLabel(night),
    title: 'Skincare',
    hint: 'What did you use that night?',
    buttons: [
      ...['retinoid', 'exfoliant'].map((slot) => ({
        text: R.SLOTS[slot].product,
        onClick: () => logSkinProduct(night, slot, { addedLater: true, back }),
      })),
      { text: 'Skipped / rest night', onClick: () => logAndClose({ routine: 'skin', kind: 'skipped', night, addedLater: true }) },
      { text: 'Back', style: 'quiet', onClick: () => showAddForgot(night) },
    ],
  });
}

function showForgotHair(night) {
  showSheet({
    label: dayLabel(night),
    title: 'Hair mask',
    hint: 'Which one did you use?',
    buttons: [
      ...['moisture', 'protein'].map((slot) => ({
        text: R.SLOTS[slot].product,
        onClick: () => logAndClose({ routine: 'hair', kind: 'used', slot, night, addedLater: true }),
      })),
      { text: 'Back', style: 'quiet', onClick: () => showAddForgot(night) },
    ],
  });
}

document.getElementById('add-forgot').addEventListener('click', () => showAddForgot(selectedNight()));

document.getElementById('go-today').addEventListener('click', () => {
  state.selected = null;
  render();
});

// ---------- Opening the app ----------

function checkOpeningSheet() {
  if (isSheetOpen()) return;
  const which = R.openingSheet(state.entries, new Date());
  if (which === 'last-night') showLastNight();
  else if (which === 'tonight') showTonight();
}

// ---------- Render ----------

function render() {
  document.getElementById('day-title').textContent = dayTitle(selectedNight());
  document.getElementById('go-today').hidden = selectedNight() === today();
  renderStrip();
  renderTrack();
  renderHistory();
}

// Coming back to the app counts as opening it: move "today" forward if it's
// past 4 am, and show the right sheet.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  state.entries = R.load();
  render();
  checkOpeningSheet();
});

render();
checkOpeningSheet();
