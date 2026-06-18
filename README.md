# 发音词库

本地优先的 Electron 桌面应用，用来保存语言课上的词汇、标签、音调备注和自己录制的发音。当前 MVP 面向上海话学习场景，但数据模型不绑定某一种语言。

## Features

- 添加、编辑、删除词条
- 每个词条可设置一个标签和一段音调备注
- 录制自己的发音，保存后可随时替换旧录音
- 按词、备注、标签搜索，支持 `#标签名` 快速过滤
- 所有数据保存在本机，不需要账号或云服务
- 登录并开通云同步后，可用 Firebase 在桌面和移动端同步词条、标签和当前录音

## Tech Stack

- Electron for the desktop shell and local file access
- React + TypeScript + Vite for the renderer
- `sql.js` for a local SQLite database file
- `MediaRecorder` for browser-native audio capture
- Firebase Auth, Firestore, Cloud Storage, and Cloud Functions for optional paid cloud sync
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

Cloud sync is optional and defaults off. Local mode remains the default until the user signs in, has an active cloud sync entitlement, and explicitly enables cloud mode.

- Web/Electron uses the Firebase Web SDK with Firestore persistent local cache.
- Mobile uses React Native Firebase and requires an Expo dev client or production custom build.
- Firestore stores `users/{uid}/tags/{tagId}` and `users/{uid}/words/{wordId}` metadata.
- Cloud Storage stores recordings under `recordings/{uid}/{wordId}/{recordingId}.{ext}`.
- `users/{uid}/entitlements/cloudSync` controls paid sync access.
- Firestore's offline behavior is used for text metadata; conflicts follow Firebase last-write-wins semantics.
- Recording uploads use a local queue because Cloud Storage does not provide the same offline write queue as Firestore.

Firebase project files:

- `firestore.rules` protects user-scoped vocabulary documents behind Auth and active entitlement.
- `storage.rules` protects recording files behind Auth and active entitlement.
- `functions/src/index.ts` contains Stripe entitlement webhook handling and old-recording cleanup.

For mobile builds, download the Firebase native app config files and place them locally:

- `mobile/GoogleService-Info.plist`
- `mobile/google-services.json`

These files are ignored by Git.

## MVP Limits

- Cloud sync is optional and subscription-gated; local-only use still works without accounts.
- Each word has one primary tag and one current recording.
- No automatic transcription, pronunciation scoring, or teacher reference audio.
