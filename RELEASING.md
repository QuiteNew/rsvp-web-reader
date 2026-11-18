# Releasing

How a release of RSVP Web Reader gets made, from the last commit to the
published release. It is written to be followed cold, without having to
remember how it went last time.

## What a release is here

The site itself is not released by a tag. Every push to `main` that passes CI
is published to GitHub Pages by the CI workflow. A release is the tag
`vMAJOR.MINOR.PATCH` on one commit of `main`, plus a GitHub release page that
says what changed. It marks a version people can name.

That means the version number shown in Settings (on the Data tab) changes when
the commit that bumps it reaches `main`, a little before the tag exists.

## Version numbers

The first release is `v1.0.0`. After that a new feature bumps the minor number
(v1.1.0) and a fix on its own bumps the patch number (v1.0.1).

The version lives in two places that are changed by hand and must agree:
`APP_VERSION` in `src/core/appInfo.ts`, which is what the page shows, and
`version` in `package.json` (with its twin in `package-lock.json`). Nothing
reads it from the git tag. That is why the checklist below has a step for it,
and why two tests in `src/core/appInfo.test.ts` fail: one when the two places
differ, and one when a release tag is newer than the number written there.

## Checklist

1. **Finish the work.** Everything for the release is committed and
   `git status` is clean.

2. **Run the checks on your own machine.** From the project folder:

   ```
   npm run check
   npm run e2e
   ```

   `npm run check` is lint, formatting, types, the unit tests and a build.
   `npm run e2e` builds the site and runs the browser tests in Chromium,
   Firefox and WebKit, which the everyday CI run does not do. Every test should
   pass. It needs `npx playwright install` once, and again after Playwright is
   updated.

3. **Make the docs commits.** Update the docs the release touches. Then, in
   the last commit, update the README (features, roadmap), this file if the
   steps changed, and bump the version: change `APP_VERSION` in
   `src/core/appInfo.ts`, then run

   ```
   npm version X.Y.Z --no-git-tag-version
   ```

   which changes `package.json` and `package-lock.json` and leaves git alone.
   That last commit is the one that gets tagged, and the version bump is the
   last edit in it.

4. **Get it onto `main` and wait.** Push. Open the Actions tab and wait for
   **CI** to go green on `main`, which includes the Pages deploy. Then open
   the live site, open Settings, then the Data tab, and check the version at
   the bottom. Don't tag before all of that.

5. **Optional dry run.** Go to Actions, then Release, then Run workflow, on
   `main`. There is nothing to tick. A run started by hand never makes a
   release, only a pushed tag does. It runs the same checks as step 2 on
   GitHub's machines, browser tests included, which is worth doing before
   the first tag, because it shows whether the browser tests behave there.

6. **Tag and push the tag.** The tag goes on the tip of `main`:

   ```
   git tag vX.Y.Z
   git push origin vX.Y.Z
   ```

   The first thing the workflow does is look at the tag. It fails within
   seconds, before anything slow starts, if the tag doesn't match the version
   in `src/core/appInfo.ts` and `package.json`, or if the tagged commit isn't
   on `main`.

7. **Watch the Release workflow.** In order, it checks the tag, then runs the
   checks and the browser tests at the same time. Only when both pass does it
   create a draft release. If a check fails, nothing is released.

8. **Fill in the draft.** Under Releases, open the draft, set the title and
   description (see below), and publish.

## Release notes

The title is `vX.Y.Z - a short name for the main change`, for example
`v1.0.0 - the first release`.

The description has a section for what is new (one heading per feature if
there are several), an "Under the hood" section for changes nobody sees, and a
"Using it" section:

```
## What is new
What it does, in plain words, from the point of view of someone using the site.

## Under the hood
Tests, refactors, tooling. Leave this out if there is nothing to say.

## Using it
Open https://quitenew.github.io/rsvp-web-reader/ in a current desktop browser. Nothing is installed and nothing leaves your browser.
```

Say plainly what does not work yet, so the notes never promise more than the
site does.

## When something goes wrong

**The tag check fails.** The run stops in the first job, within seconds. The
message says which of the two it is: the tag doesn't match the version (the
bump was forgotten or mistyped), or the tagged commit isn't on `main`. Fix it,
then move the tag as described below.

**The tests fail on the tag.** Nothing is released. Open the failed run and
read the message. If it says `APP_VERSION is X but the newest release tag is
vY`, the version bump was forgotten.

**The browser tests fail on GitHub but pass on your machine.** Treat it as
news, not as a flaky test: open the failed step, read which test and which
browser, and compare with your own run. The dry run in step 5 is the place to
find this out before a tag exists.

**Moving the tag.** In every one of these cases the fix is the same. Fix the
problem, commit it, push `main`, wait for green, then move the tag so it sits
on the fixed commit:

```
git tag -d vX.Y.Z
git push origin --delete vX.Y.Z
git tag vX.Y.Z
git push origin vX.Y.Z
```

Only do this while the release is still a draft or nobody has relied on it.
Once it is public, fix forward with a new patch version instead.

## Dependency updates

Once a month Dependabot opens pull requests for the actions the workflows use
and the packages pinned in `package.json`. They are grouped, so there are only
a few at a time. Each one runs CI before it can be merged. Merge one when CI is
green, or close it. A new version of Vite, React or Playwright can break the
site without breaking a unit test, so after merging one of those, run
`npm run e2e` before the next release.
