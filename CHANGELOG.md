# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.3] - 2026-04-17

### Fixed
- `git jump <branch>` now preserves the native `git switch` error when the switch fails for reasons unrelated to the branch name (e.g. uncommitted changes blocking a switch to a remote-only branch), instead of masking it with "does not match any branch".
- Fuzzy search now only runs when a single argument is provided. Multi-argument invocations (e.g. `git jump my-branch --discard-changes`) pass through to `git switch` directly without dropping flags or silently fuzzy-matching on the first argument.
- `git jump <current-branch>` now shows a concise "Staying on \<branch\>" message instead of git's raw tracking/status output, matching the interactive-mode behavior.

### Changed
- Branch name in the "No Match" error is no longer coloured.
- Terminal setup instructions expanded to cover VS Code's integrated terminal.

## [0.1.2] - 2026-04-14

### Added
- Terminal setup instructions for Ghostty and Zed's integrated terminal.

### Changed
- Commented out Homebrew installation references pending tap setup.

## [0.1.1] - 2026-04-14

### Added
- <kbd>Cmd</kbd>+<kbd>←</kbd> / <kbd>Cmd</kbd>+<kbd>→</kbd> jump to the start/end of the search string.
- <kbd>Opt</kbd>+<kbd>←</kbd> / <kbd>Opt</kbd>+<kbd>→</kbd> navigate the search string word-by-word.
- <kbd>Opt</kbd>+<kbd>Backspace</kbd> deletes the word before the cursor.
- Additional input-clearing key combos.

## [0.1.0] - 2026-04-14

### Added
- Initialised a standard `CHANGELOG.md` for the modernised fork.
- Specified `pnpm` as the strict package manager via the `engines` and `packageManager` fields.

### Changed
- Forked the project from the original `git-jump` (v0.3.1) by Mykola Harmash to continue active maintenance.
- Renamed the package to the scoped namespace `@pkitazos/git-jump`.
- Updated documentation (`README.md`) to reflect new ownership, Homebrew installation paths, and macOS setup instructions.
- Switched the build scripts to use `pnpm` instead of `npm`.
