# RSVP Web Reader

A speed-reading website that flashes text one word at a time in a fixed spot,
with each word's Optimal Recognition Point letter highlighted, so your eyes
never have to move.

It is the website version of
[RSVP Desktop Reader](https://github.com/QuiteNew/rsvp-desktop-reader), and it
is being built step by step from that app's logic.

**Status:** early. At https://quitenew.github.io/rsvp-web-reader/ you can
paste a text and read it, with speed, pause, skip and restart. Nothing is
saved yet.
See [docs/STATUS.md](docs/STATUS.md) for what is done and what is next.

## What it promises

- Everything stays in your browser. There is no server, no account and no
  tracking, and nothing you paste is sent anywhere.
- It works offline once it has loaded (planned, not built yet).

## Working on it

You need [Node.js](https://nodejs.org/) 24 and npm.

```bash
npm ci            # install the exact versions from package-lock.json
npm run dev       # start the dev server, then open the address it prints
npm run check     # lint, formatting, types, tests and a production build
```

The browser tests run the built site in Chromium, Firefox and WebKit. They
are separate from `npm run check` because they need the browsers, which are
a one-time download of a few hundred megabytes:

```bash
npx playwright install   # once, and again after Playwright is updated
npm run e2e              # builds the site, then runs the browser tests
```

The single steps behind `npm run check`:

| Command                | What it does                                 |
| ---------------------- | -------------------------------------------- |
| `npm run lint`         | ESLint, including the layer rule below       |
| `npm run format:check` | Prettier, without changing files             |
| `npm run format`       | Prettier, fixing files                       |
| `npm run typecheck`    | TypeScript, strict                           |
| `npm test`             | Vitest, once                                 |
| `npm run test:watch`   | Vitest, re-running on every save             |
| `npm run build`        | Type-check, then build the site into `dist/` |
| `npm run preview`      | Serve `dist/` the way GitHub Pages will      |

## How the code is laid out

```
src/
  core/    pure TypeScript. No DOM, no React, no timers, no storage.
  engine/  the reading loop: the clock and the timer, built on core/.
  store/   saved data, behind small interfaces.
  ui/      React components. The only layer that may import the others.
```

`core` never imports from the other layers. ESLint and a separate TypeScript
check enforce that, so a wrong import fails before it is merged.
[WEB_PORT_BRIEF.md](WEB_PORT_BRIEF.md) explains the plan and the reasons.

## License

Released under the MIT License. See [LICENSE](LICENSE).
