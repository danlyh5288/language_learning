# Agent Instructions

## Project Intent

This is a local-first Electron app for pronunciation vocabulary study. Preserve the MVP focus: words, one tag, tone notes, one current self-recording, local search, and local persistence.

## Architecture

- Main process code lives in `electron/`.
- Renderer code lives in `src/`.
- Shared API/data types live in `shared/`.
- The renderer must talk to local persistence through `window.vocabApi`; do not enable Node integration in the renderer.
- Electron stores SQLite and recordings under `app.getPath("userData")`.
- The browser preview fallback in `src/api.ts` is for local UI/testing only.

## Development Rules

- Keep user data local by default. Do not add cloud services, telemetry, or remote sync without an explicit request.
- Do not commit generated outputs: `node_modules/`, `dist/`, `dist-electron/`, `.npm-cache/`, screenshots, or app data.
- Prefer small typed IPC methods over broad generic channels.
- Keep recording replacement safe: save the new audio first, update metadata, then remove the old file.
- UI changes should preserve the three-column calm study-tool layout unless the user asks for a redesign.

## Checks

Run these before publishing changes:

```bash
npm run typecheck
npm test -- --run
npm run build
npm audit
```
