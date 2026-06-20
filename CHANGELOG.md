# Changelog

All notable changes to this project will be documented in this file.

## Unreleased

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
