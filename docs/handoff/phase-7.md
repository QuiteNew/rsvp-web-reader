# Phase 7: offline and polish

Install and offline use, accessibility, browser checks, a help page, and
the first real release, `v1.0.0`.

## Ask the owner first

- Whether to move to a custom domain before the release. The base path
  changes with it, so decide before the service worker ships.
- What the help page should say, and which desktop docs to carry over.

## Offline and install

- A service worker that caches the built site, so it opens with the
  network cut. The brief names `vite-plugin-pwa`. Check that its current
  version supports the Vite version in use before installing it.
- The manifest's scope and start address must match the Vite `base`
  (`/rsvp-web-reader/` today).
- Updates: a new version must not get stuck behind an old cache. Decide
  with the owner between updating quietly on the next visit and showing a
  "new version" notice.
- Playwright: load once, go offline, reload, paste a text, read.
- Install works in Chromium browsers and in Safari. Check the state of
  Firefox at that time and say what was found.

## Accessibility

- The flashing word is kept out of screen reader announcements, and there
  is a plain text view of the same transcript.
- Everything works by keyboard, focus is always visible, and every control
  has a name.
- `prefers-reduced-motion` is respected.
- A clear note for people with a seizure or photosensitivity condition,
  shown before the first flashing text. Read what the desktop `docs/faq.md`
  and `docs/technique.md` already say first, and show the wording to the
  owner.
- Run an automated accessibility check in Playwright, and say what it can
  not find.

## Browser checks

Chromium, Firefox and WebKit in Playwright, plus a real phone by hand:
timing with the tab in the background, storage after a restart, sound, and
copying with bold.

## Housekeeping

- The release guard from the desktop pipeline: a release starts only from
  a pushed version tag, the tag equals `APP_VERSION`, and the tagged commit
  is on `main`. Add the test that fails when the version falls behind the
  newest tag.
- CI: cancel older runs on a new push, skip runs for docs-only changes,
  build the site on pull requests.
- The 7 moderate `npm audit` findings noted in STATUS.md: look at each,
  and say which matter for a static site.
- No analytics, no outside requests. A Playwright test that fails on any
  request to another origin.
- The licences: MIT for the code, SIL OFL texts with the fonts.

## Done when

The site installs, reads offline, passes the checks in three browsers, and
the owner has tagged `v1.0.0`.
