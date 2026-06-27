# 发音词库

本地优先的 Electron 桌面应用，用来保存语言课上的词汇、标签、音调备注和自己录制的发音。当前 MVP 面向上海话学习场景，但数据模型不绑定某一种语言。

## Features

- 添加、编辑、删除词条
- 每个词条可设置一个标签和一段音调备注
- 录制自己的发音，保存后可随时替换旧录音
- 按词、备注、标签搜索，支持 `#标签名` 快速过滤
- 所有数据保存在本机，不需要账号或云服务
- 登录后可用 Firebase 在桌面和移动端实时同步词条、标签和当前录音

## Tech Stack

- Electron for the desktop shell and local file access
- React + TypeScript + Vite for the renderer
- `sql.js` for a local SQLite database file
- `MediaRecorder` for browser-native audio capture
- Firebase Auth, Firestore, Cloud Storage, and Cloud Functions for optional cloud sync support
- Vitest + Testing Library for UI flow tests

## Local Development

Install dependencies:

```bash
npm install
```

Run the full Electron app:

```bash
npm run dev
```

Run only the renderer preview:

```bash
npm run dev:renderer
```

Run the mobile app from the Expo workspace:

```bash
npm run mobile:dev
npm run mobile:ios
npm run mobile:android
```

Build:

```bash
npm run build
```

Package a macOS DMG:

```bash
npm run dist:mac
```

Package a macOS DMG and bump the desktop package version first:

```bash
npm run dist:mac:bump
npm run dist:mac:bump --release=minor
npm run dist:mac:bump --release=0.2.0
```

`dist:mac:bump` updates the root `package.json` version, which controls the DMG filename. It does not change the mobile workspace version.

The DMG is written to `release/`. Local DMG artifacts are ignored by Git. The local build targets the current Mac architecture and is unsigned by default, so macOS may show the standard warning for unidentified developers.

Run checks:

```bash
npm run typecheck
npm test -- --run
npm run build
npm run mobile:typecheck
npm run mobile:test
npm run build --workspace @pronunciation-vault/functions
npm audit
```

## Data Storage

In Electron, app data is stored under Electron's `app.getPath("userData")` directory:

- `data/vocabulary.sqlite` stores words, tags, and recording metadata.
- `data/recordings/` stores local audio files.

The renderer uses a safe preload API instead of direct Node access. Audio playback uses the custom `recording://` protocol, which resolves recordings through the main process.

When running the renderer outside Electron, the app uses a browser-only preview API backed by `localStorage`. That preview mode is for UI development only.

In React Native, `mobile/` uses an independent Expo SQLite database named `vocabulary.sqlite` and stores recordings inside the app sandbox. The mobile app starts from its own empty local library and does not read or sync the Electron data directory.

## Firebase Cloud Sync

Cloud sync is optional for local-only use. After a user signs in, the app initializes the user's cloud library, imports the local library only if that cloud library has not been initialized, and switches to cloud mode automatically.

- Web/Electron uses the Firebase Web SDK with Firestore persistent local cache.
- Mobile uses React Native Firebase and requires an Expo dev client or production custom build.
- Firestore stores `users/{uid}/tags/{tagId}` and `users/{uid}/words/{wordId}` metadata.
- Cloud Storage stores recordings under `recordings/{uid}/{wordId}/{recordingId}.{ext}`.
- `users/{uid}/entitlements/cloudSync` is retained for future subscription features but does not gate sync access.
- Firestore's offline behavior is used for text metadata; conflicts follow Firebase last-write-wins semantics.
- Recording uploads use a local queue because Cloud Storage does not provide the same offline write queue as Firestore.

Firebase project files:

- `firestore.rules` protects user-scoped vocabulary documents behind Auth ownership.
- `storage.rules` protects recording files behind Auth ownership.
- `functions/src/index.ts` contains Stripe entitlement webhook handling and old-recording cleanup.

For desktop/Web builds, copy `.env.example` to `.env.local` and fill in the Firebase Web app config from Firebase Console. `.env.local` is ignored by Git.
Enable the Email/Password sign-in provider in Firebase Auth and configure the verification email template. New email/password accounts receive a verification email after registration, but verification does not block cloud sync.
Set `VITE_FIREBASE_FUNCTIONS_BASE_URL` only when the app should call a local emulator or custom Functions URL. Otherwise the app derives `https://us-central1-{projectId}.cloudfunctions.net`.

## Monitor / Service Health

The developer diagnostics panel checks the optional cloud-sync chain and can submit sanitized health snapshots to OpenObserve through Cloud Functions.

- `monitorHealth` is a public GET endpoint for Firebase Functions availability checks.
- `monitorIngest` requires a Firebase ID token, recomputes an anonymous UID hash server-side, removes unapproved fields, and forwards the event to OpenObserve.
- OpenObserve credentials must stay in Functions runtime configuration, never in the desktop or mobile app.
- If OpenObserve is not configured, `monitorIngest` returns `{ accepted: false, reason: "not_configured" }` and the app continues normally.

Optional Functions environment for OpenObserve:

```bash
OPENOBSERVE_ENDPOINT=https://your-openobserve-host
OPENOBSERVE_ORG=default
OPENOBSERVE_STREAM=pronunciation_vault_health
OPENOBSERVE_USERNAME=your-openobserve-user
OPENOBSERVE_PASSWORD=your-openobserve-password
```

Configure the OpenObserve stream retention to 7 days.

For mobile builds, download the Firebase native app config files and place them locally:

- `mobile/GoogleService-Info.plist`
- `mobile/google-services.json`

These files are ignored by Git.

## MVP Limits

- Cloud sync starts after login; local-only use still works without accounts.
- Each word has one primary tag and one current recording.
- No automatic transcription, pronunciation scoring, or teacher reference audio.
