# Routine Tracker

A small web app for the iPhone home screen that answers one question: what do I use tonight?
It tracks two rotations, alternating skincare actives and a 3:1 hair mask cycle, and decides
from what was logged last, never from the date. Everything is saved on the phone.

## Files

| File | What it does |
|---|---|
| `index.html` | Page structure: header, date strip, Track, History, bottom sheet |
| `style.css` | Dark theme and layout |
| `rules.js` | Rotation rules and saving (no screen code, so it can be tested) |
| `app.js` | Screens and the sheet flows |
| `service-worker.js` | Offline support; loads fresh files first so updates reach the phone |
| `tests/rules.test.js` | Checks every rule from the product brief |

## Changing products

Edit `SLOTS` at the top of `rules.js`. The rules work on slots (exfoliant, retinoid,
moisture, protein), so changing a name never changes the rotation, and past entries keep
the name they were logged with. The hair ratio is `MOISTURE_PER_PROTEIN`.

## Key rules

- A night ends at 4:00 am. Anything logged before 4 am counts for the evening before.
- Tonight's skincare sheet opens only from 7 pm to 4 am.
- If last night has no skincare entry, the app asks about it first, at any time of day.
  A missing entry is never treated as a skip.

## Running the checks

```
node tests/rules.test.js
```

## Putting it on the iPhone

The app has to be served over HTTPS (for example GitHub Pages or Netlify). Open the URL in
Safari, then Share → Add to Home Screen. After changing files, open the app once while
online and the new version loads.
