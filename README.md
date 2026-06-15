# 发音词库

本地优先的 Electron 桌面应用，用来保存语言课上的词汇、标签、音调备注和自己录制的发音。当前 MVP 面向上海话学习场景，但数据模型不绑定某一种语言。

## Features

- 添加、编辑、删除词条
- 每个词条可设置一个标签和一段音调备注
- 录制自己的发音，保存后可随时替换旧录音
- 按词、备注、标签搜索，支持 `#标签名` 快速过滤
- 所有数据保存在本机，不需要账号或云服务

## Tech Stack

- Electron for the desktop shell and local file access
- React + TypeScript + Vite for the renderer
- `sql.js` for a local SQLite database file
- `MediaRecorder` for browser-native audio capture
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

Build:

```bash
npm run build
```

Run checks:

```bash
npm run typecheck
npm test -- --run
npm audit
```

## Data Storage

In Electron, app data is stored under Electron's `app.getPath("userData")` directory:

- `data/vocabulary.sqlite` stores words, tags, and recording metadata.
- `data/recordings/` stores local audio files.

The renderer uses a safe preload API instead of direct Node access. Audio playback uses the custom `recording://` protocol, which resolves recordings through the main process.

When running the renderer outside Electron, the app uses a browser-only preview API backed by `localStorage`. That preview mode is for UI development only.

## MVP Limits

- No accounts, sync, import/export, mobile app, or cloud backup yet.
- Each word has one primary tag and one current recording.
- No automatic transcription, pronunciation scoring, or teacher reference audio.
