# InterviewClaudePilte â€” Engineering Guide

> **InterviewClaudePilte** is an independent, clean-room reimplementation of the
> workflow pioneered by [InterviewFury](https://interviewfury.com/) (its FuryModule
> desktop app). It does **not** contain any InterviewFury code â€” the original was a
> remote-loaded Electron shell, and this project rebuilds the same idea as a local,
> open app: a real-time interview assistant with editable APIs, an editable
> transcript, and a built-in remote Coach Console over LAN (PIN-protected, with
> live latency display). Reimplemented from scratch; no InterviewFury code is
> included.
>
> Historical note: this guide was adapted from the upstream **InterviewCopilot**
> project. Section 4 and section 8 document how the reference app was inspected
> during the upstream project â€” they are kept as process documentation. Version
> history and verification results in this guide (through v1.2.9) describe the
> upstream baseline; this project keeps its own version line (`package.json`) and
> adds the InterviewClaudePilte-specific features listed in Â§1.

Everything needed to understand, modify, verify, and rebuild this app without
breaking it â€” including how the original desktop app was reverse engineered and
how to inspect any Electron app you want to compare against.

- [1. What this app is](#1-what-this-app-is)
- [2. Tech stack](#2-tech-stack)
- [3. Repository layout](#3-repository-layout)
- [4. How it was built (end-to-end)](#4-how-it-was-built-end-to-end)
- [5. Runtime architecture](#5-runtime-architecture)
- [6. Update playbook (do not break it)](#6-update-playbook-do-not-break-it)
- [7. Verification toolkit](#7-verification-toolkit)
- [8. Reverse engineering an Electron app](#8-reverse-engineering-an-electron-app)
- [9. Packaging and release](#9-packaging-and-release)
- [10. Troubleshooting](#10-troubleshooting)
- [11. Known limitations and roadmap](#11-known-limitations-and-roadmap)

---

## 1. What this app is

A Windows desktop interview assistant:

1. Captures **system audio (loopback)** and optionally the microphone.
2. Transcribes it with a **selectable provider** â€” offline whisper.cpp
   (default), or an OpenAIâ€‘compatible `/audio/transcriptions` API.
3. Generates answers with an **AI model the user configures** (any
   OpenAI-compatible endpoint, or OpenAI/Anthropic/Google/NVIDIA keys).
4. Can also answer from a **screenshot** ("Analyse Screen") for vision models.
5. Lives in a **transparent, always-on-top, click-through overlay** that can be
   hidden from screen shares.

InterviewClaudePilte additions on top of the original feature set:

- **Editable transcript** â€” add / edit / delete transcript segments live, so a
  mis-heard segment can be corrected or dropped before it reaches the model.
- **Custom API providers** â€” OpenAI-compatible endpoints are added, edited, and
  deleted from the dashboard (**Settings â†’ API**), no rebuild required.
- **Coach Console** â€” a PIN-protected web page served over LAN (default port
  `47821`, e.g. `http://<your-pc-ip>:47821/`) for a friend/coach on the same
  Wi-Fi. They can watch the live transcript and streaming answers, send
  hints/chat, see the live connection latency (RTT), edit the transcript, and
  toggle auto-answer / tone / session controls remotely. The candidate sees
  connected coaches and their RTT in the dashboard.

It is a clean-room reimplementation of the behavior and layout of a reference
commercial app (`interviewhelpai-Windows.exe`, v1.3.5). No code was copied from
it; the reference was inspected (packaging format, Electron version, rendered
DOM) and the equivalent UX was rebuilt in this repository's own code.

Two deliberate product differences:

| Area | Reference app | This app |
| --- | --- | --- |
| Billing / Pro tab | `Billing` | `API` â€” you supply the model endpoint |
| AI access | Bundled subscription | Your own key (or local Ollama/LM Studio) |
| Transcription | Cloud service | **Local whisper.cpp** (Base bundled; larger models lazyâ€‘download) **or API** â€” selected in Settings â†’ API â†’ Transcription; either way 3 s WAV chunks |

---

## 2. Tech stack

| Layer | Choice | Version | Why |
| --- | --- | --- | --- |
| Desktop runtime | Electron | 28.0.0 | Same class of app as the reference (Chromium + Node); transparent windows, `desktopCapturer`, `setContentProtection` |
| UI | React + TypeScript | 18.2 / 5.9 | Component state for overlay panels; TS catches IPC drift |
| Styling | Tailwind CSS | 3.3 | Reference uses utility classes; fast pixel tuning |
| Icons | lucide-react | 0.294 | Matches the reference's icon set |
| Markdown | react-markdown + remark-gfm | 10 / 4 | Streamed answers with tables, lists, code |
| Build (renderer) | Vite | 5 | `base: './'` so the app loads from `file://` |
| Build (main/preload) | esbuild | 0.21 | Single CJS bundle per process, `--external:electron` |
| Packaging | electron-builder | 24.13 (NSIS) | Per-user installer, no admin prompt |
| Settings | electron-store | 8 | JSON store in `%APPDATA%` |
| Speech | whisper.cpp CLI + GGML models | `whisper-cli.exe` | Offline, CPU-friendly, 3 s chunks |
| AI SDKs | openai 4.x, @anthropic-ai/sdk 0.14, @google/generative-ai 0.2 | â€” | Streaming + vision |
| Documents | pdf-parse 1.1.1 (`lib` entry), mammoth 1.13 | â€” | Resume PDF/DOCX extraction |

Notes that matter:

- **Node target is `node18`** in esbuild. Keep it aligned if you bump Electron.
- **Electron is pinned at 28** while the reference ships 43. Behavior used here
  exists in both; bumping is optional (see Â§6.4). Do not bump casually.
- **pdf-parse must stay on v1.** v2 pulls a pdfjs build that needs `DOMMatrix`
  and `ImageData`, which the Electron main process does not provide.
- No native modules, so `npmRebuild: false` is safe and installs are fast.

---

## 3. Repository layout

```
interviewclaudepilte/
â”œâ”€ src/
â”‚  â”œâ”€ main/                    Electron main process (Node context)
â”‚  â”‚  â”œâ”€ main.ts               window, IPC, shortcuts, tray, screenshots, ask orchestration
â”‚  â”‚  â”œâ”€ paths.ts              packaged-aware resource paths
â”‚  â”‚  â”œâ”€ ai/AIProviderManager.ts   providers, model resolution, streaming, vision
â”‚  â”‚  â”œâ”€ whisper/WhisperTranscriber.ts  buffering, silence gate, WAV, whisper-cli
â”‚  â”‚  â”œâ”€ settings/SettingsManager.ts    electron-store defaults + migrations
â”‚  â”‚  â”œâ”€ context/ContextManager.ts      resume/JD parsing helpers
â”‚  â”‚  â””â”€ stealth/StealthManager.ts      Win32 helpers (capture exclusion, toolwindow)
â”‚  â”œâ”€ preload/
â”‚  â”‚  â”œâ”€ preload.ts            contextBridge â†’ window.electronAPI
â”‚  â”‚  â””â”€ types.ts              DUPLICATE of src/shared/types.ts (must stay identical)
â”‚  â”œâ”€ renderer/                Vite root
â”‚  â”‚  â”œâ”€ index.html            transparent background, Inter font, CSP
â”‚  â”‚  â””â”€ src/
â”‚  â”‚     â”œâ”€ App.tsx            state machine for the whole overlay
â”‚  â”‚     â”œâ”€ components/        CommandBar, Dashboard, CommandsTab, SettingsTab,
â”‚  â”‚     â”‚                     ApiTab, ChatPanel, AnswerView, Keycap
â”‚  â”‚     â”œâ”€ hooks/useAudioCapture.ts   loopback/mic â†’ 16 kHz PCM â†’ IPC
â”‚  â”‚     â””â”€ index.css          tokens, markdown styles, animations
â”‚  â”œâ”€ shared/types.ts          IPC contract + Settings shape (single source of truth)
â”‚  â””â”€ types/pdf-parse.d.ts     local typings for pdf-parse v1
â”œâ”€ resources/
â”‚  â”œâ”€ whisper/                 whisper-cli.exe + DLLs + models/ggml-base.bin
â”‚  â”œâ”€ icon.ico / icon.png / tray-icon.png
â”‚  â””â”€ ffmpeg/                  LEGACY, no longer packaged (safe to delete)
â”œâ”€ tools/                      verification scripts (see Â§7)
â”œâ”€ dist/                       build output (main.js, preload.js, renderer/)
â”œâ”€ release/                    electron-builder output (installer + win-unpacked)
â”œâ”€ ENGINEERING_GUIDE.md        this file
â”œâ”€ PROVIDERS.md                verified free API providers/models (answers, vision, code, reasoning)
â”œâ”€ INSTRUCTIONS.md             paste-ready prompt for Settings â†’ Instructions (answer style)
â”œâ”€ README.md                   user-facing overview
â”œâ”€ CLAUDE.md                   short brief for AI coding agents
â”œâ”€ MULTI_AGENT_PROJECT_PLAN.md historical plan + final status
â””â”€ AGENT_SKILLS_SETUP.md       optional agent-role catalog
```

---

## 4. How it was built (end-to-end)

This is the repeatable method. Use it whenever you want to match another desktop
app's behavior.

### Step 1 â€” Identify what the reference actually is

```powershell
Get-ChildItem "$env:LOCALAPPDATA\Programs\InterviewHelpAI"
Get-ChildItem "$env:LOCALAPPDATA\Programs\InterviewHelpAI\resources"
```

Presence of `icudtl.dat`, `snapshot_blob.bin`, `v8_context_snapshot.bin`,
`libEGL.dll`, `resources/app.asar` â‡’ it is an **Electron** app. The Chromium
version and Electron version are in the user agent (see Â§8):

```
interviewhelpai/1.3.5 Chrome/150.0.7871.224 Electron/43.4.1
```

Conclusion: "make it a real desktop app, not a web page" does **not** require a
different language â€” it requires the same *window model* (transparent, frameless,
always-on-top overlay) and the same *UI composition*.

### Step 2 â€” Get the real rendered UI

Never design from marketing screenshots. Launch the reference with a debugging
port and read its DOM:

```powershell
Start-Process "$env:LOCALAPPDATA\Programs\InterviewHelpAI\InterviewHelpAI.exe" `
  -ArgumentList "--remote-debugging-port=9222"
```

Then use `Page.captureScreenshot` + `Runtime.evaluate` (see `tools/cdp_smoke.cjs`
for the pattern). This gave exact measurements:

- viewport `1536x816`, `devicePixelRatio 1.25`
- transparent `body` (`rgba(0,0,0,0)`), Inter font
- command bar centered at top: logo Â· Answer Â· Analyse Screen Â· Chat Â· Show/Hide Â· `00:00` Â· mic
- dashboard card â‰ˆ1248 px wide starting at yâ‰ˆ78, tabs `All Commands | Settings | Billing`
- dark chat bar, white answer card, `data-*`-free utility classes (Tailwind)

### Step 3 â€” Rebuild the window and the flows

Implemented in this order (kept, because each step is independently verifiable):

1. **Overlay window** â€” full-work-area, `transparent`, `frame: false`,
   `alwaysOnTop('screen-saver')`, `skipTaskbar`, `show: false` â†’ `showInactive()`.
2. **Click-through** â€” window ignores the mouse, renderer re-enables it over `[data-ui]`.
3. **Audio** â€” Web Audio loopback in the renderer (no FFmpeg, no Stereo Mix).
4. **Transcription** â€” 3 s buffers â†’ WAV â†’ `whisper-cli.exe` **or**
   `POST {baseUrl}/audio/transcriptions` (multipart) â†’ transcript segments.
   The provider is `settings.transcriptionProvider` (`'local'` default, `'api'`
   optional). In API mode the whisper binary/model is never touched; a test
   clip can be sent via IPC `test-transcription` â†’ `testApiConnection()`.
5. **AI** â€” provider manager with streaming; custom OpenAI-compatible endpoint.
6. **Screens** â€” `desktopCapturer` thumbnails, attached as vision input.
7. **Chrome** â€” tray, global shortcuts, settings persistence, stealth toggle.
8. **Packaging** â€” esbuild + Vite + electron-builder, models as extra resources.

### Step 4 â€” Verify, don't assume

Every claim in this repo was checked against a running instance: real speech
played through the speakers produced a real transcript; a mock OpenAI-compatible
server proved streaming/vision; the packaged build was re-tested from a clean
`%APPDATA%`. See Â§7 for the exact scripts.

### Step 5 â€” Package and re-test the package

Development success does not imply packaged success: resource paths change
(`app.isPackaged` â†’ `process.resourcesPath`), the asar is read-only, and the
renderer loads from `file://`. Always smoke-test `release/win-unpacked`.

---

## 5. Runtime architecture

### 5.1 Window and click-through

```
main.ts
 â”œâ”€ BrowserWindow({ transparent, frame:false, alwaysOnTop, skipTaskbar })
 â”œâ”€ setAlwaysOnTop(true, 'screen-saver')
 â”œâ”€ setIgnoreMouseEvents(true, { forward: true })   after did-finish-load
 â””â”€ ipcMain.on('set-ignore-mouse', (_, ignore) => win.setIgnoreMouseEvents(ignore, {forward:true}))
```

Renderer (`App.tsx`):

```ts
document.elementFromPoint(x, y)?.closest('[data-ui]')  // interactive?
```

`ignoring` starts as `true`, so the first mouse move over real UI restores clicks
and moving back to empty space lets clicks reach the window underneath. **Any new
interactive container must carry `data-ui`**, otherwise it is unclickable.

### 5.2 Audio â†’ transcript

```
useAudioCapture.ts                 main.ts                    WhisperTranscriber.ts
AudioContext(16000)  â”€â”€PCM s16â”€â”€â–¶  'audio-chunk'  â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â–¶  buffer 3 s
  â”œ getUserMedia(chromeMediaSource:'desktop', sourceId)          â”œ RMS < 0.004 â†’ discard
  â”” optional getUserMedia(mic)                                   â”œ write 44-byte WAV header
                                                                 â”” provider === 'local' ?
                                                                      spawn whisper-cli -m -f -l -nt -np
                                                                      : POST {base}/audio/transcriptions (multipart)
                                                                      â†’ stdout / JSON {"text":â€¦}
                                                                      â†’ filler filter â†’ segment
```

- The loopback source id comes from `desktopCapturer.getSources` in main
  (`get-loopback-source`). It is the **primary display**, so system audio is
  captured regardless of which app is playing it.
- `AudioContext({ sampleRate: 16000 })` makes Chromium resample for us; the
  renderer only converts Float32 â†’ Int16.
- The graph is kept alive with a zero-gain node so nothing is echoed back.
- **Silence gate** (`isSilent`, RMS < 0.004 â‰ˆ âˆ’48 dBFS) is essential: without it
  whisper "hears" words in noise and emits phantom segments ("you",
  "Thank you."). A filler list filters what still slips through.
- `isHallucination` also drops `[MUSIC]`, `(silence)` style annotations.
- **Transcription providers**: `transcriptionProvider` in settings is `'local'`
  (default; whisper.cpp, works offline) or `'api'` (OpenAI-compatible speech-to-text â€”
  OpenAI `whisper-1`, Groq `whisper-large-v3`, self-hosted faster-whisper). API mode
  POSTs each 3 s WAV (`response_format=json`, optional `language`) with
  `Authorization: Bearer <key>`; set Base URL to the `/v1` root â€” the code appends
  `/audio/transcriptions`. `initialize()` short-circuits in API mode (no whisper
  binary/model needed); missing keys throw a clear error that surfaces as a toast.
  `test-transcription` IPC â†’ `testApiConnection()` sends a 1 s silent WAV so users
  can verify URL/key/model before relying on it. The spoken-language setting applies
  to both providers; keys never leave the local settings file. The API path applies
  the same `isHallucination` filter as the local path (drops "you"/"Thank you."
  fillers from near-silent audio). **Verified Nov 2026** with Groq free tier
  (`whisper-large-v3`, exact transcription of a synthesized SAPI sentence);
  NVIDIA NIM has no STT endpoint (HTTP 404) â€” NVIDIA keys work for answers only.
- **Saved transcription endpoints (v1.2.0)**: the API mode manages a list of
  `transcriptionProfiles: TranscriptionProfile[]` (`id, name, baseUrl, apiKey,
  model`) plus `selectedTranscriptionProfile` (id of the active profile). The
  effective config is resolved lazily at chunk time (`activeApiProfile()` in
  `WhisperTranscriber`): selected profile â†’ first saved profile â†’ legacy flat
  `transcriptionApi*` fields. A one-time v3 `settingsVersion` migration seeds a
  named profile from non-empty legacy flat fields, so existing users keep their
  working Groq configuration and can add more endpoints. The renderer manages
  profiles with the same Add / Edit / Use / Delete UX as custom chat models
  (Settings â†’ API â†’ Transcription); arrays replace wholesale through
  `update-settings` IPC (no dedicated add/remove IPC needed), and the transcriber
  re-reads fresh settings on every chunk, so edits and switches take effect
  immediately. Legacy flat fields remain as a last-resort fallback if every saved
  profile is deleted.

### 5.3 Model resolution (AI)

```
settings.selectedModel = "openai:gpt-4o"          â†’ built-in provider
                       = "custom:<id>"            â†’ providers.get("custom_<id>")
                       = "<bare-model-name>"      â†’ generic custom endpoint
```

`getAvailableModels()` only lists providers that are actually usable:

- built-in providers appear when their key is set,
- custom models appear as `custom:<id>` when added with key + base URL,
- no usable provider â‡’ empty list â‡’ first-run opens the **API** tab.

See `PROVIDERS.md` for a verified (Nov 2026) catalogue of free/fast
OpenAI-compatible endpoints and model IDs for answers, vision, coding and
reasoning (Gemini, Groq, NIM, OpenRouter, Cerebras).

See `INSTRUCTIONS.md` for a paste-ready prompt for the **Settings â†’
Instructions** field (`buildSystemPrompt()`, injected as
`CANDIDATE INSTRUCTIONS (follow strictly):`, truncated at 2000 chars). The
shipped block is 1,489 chars: resume-anchored answers, type detection
(technical / behavioural-HR / other), speakable line first, plain text.

On startup, if the saved model is not in that list it is replaced by the first
available one (or `''`). `''` means no model is selected, and pressing Answer
shows a neutral toast `No AI model configured â€” open Settings â†’ API` (the
Answer card is dropped rather than opened in red).

### 5.4 Ask pipeline

```
renderer runAnswer('answer'|'screen')
   â†’ (screen only) captureScreen()  â†’ desktopCapturer thumbnail, last 5 kept
   â†’ electronAPI.ask({id, mode, question})
main handleAsk()
   â†’ builds prompt from last 12 transcript segments + mode instructions
   â†’ generateResponseStream(...)  or  generateResponseStreamWithVision(...)
   â†’ send('ai-response-chunk', {id, chunk})   (streamed)
   â†’ send('ai-response-end' | 'ai-response-error')
   â†’ 120 s watchdog guarantees the UI never stays stuck "streaming"
```

`answer` requires transcript context (otherwise it returns a helpful error).
`screen` works with no transcript. `chat` sends the user's text plus the last
6 chat turns.

**Error contract (v1.2.1):** `handleAsk` returns
`{ ok, error?, code? }`. Preflight failures return `NO_CONTEXT` (answer
pressed with no captured audio / transcript) or `NO_MODEL` (no `selectedModel`
resolves) â€” the renderer drops the just-created Answer card and shows a small
neutral toast instead of the red error card. Provider failures return
`PROVIDER_ERROR`; `sanitizeProviderMessage()` strips `gsk_â€¦` / `nvapi-â€¦` /
`sk-â€¦` / `Bearer â€¦` from the message **before** it reaches the UI or the log
(OpenAI-style provider errors echo the rejected key otherwise). The Answer
card renders remaining errors in muted italic text, not red.

**Cursor stealth (v1.2.1):** the renderer forces `cursor: default !important`
on every element, so the OS cursor never turns into hand/pointer/I-beam over
the invisible overlay during a screen share â€” a viewer sees a plain desktop
cursor at all times. Clicks and text selection still work.

**Tooltip stealth (v1.2.2):** every native HTML `title` attribute is gone
(`CommandBar` IC-logo/mic, answer/chat copy & close, dashboard account & close,
saved-model/profile URLs). Hover hints use `.tip[data-tip]` CSS tooltips
rendered **inside** the page â€” the capture protection covers them, so a
screen-share viewer never sees them (native Chromium tooltips are separate,
unprotected OS popups).

**Screen vision (v1.2.3):** `Settings.screenVisionEnabled` (default `true`)
controls whether "Analyse Screen" attaches a screenshot at all. The screenshot
is captured/stored in the main process and only included when the mode is
`screen` and the toggle is ON; the renderer never sends image bytes. An
optional `Settings.visionModel` (empty = same as `selectedModel`) routes
screenshot requests to a dedicated multimodal model while text answers keep
using the answer model. `handleAsk` wraps `generateResponseStreamWithVision`
in a try/catch â€” if the provider rejects the image (`isMultimodalRejection`,
e.g. vLLM started without `--enable-multimodal`), it retries
`generateResponseStream` text-only with a "no image available" note and emits
a neutral toast (`Model has no multimodal processing â€” answering without the
screenshot`), so the candidate still gets an answer. Settings â†’ Settings tab â†’
"Screen analysis (vision)" exposes the toggle and the model dropdown. v1.2.4: the `CommandOrControl+H` shortcut toasts on capture (`Screenshot captured (n/5)`) and `registerShortcuts()` toasts when a global shortcut fails to register (previously only a lost console.warn) â€” both were silent before, so Ctrl+H looked broken. v1.2.5: both screenshot-delete paths (`CommandOrControl+Delete` shortcut and the `delete-screenshot` IPC) call the shared `deleteLastScreenshot()` helper, which toasts the outcome (`Screenshot deleted (n left)` / `No screenshots to delete`).

### 5.5 Settings

`electron-store` file: `%APPDATA%\interviewclaudepilte\interview-claudepilte-settings.json`.

Defaults live in `SettingsManager.DEFAULT_SETTINGS`. Migrations use
`settingsVersion` (currently `3`: `2` moved `whisperModel` from `large-v3` â†’
`base`; `3` seeds a saved transcription profile from the legacy flat
`transcriptionApi*` fields when the user had configured the API, keeping the
profile list the single source of truth in the UI while the flat fields remain
a fallback). The `transcriptionProvider` block (`transcriptionApiBaseUrl/Key/Model`) added in
v1.1.0 has no migration of its own â€” absent keys fall back to the defaults via electron-store
(`'local'`, `whisper-1`), so existing installs keep local offline transcription.

### 5.6 Shortcuts (registered in main, dispatched as `ui-command`)

`Ctrl+Enter` answer Â· `Ctrl+Shift+Enter` analyse screen Â· `Ctrl+Alt+Enter` chat Â·
`Ctrl+R` reset Â· `Ctrl+Shift+L` listening Â· `Ctrl+H` screenshot Â· `Ctrl+Delete`
delete screenshot Â· `Ctrl+\` show/hide window Â· `Ctrl+Q` quit Â·
`Ctrl+Shift+Alt+O` restore Â· `Ctrl+Shift+â†‘/â†“/â†/â†’` scroll Â· `Ctrl+â†/â†’` move Â·
`Ctrl+[/]` opacity. `Ctrl+â†/â†’` slides the overlay via
`transform: translateX(offset)` with a 120 ms ease-out transition (the old
`padding-left` could not go negative, so Ctrl+â† never rendered â€” fixed in
v1.2.8). Travel is clamped to **Â±75% of the screen work-area width** in the
`move-x` IPC handler (`maxHorizontalOffset()`).

---

## 6. Update playbook (do not break it)

### 6.0 Non-negotiable invariants

| Invariant | Why |
| --- | --- |
| `src/shared/types.ts` **and** `src/preload/types.ts` are byte-identical | preload is bundled separately; drift = silent IPC mismatch |
| Every interactive container keeps `data-ui` | otherwise it is transparent to clicks |
| `html/body/#root` stay transparent | the overlay must not dim the screen |
| IPC channel names match on both sides (`ask`, `audio-chunk`, `ai-response-*`, â€¦) | no compile-time check across the bridge |
| `extraResources` filters still list only `ggml-base.bin` / `ggml-tiny.bin` | `ggml-large-v3.bin` is 3 GB and must never ship |
| pdf-parse stays on v1 (`lib/pdf-parse.js`) | v2 needs DOM globals in main |
| whisper.cpp boolean flags get **no value** | `--print-progress false` is parsed as an input file |
| Window is created only after `app.whenReady()` | `screen` cannot be used earlier |

### 6.1 Standard change loop

```powershell
npm install            # only after reviewing dependency diffs
npm run typecheck      # fails fast on IPC/typing drift
npm run build          # esbuild main + preload, vite renderer
npm run dev            # or: node tools/cdp_smoke.cjs
```

Then run the functional checks in Â§7 that correspond to what you touched, and
finally package (Â§9).

### 6.2 Common change recipes

**Add a setting**
1. `src/shared/types.ts` â†’ add the field to `Settings`.
2. Copy it verbatim to `src/preload/types.ts` (keep files identical).
3. `SettingsManager.DEFAULT_SETTINGS` â†’ add a default.
4. If existing users need a change, bump `settingsVersion` and migrate in
   `loadSettings()`.
5. Use it in main and/or renderer.

**Add an AI provider**
1. Extend the `AIProvider` union in `types.ts`.
2. Add a `BUILTIN_PROVIDERS` entry (name, models, `requiresApiKey`, `baseUrl`).
3. Add `init<Provider>()` and call it from `initializeProviders()`.
4. Extend `hasProviderKey()`.
5. Implement a `BaseProvider` subclass (streaming + optional vision).

**Add a UI panel**
1. Create it under `src/renderer/src/components/`.
2. Put `data-ui` on the outermost interactive element.
3. Keep it inside the fixed width used by the other panels (1240 px dashboard,
   960 px chat, 980 px answer) so the overlay stays centered.

**Change the audio pipeline**
Never send raw Float32 over IPC â€” the main process writes a 16 kHz mono s16le
WAV header. Keep `sampleRate = 16000`, 1 channel, 2 bytes/sample, or update
`writeWav()` accordingly.

### 6.3 Upgrade whisper.cpp / models

```powershell
.\resources\whisper\whisper-cli.exe --help   # confirm flags are still -m -f -l -nt -np
```

Replace **the whole `resources/whisper` set** (exe + every `ggml*.dll` +
`whisper.dll`) â€” mixing DLL versions crashes on load. Keep model names
`ggml-<size>.bin`. If you bump the bundled model size, update
`MODEL_URLS` and the install-size expectations in README.

### 6.4 Upgrade Electron (optional, higher risk)

1. Bump `devDependencies.electron`, `npm install`.
2. Re-check: `desktopCapturer.getSources`, `new AudioContext(16000)`,
   `chromeMediaSource: 'desktop'` constraints, `setContentProtection`,
   `setIgnoreMouseEvents(..., {forward:true})`, `setVisibleOnAllWorkspaces`.
3. Re-run the **audio**, **screen**, **click-through**, and **shortcut** tests.
4. Repackage and re-test `win-unpacked` (paths change with major versions).

### 6.5 Upgrade Node/TypeScript/Vite/esbuild

`tsconfig.json` targets and the esbuild `--target=node18` must stay compatible
with the Electron version's Node. Vite output feeds a `file://` page, so `base`
must remain `'./'`.

---

## 7. Verification toolkit

All scripts live in `tools/` and target a running instance with a debugging port.

### 7.1 Start an instance for inspection

```powershell
# development build
Start-Process .\node_modules\electron\dist\electron.exe -ArgumentList ".","--remote-debugging-port=9223"

# packaged build
Start-Process ".\release\win-unpacked\InterviewClaudePilte.exe" -ArgumentList "--remote-debugging-port=9224"
```

### 7.2 Visual + DOM smoke test

```powershell
node tools/cdp_smoke.cjs 9224 out=screens
```

Screenshots `01_home.png` and dumps visible text + node count. A blank shot with
`nodes: 0` means the renderer failed to load.

### 7.3 Audio â†’ transcript end-to-end

```powershell
# 1. synthesize real speech to 16 kHz WAV
powershell -ExecutionPolicy Bypass -File tools/make_speech.ps1

# 2. start the test (subscribes, clicks the mic, waits)
$p = Start-Process node -ArgumentList "tools/cdp_audio_e2e.cjs","9223","20000" -NoNewWindow -PassThru

# 3. play it through the speakers while the app is listening
(New-Object Media.SoundPlayer "$env:TEMP\opencode\speech16k.wav").PlaySync()
$p.WaitForExit()
```

Expected: `transcripts: ["interviewer: â€¦"]` with no phantom `candidate: you`.

### 7.4 AI paths without a paid key

(upstream InterviewCopilot baseline; this repo ships its own copies —
`tools/mock_provider.cjs` and `tools/cdp_mock_interview.cjs`.)

```powershell
Start-Process node -ArgumentList "tools/mock_provider.cjs","8787"   # http://127.0.0.1:8787
```

In the app's **API** tab use base URL `http://127.0.0.1:8787/v1`, key `mock-key`,
model `mock-model`. Register it as a **custom model** (Settings → API → Custom
Models), not as a bare `selectedModel`: the startup model picker drops any
`selectedModel` that is not an available id (`custom:<id>`), clearing a bare
name to `""`. Then click **Answer**, **Analyse Screen**, and **Chat** — the
mock logs `{stream, hasImage, model}` per request, proving streaming and vision.

### 7.5 Window show/hide

```powershell
powershell -ExecutionPolicy Bypass -File tools/win_visible.ps1 -ProcessName InterviewClaudePilte
```

`NO VISIBLE WINDOWS` after clicking **Show/Hide** (or `Ctrl+\`), a window handle
after pressing `Ctrl+\` again.

### 7.6 Saved transcription profiles end-to-end (v1.2.0)

```powershell
node tools/cdp_test_apis.cjs 9224       # flips provider, runs test-transcription + test-model Ã—2
node tools/cdp_test_profiles.cjs 9224   # add dummy profile (bad key) â†’ select â†’ expect HTTP 401 â†’
                                        # switch back â†’ test OK â†’ delete dummy â†’ state clean
```

`cdp_test_profiles.cjs` starts from the real settings, so it proves the whole
selection path without touching the user's Groq configuration.

### 7.7 Screenshot capture, overlay movement, mock interview

```powershell
node tools/cdp_check_screenshot_limit.cjs 9228   # this repo: 12 synthetic captures, 10 stick, tray restored
node tools/cdp_mock_interview.cjs 9228           # this repo: full 3-round x 10-question mock interview
```

(upstream also ships `cdp_check_capture.cjs` / `cdp_check_move.cjs` -- not ported yet;
the limit tool above covers the capture cap, and movement clamping is unchanged
from the upstream baseline.)

`cdp_mock_interview.cjs` replays a full mock interview against the model and
endpoint configured in the app and prints answers + latency per question.
The InterviewClaudePilte harness asks **30 questions -- 3 rounds x 10**
(Round 1 HR/intro, Round 2 technical, Round 3 behavioral & close) via
ask(mode:'chat'). Latest verified run (Nov 2026, against tools/mock_provider.cjs):
**30/30 streamed answers OK**, ~3.4-4.7 s each, 0 errors, 0 empty; provider log
shows 30 x POST /v1/chat/completions with stream: true. Any question that fails
or streams an empty answer flips the exit code to 1. To seed the mock endpoint,
add a `customModels` entry (id `mock-model`, baseURL `http://127.0.0.1:8787/v1`,
key `mock-key`) and set `selectedModel` to `custom:mock-model`; a bare
`selectedModel` is dropped to "" on launch by the startup model picker.
Restore the previous settings byte-identically afterwards.

### 7.8 Regression checklist

| Area touched | Must re-run |
| --- | --- |
| renderer/components | Â§7.2, click-through on a transparent area, each tab |
| audio/hook | Â§7.3 (real speech, silence, mic on) |
| AI/providers | Â§7.4 (answer + screen + chat) |
| transcription API / profiles | Â§7.6 (both providers) |
| settings | fresh run with deleted `%APPDATA%\interviewclaudepilte` |
| packaging config | Â§9 plus packaged smoke test (Whisper ready) |
| shortcuts/tray | each accelerator in Â§5.6, tray menu items |

---

## 8. Reverse engineering an Electron app

Use this to compare against any desktop app (including newer builds of the
reference).

### 8.1 Extract and read the package

```powershell
npx @electron/asar extract "$env:LOCALAPPDATA\Programs\InterviewHelpAI\resources\app.asar" .\asar-out
Get-ChildItem .\asar-out\package.json, .\asar-out\dist | Select-Object Name,Length
```

`package.json` gives the app version and entry point; `dist/index.html` and
`dist/assets/*.js` are the actual UI bundle. Search strings for feature names:

```powershell
Select-String -Path .\asar-out\dist\assets\*.js -Pattern "Billing|Ultra Undetectable|shortcut" -List
```

### 8.2 Attach a debugger and read the live DOM

Launch with `--remote-debugging-port=<port>`, then use the Chrome DevTools
Protocol:

```
GET  http://127.0.0.1:9222/json/list      â†’ targets + webSocketDebuggerUrl
Page.enable / Runtime.enable
Runtime.evaluate  { expression, returnByValue: true }   â†’ computed styles, innerText
Page.captureScreenshot                                    â†’ PNG of the real UI
```

`tools/cdp_smoke.cjs` is a minimal, dependency-free client (Node 18+ `fetch` and
global `WebSocket`).

### 8.3 When screenshots are blank

Chromium GPU-composited windows return blank with `PrintWindow`. Two other causes
of an all-black capture:

1. the app protects its window (`setContentProtection` /
   `WDA_EXCLUDEFROMCAPTURE`) â€” the reference defaults
   `{"ultraUndetectableMode": true}` in `%APPDATA%\interviewhelpai\settings.json`;
2. the overlay is transparent, so a desktop grab shows only what is behind it.

Fix for inspection only: set that setting to `false`, restart, then use CDP (which
is immune to capture protection because it reads the renderer's own surface).
**Restore the original file afterwards.**

### 8.4 Where apps keep their state

| What | Path |
| --- | --- |
| Reference install | `%LOCALAPPDATA%\Programs\InterviewHelpAI` |
| Reference settings | `%APPDATA%\interviewhelpai\settings.json` |
| Reference onboarding flag | `%APPDATA%\interviewhelpai\onboarding.done` |
| Debug port hint | `%APPDATA%\interviewhelpai\DevToolsActivePort` |
| This app's settings | `%APPDATA%\interviewclaudepilte\interview-claudepilte-settings.json` |
| Lazy Whisper models | `%APPDATA%\interviewclaudepilte\whisper-models` |
| Whisper temp WAVs | `%TEMP%\interview-claudepilte-whisper` |

### 8.5 Identify versions

- User agent from CDP `/json/version` gives `Chrome/<x> Electron/<y>`.
- `icudtl.dat` / `v8_context_snapshot.bin` confirm Electron.
- `app-update.yml` (if present) reveals the publisher/feed.

### 8.6 Reference inspection: FuryModule-Setup-1.2.12-x64.exe (Nov 2026 — static only)

InterviewClaudePilte was validated against a freshly downloaded
`FuryModule-Setup-1.2.12-x64.exe` (InterviewFury's own installer). The work was
**static inspection of the installer on disk; the installer was never executed**,
and **no FuryModule code, assets, or strings were copied into this project**.
Everything below is metadata visible without running the app:

- NSIS-3 (Unicode) installer, PE32, `FileVersion 1.2.12`, `CompanyName
  InterviewFury`, description "Audio module helper.", copyright 2026.
  It embeds `$PLUGINSDIR\app-64.7z` (~120 MB) plus the uninstaller and NSIS
  plugins.
- `app-64.7z` is a standard Electron distribution; the app itself lives in
  `resources/app.asar` (~2.25 MB) and ships `electron-updater` with a **generic
  provider** pointing at `https://interviewfury.com/updates/`, and
  `resources/app-update.yml` names the publisher `CN=Vinay Kumar Vanapalli`.
- The asar's own `package.json` lists `name: fury-module`, `version: 1.2.12`,
  `main: main-win.js`, `description: Audio module helper.` — i.e. a **thin
  shell whose intelligence is server-side** (the UI is loaded remotely from
  interviewfury.com), exactly the architecture Section 4 describes for the
  upstream InterviewHelpAI reference app.
- Bundled third-party pieces visible in the asar include `electron-updater`
  (with a code-signature verifier), Inter (same open font this project uses),
  a `soundcheck.wav`, a token-entry page and a set of small `lib/*.js` helpers
  with their `*.test.mjs` companions.
- Conclusion for this project: there is **nothing local to port** — the
  feature set is remote. InterviewClaudePilte stays an independent,
  clean-room implementation; the inspection only confirmed product/version
  identification and the shell's architecture (transparent, always-on-top,
  remote-configured). Temporary extraction directories used during the
  inspection were deleted afterwards and none of their contents are in this
  repository.
- Tooling note: [morluto/rea](https://github.com/morluto/rea) (MIT) was
  reviewed as a candidate MCP reverse-engineering toolkit. It was **not
  needed** here — `7z` + Node's `@electron/asar` covered the static analysis —
  so nothing was installed or configured.

---

## 9. Packaging and release

```powershell
npm run build
npm run package     # or: npx electron-builder --win nsis
```

Output: `release/InterviewClaudePilte Setup <version>.exe` (~212 MB in the
upstream build; re-measure after your own `npm run package`) and
`release/win-unpacked/` for smoke testing.

Size budget:

| Item | ~Size |
| --- | --- |
| Electron runtime | 90 MB |
| Whisper DLLs + `whisper-cli.exe` | 11 MB |
| Bundled `ggml-base.bin` | 141 MB |
| App asar (bundled JS/deps) | 54 MB |
| **Installer** | **212 MB** |

Rules:

- `files` ships only `dist/**/*` + `package.json`; main/preload are pre-bundled.
- `extraResources` ships `whisper/` (exe + `*.dll` + `models/ggml-base.bin`) and
  the three icon files.
- The installer is **per-user** (`perMachine: false`, `asInvoker`) â†’ no UAC.
- Nothing is signed. Windows SmartScreen will warn on first run.
- Never add a resource over 100 MB to git (GitHub hard limit); models stay out.

Release checklist:

1. Bump `version` in `package.json`.
2. `npm run build` (typecheck included).
3. `npm run package`.
4. Delete `%APPDATA%\interviewclaudepilte`, launch `release/win-unpacked/*.exe`,
   confirm: API tab opens, Whisper ready, audio transcribes, answer streams.
5. Attach the installer, note the version and size.

---

## 10. Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| Window invisible / blank | renderer failed to load or app not ready | run `npm run build`; check `dist/renderer/index.html` exists; CDP `nodes:` count |
| `The 'screen' module can't be used before the app 'ready' event` | module-level `screen` usage | keep `screen` calls inside `whenReady` |
| Buttons unclickable | missing `data-ui` on the container | add the attribute |
| Clicks land on the app instead of the window behind | hover state never re-enabled | ensure `[data-ui]` hit-testing still runs on `mousemove` |
| No transcript | model missing, mic/loopback failed, or silence gate | `whisper-cli --help`; check `getLoopbackSource`; play a real WAV; or switch Settings â†’ API â†’ Transcription to **API (cloud)** + **Test connection** |
| Transcription API `HTTP 401/403` | wrong/missing key | Settings â†’ API â†’ Transcription â†’ API Key; sent as `Authorization: Bearer <key>` |
| Transcription API `HTTP 404` | base URL includes the full endpoint | set Base URL to the root (`https://api.openai.com/v1`) â€” code appends `/audio/transcriptions` |
| Transcription garbled with API too | accents/noise in capture | check loopback device, raise speaker volume; API only hears what the PC plays |
| Transcript says only â€œyouâ€/â€œThank you.â€ | silence reaching whisper | keep `isSilent` threshold, do not lower it blindly |
| `error: 1 input file(s) failed` from whisper | a flag was given a value (`--print-progress false`) | booleans take no argument |
| PDF resume returns empty | scanned/image PDF (no OCR) or pdf-parse v2 installed | use a text PDF; pin `pdf-parse@1.1.1` |
| `ReferenceError: DOMMatrix is not defined` | pdf-parse v2 / pdfjs in main | require `pdf-parse/lib/pdf-parse.js` |
| `Provider not available: â€¦` | model id missing its `custom:` prefix | select from the dropdown or add the model |
| Answer never finishes | provider stalled | 120 s watchdog reports an error; check key/base URL |
| Installer ~500 MB | `ffmpeg` or `ggml-large-v3.bin` leaked into resources | check `extraResources` filters |
| `whisper-cli.exe` crashes at start | mixed DLL/model versions | ship the whole `resources/whisper` folder consistently |

---

## 11. Known limitations and roadmap

Known limitations (deliberate, documented):

- Electron 28 (reference uses 43); behavior matches, runtime is older.
- No code signing â†’ SmartScreen warning; no auto-update wiring
  (`electron-updater` is a leftover dependency).
- Screenshots capture the **primary display** only.
- No OCR: image-only PDFs produce no text.
- Whisper Base is bundled; bigger models download once on selection.
- `StealthManager` Win32 helpers exist but only `setContentProtection` (capture
  exclusion) is wired into the window; task-manager/Alt-Tab hiding is not.
- Single language UI (answers can be generated in many output languages).

Sensible next steps:

1. Signature + auto-update feed if this ever ships to users.
2. Multi-monitor screenshot picker (currently primary display).
3. Wire `hideFromTaskManager` / `hideFromAltTab` from `StealthManager`.
4. Optional partial-transcript streaming (currently 3 s chunks).
5. Model picker that queries `/v1/models` from the configured endpoint.
