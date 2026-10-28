# Contributing to docktui

Thanks for taking the time to help out. The project is small and the surface area is intentionally narrow — issues and PRs of any size are welcome.

## Getting set up

```bash
git clone https://github.com/0xShady/docktui.git
cd docktui
npm install
npm run dev
```

You'll need a running Docker daemon to exercise changes against real containers, images, and volumes. A few stacks running via `docker compose up` give the Stacks view something interesting to render.

## Project layout

```
src/
  cli.ts                  Entry point. Boots App, owns the only process.exit().
  theme.ts                Color palette (C) + tag helpers (t.purple(...), etc.).
  docker/                 Dockerode wrappers. Pure transformations live alongside.
  models/docker.ts        Shared types: ContainerInfo, ImageInfo, VolumeInfo, ...
  utils/                  Pure helpers: format, stats, status, stacks, term-caps.
  ui/                     neo-blessed widgets.
    app.ts                Screen, polling loop, view routing, global keys.
    widgets.ts            Shared factories + Dims interface.
    top-bar.ts            One-row header (socket, version, counters, stats).
    footer.ts             One-row context-aware key hints + last-refresh ticker.
    side-rail.ts          28-col left rail: views + live stacks.
    help-overlay.ts       Help modal toggled with `h`.
    stacks/               Stacks view + stack tree.
    containers/           Containers tab, detail panel, log viewer, confirm dialog.
    images/               Images tab.
    volumes/              Volumes tab.
tests/                    Vitest tests parallel to src/. Pure logic only.
```

Imports use TypeScript path aliases (`@docker/*`, `@ui/*`, `@utils/*`, `@models/*`, `@theme`) configured in `tsconfig.json` and rewritten to relative paths at build time by `tsc-alias`. Prefer the alias over deep `../../` paths.

## Coding conventions

- **TypeScript strict** mode. Avoid `any` outside the dockerode-narrowing edge — when you do need it, add `// eslint-disable-next-line @typescript-eslint/no-explicit-any` with a comment explaining why.
- **One primary export per file**, named (not default). No `index.ts` barrels.
- **File names**: `kebab-case.ts` (e.g. `container-list.ts`, `status-bar.ts`).
- **Async** functions wrap their bodies in `try` / `catch` and rethrow with a human-readable message — never swallow errors silently.
- **`process.exit()`** is only allowed in `src/cli.ts`. Inside widgets, signal shutdown through events.
- **`screen.render()`** is the caller's responsibility, not the widget's — except inside the widget's own key handler responding to user input.
- **Colors** always come from `src/theme.ts` (the `C` object or `t.<color>` helpers). Never hardcode hex tags inline.
- **Status-driven coloring** for containers goes through `src/utils/status.ts` (`statusDot`, `statusLabel`, `colorByStatus`, `isActive`, `cpuColor`, `memColor`, `formatCpuCell`, `formatMemCell`).
- **Shared widget factories** in `src/ui/widgets.ts` (`createListWidget`, `createHeaderBar`, `createCenteredMessage`, `listSelected`) — use them instead of re-rolling `blessed.list` config.
- **Key handlers** registered with `screen.key()` when a widget is shown **must** be removed with `screen.removeKey()` when it hides — otherwise they leak across views.

## Tests

Vitest, with `tests/` mirroring `src/`. We test:

- Pure functions (`format`, `stats`, `status`, `stacks`, `term-caps`).
- Pure transformations from dockerode payloads (`toContainerInfo`, `toContainerStats`).

We intentionally **do not** test blessed widgets (they need a real terminal) or thin try/catch shells around dockerode IO (testing them tests the mock). When you add a new pure utility, add tests next to it.

```bash
npm test               # one-shot
npm run test:watch     # while iterating
npm run test:coverage  # writes ./coverage/index.html
```

Coverage thresholds are enforced in CI (see `vitest.config.ts`). Bump them as you raise the floor — don't lower them to make a red build green.

## Pre-PR checklist

These are exactly what CI runs. If they pass locally they pass in CI:

```bash
npm run lint
npm run format:check
npm test
npm run build
```

`format:check` fails on style drift — run `npm run format` to auto-fix.

## Submitting a pull request

1. Fork and create a feature branch off `main`.
2. Keep the diff focused — one logical change per PR. If your branch grows tendrils, split it.
3. Update [`CHANGELOG.md`](./CHANGELOG.md) under `[Unreleased]` describing the user-visible change (skip for pure refactors or doc-only edits).
4. If the change adds a new dependency, explain why in the PR description — we keep the dep tree small on purpose.
5. Open the PR. Describe **what** changed and **why** (the code shows the what; the why is what reviewers need).
6. CI must be green before merge.

## Releasing (maintainers)

Merging to `main` never publishes. A release is a GitHub Release:

1. In a PR: bump `version` in `package.json` (`npm version X.Y.Z --no-git-tag-version`) and move the `[Unreleased]` entries in `CHANGELOG.md` under the new version.
2. After merging, on an up-to-date, clean `main`: `npm run release`. It publishes GitHub Release `vX.Y.Z` with notes from the merged PRs since the last release.
3. The `Release` workflow checks the tag against `package.json`, runs lint, format, build and tests, then publishes to npm with provenance through npm trusted publishing (no token).

`npm run release -- rc.1` publishes a pre-release (`vX.Y.Z-rc.1`) to npm under the `next` dist-tag (`npm i docktui@next`).

## Commit messages

No strict convention enforced, but short imperative subjects help (`fix log-viewer race on close`, `add isConfirmOpen to ImagesTab`, `remove deprecated heartbeat scaffolding`). Reference issues with `Fixes #N` where applicable.

## Reporting bugs

Open an issue at [github.com/0xShady/docktui/issues](https://github.com/0xShady/docktui/issues) with:

- Your OS and Node.js version (`node --version`)
- Your Docker version (`docker version`)
- The exact command you ran (e.g. `npx docktui@0.1.0`)
- Steps to reproduce
- What you expected vs. what happened
- Any error message from stderr, verbatim

Terminal recordings (asciinema, vhs) or screenshots are extremely helpful for layout, color, or interaction bugs.

## Suggesting features

Open an issue using the **Feature request** template before writing code for anything beyond a small fix. It saves both sides time if the idea isn't a fit — docktui is intentionally a focused tool, not a full Docker Desktop replacement.

## License

By contributing you agree that your contributions are licensed under the project's [MIT License](./LICENSE).
