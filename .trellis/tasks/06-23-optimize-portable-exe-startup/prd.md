# Optimize Portable Exe Startup

## Goal

Improve startup speed for the Windows single-file portable exe build.

## Requirements

- Keep the user-facing Windows artifact as a single `.exe` file.
- Reduce portable startup overhead caused by extracting unnecessary Electron runtime files.
- Prefer faster extraction/startup over the smallest possible exe size.
- Keep Android and VPS server packaging behavior unchanged.

## Acceptance Criteria

- [ ] Windows portable exe still builds successfully.
- [ ] The Windows portable artifact keeps the app functional.
- [ ] The packaged Windows runtime includes only required Electron locales.
- [ ] Lint, tests, typecheck, and build pass.

## Technical Notes

- Electron portable executables extract the packaged app at startup, so large compressed payloads directly affect launch time.
- `electronLanguages` can remove unused locale files.
- `portable.useZip` and `win.compression = "store"` can trade larger file size for lower decompression cost.
