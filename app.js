const STORAGE_KEY = 'routineTracker.skincare.log';

const PRODUCTS = {
  'used-bha': 'COSRX BHA Blackhead Power Liquid',
  'used-retinoid': 'Dr. Reju-All Advanced Retino-Mela serum',
};

const SHORT_NAMES = {
  'used-bha': 'COSRX BHA',
  'used-retinoid': 'Retinoid',
};

function pad(n) { return String(n).padStart(2, '0'); }

function todayStr(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function daysBetween(earlier, later) {
  const a = new Date(`${earlier}T00:00:00`);
  const b = new Date(`${later}T00:00:00`);
  return Math.round((b - a) / 86400000);
}

function relativeNights(dateStr) {
  const n = daysBetween(dateStr, todayStr());
  if (n <= 0) return 'today';
  if (n === 1) return 'yesterday';
  return `${n} nights ago`;
}

function loadLog() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLog(log) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(log));
}

function lastActiveEntry(log) {
  for (let i = log.length - 1; i >= 0; i--) {
    if (log[i].type === 'used-bha' || log[i].type === 'used-retinoid') {
      return log[i];
    }
  }
  return null;
}

function suggestTonight(log) {
  const last = lastActiveEntry(log);
  if (!last) return 'used-bha';
  return last.type === 'used-bha' ? 'used-retinoid' : 'used-bha';
}

function wouldRepeatLastEntry(log, type) {
  if (log.length === 0) return false;
  return log[log.length - 1].type === type;
}

function addEntry(type) {
  const log = loadLog();

  if ((type === 'used-bha' || type === 'used-retinoid') && wouldRepeatLastEntry(log, type)) {
    const ok = confirm(
      `You logged ${SHORT_NAMES[type]} last time too. Log it again tonight?`
    );
    if (!ok) return;
  }

  log.push({ id: Date.now(), date: todayStr(), type });
  saveLog(log);
  render();
}

function undoLast() {
  const log = loadLog();
  if (log.length === 0) return;
  if (!confirm('Undo the last entry?')) return;
  log.pop();
  saveLog(log);
  render();
}

function entryLabel(entry) {
  if (entry.type === 'skipped') return 'Skipped / rest night';
  return `Used ${SHORT_NAMES[entry.type]}`;
}

function render() {
  const log = loadLog();
  const suggestion = suggestTonight(log);
  const last = lastActiveEntry(log);

  document.getElementById('tonight-product').textContent = PRODUCTS[suggestion];

  document.getElementById('last-active').textContent = last
    ? `Last active: ${SHORT_NAMES[last.type]}, ${relativeNights(last.date)}`
    : 'No entries yet';

  document.getElementById('other-choices').classList.add('hidden');

  const list = document.getElementById('history-list');
  list.innerHTML = '';
  [...log].reverse().slice(0, 20).forEach((entry) => {
    const li = document.createElement('li');
    const dateSpan = document.createElement('span');
    dateSpan.className = 'date';
    dateSpan.textContent = entry.date;
    const labelSpan = document.createElement('span');
    labelSpan.textContent = entryLabel(entry);
    li.appendChild(labelSpan);
    li.appendChild(dateSpan);
    list.appendChild(li);
  });
}

document.getElementById('btn-used').addEventListener('click', () => {
  addEntry(suggestTonight(loadLog()));
});

document.getElementById('btn-skipped').addEventListener('click', () => {
  addEntry('skipped');
});

document.getElementById('btn-other-toggle').addEventListener('click', () => {
  document.getElementById('other-choices').classList.toggle('hidden');
});

document.querySelectorAll('.choice').forEach((btn) => {
  btn.addEventListener('click', () => addEntry(btn.dataset.type));
});

document.getElementById('btn-undo').addEventListener('click', undoLast);

render();
