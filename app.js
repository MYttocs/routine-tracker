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
  R.save(entries);
  render();
}

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

function renderWeek() {
  const container = document.getElementById('week');
  const start = weekStart(selectedNight());
  const now = today();
  container.replaceChildren();

  for (let i = 0; i < 7; i++) {
    const night = R.addDays(start, i);
    const d = R.parseNight(night);
    const logged = R.entriesForNight(state.entries, night).length > 0;

    const btn = el('button', {
      className: 'day',
      type: 'button',
      disabled: night > now,
    }, [
      el('span', { className: 'letter', textContent: DAY_LETTERS[d.getDay()] }),
      el('span', { className: 'num', textContent: d.getDate() }),
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

  // For now + logs the suggested mask directly; step 3 opens the sheet instead.
  const add = el('button', { className: 'add', type: 'button', textContent: '+' });
  add.setAttribute('aria-label', `Log ${next.product}`);
  add.addEventListener('click', () => {
    setEntries(R.addEntry(state.entries, {
      routine: 'hair', kind: 'used', slot: hair.next, night, now: new Date(),
    }));
  });

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
    if (night === today()) {
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

// ---------- Render ----------

function render() {
  document.getElementById('day-title').textContent = dayTitle(selectedNight());
  renderWeek();
  renderTrack();
  renderHistory();
}

// If the app stays open past 4 am, move "today" forward when it's shown again.
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) render();
});

render();
