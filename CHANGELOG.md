# Changelog

All notable changes to this project will be documented in this file.

## Unreleased

## 0.1.7 - 2026-06-28

### Added

- Add a Radix Dropdown Menu account entry for desktop account, language, cloud sync, and diagnostics actions.

### Changed

- Move desktop language selection and cloud sync controls into the lower-left account menu.
- Bump the macOS DMG package version to `0.1.7`.

## 0.1.6 - 2026-06-28

### Added

- Add desktop English/Chinese localization with English as the default.
- Add Radix UI Dialog and Select primitives for desktop modals and tag selection.

### Changed

- Bump the macOS DMG package version to `0.1.6`.

## 0.1.5 - 2026-06-26

### Fixed

- Suppress the duplicate-word warning while a realtime save is still pending.

### Changed

- Bump the macOS DMG package version to `0.1.5`.

## 0.1.4 - 2026-06-24

### Fixed

- Import local recordings through desktop IPC during first cloud sync instead of fetching the local playback URL.
- Keep cloud activation moving when one local recording cannot be read.

### Changed

- Bump the macOS DMG package version to `0.1.4`.

## 0.1.3 - 2026-06-24

### Fixed

- Let Firebase login and registration complete even when cloud activation fails.
- Show clearer setup guidance when Firestore or cloud rules are not ready.

### Changed

- Bump the macOS DMG package version to `0.1.3`.

## 0.1.2 - 2026-06-24

### Added

- Add login-triggered realtime cloud sync for desktop and mobile.
- Add cloud change subscriptions for desktop Firestore snapshots and mobile repositories.

### Changed

- Enable cloud sync after login without requiring a subscription or verified email.
- Bump the macOS DMG package version to `0.1.2`.

### Security

- Protect cloud vocabulary documents and recording storage by authenticated owner instead of paid entitlement.

## 0.1.1 - 2026-06-20

### Added

- Add Firebase email/password registration with verification email and resend support.
- Add `version:bump` and `dist:mac:bump` scripts for versioned DMG packaging.

### Changed

- Show cloud auth validation, registration errors, and verification status in the cloud sync panel.
- Require verified Firebase email plus active entitlement before enabling cloud sync.
- Load desktop Firebase Web config from local Vite env instead of committed source.
- Bump the macOS DMG package version to `0.1.1`.

### Security

- Enforce verified Firebase email for cloud vocabulary documents and recording storage.

## 0.1.0 - 2026-06-18

### Added

- Add the local-first Electron vocabulary study app with local SQLite persistence and recording storage.
- Add the Expo React Native mobile vocabulary MVP.
- Add optional Firebase cloud sync for authenticated, entitled users across desktop and mobile.
- Add Firebase Firestore and Storage security rules, rules emulator coverage, and Cloud Functions for sync entitlement and recording cleanup.
