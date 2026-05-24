# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.1] - 2026-05-24

### Changed

- Point `package.json` `homepage` at the new landing site
  ([docktui.com](https://docktui.com)) so the npm page links there
  instead of the GitHub README anchor.
- Swap the README hero image to the new PNG logo
  (`assets/icon.png`) and remove the old JPG.

## [0.1.0] - 2026-05-24

First public release on npm.

### Added

- **Stacks view** — Docker Compose-aware tree, containers grouped by project, collapsible per stack, running / errored / stopped counts.
- **Containers, Images, Volumes views** with live CPU & memory stats, start / stop / restart / kill / remove actions, and confirm dialogs.
- **Side rail** — persistent navigation across the four views with live stack jump-to (keys `1`–`4`, `Tab` / `Shift+Tab`).
- **Filter** — `/` from the Stacks view filters by stack name, service name, or image.
- **Log viewer** with follow mode (`f`), scroll, top/bottom jumps, and a scrollback cap so chatty containers don't grow unbounded.
- **External terminal exec** — `x` shells into the selected running container via the platform's native terminal (macOS Terminal.app / Windows Terminal / common Linux emulators).
- **`DOCKER_HOST` support** — honors `unix://`, `npipe://`, `tcp://`, `http://`, `https://` for rootless docker, podman, and remote daemons.
- **Top bar** shows the socket path, Docker daemon version, and live aggregate counters.
- **Footer** shows context-aware key hints and "last refresh Ns ago".

### Project meta

- TypeScript strict mode, ESLint + Prettier, Vitest test suite (88 tests).
- CI runs lint, format check, build, and tests on Ubuntu / macOS / Windows × Node 20 / 22.
- npm tarball ships only `dist/` + `README.md` + `LICENSE` (~32 kB).

[Unreleased]: https://github.com/0xShady/docktui/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/0xShady/docktui/releases/tag/v0.1.1
[0.1.0]: https://github.com/0xShady/docktui/releases/tag/v0.1.0
