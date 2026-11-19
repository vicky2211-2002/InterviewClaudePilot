# CLAUDE.md — Working brief for AI coding agents

> **InterviewClaudePilte** is an independent, clean-room reimplementation of the
> workflow pioneered by [InterviewFury](https://interviewfury.com/) (its FuryModule
> desktop app). It does **not** contain any InterviewFury code — the original was a
> remote-loaded Electron shell, and this project rebuilds the same idea as a local,
> open app: a real-time interview assistant with editable APIs, an editable
> transcript, and a built-in remote Coach Console over LAN (PIN-protected, with
> live latency display). Reimplemented from scratch; no InterviewFury code is
> included.
>
> Historical note: this brief was adapted from the upstream **InterviewCopilot**
> project. Version numbers and verification results below (through v1.2.9)
> describe the upstream baseline; InterviewClaudePilte keeps its own version line
> (see `package.json`). Documentation adapted from the upstream project; the
> upstream project's own test history lives there.

Short, accurate context for this repository. For depth, read
[`ENGINEERING_GUIDE.md`](./ENGINEERING_GUIDE.md). For user-facing behavior, read
[`README.md`](./README.md). For free/fast API endpoints for answers, vision,
coding and reasoning, read [`PROVIDERS.md`](./PROVIDERS.md). For a paste-ready
prompt for the **Settings → Instructions** field (live-interview answer style,
resume-anchored), read [`INSTRUCTIONS.md`](./INSTRUCTIONS.md).

**Status:** (upstream InterviewCopilot baseline) feature-complete rebuild;
installer built and tested end-to-end in the upstream project (transcription,
answer, screen analysis, chat, custom API, PDF resume, hide/restore). Version
1.2.9 — Ctrl+H screenshot context cap raised 5 → **10**; `screenshots-update`
now sends `{ count }` instead of re-sending the multi-MB base64 array (the
renderer listener was a no-op; `Analyse Screen` still reads the array via
`getScreenshots()`). Upstream verification: `tools/cdp_check_screenshot_limit.cjs`
(fires 12 captures, asserts 10 stick, restores tray to empty) — ALL CHECKS PASS.
Ported into InterviewClaudePilte for v1.0.1 (same tool in `tools/`, same cap) —
re-verified in this repo (12 captures, 10 stick, tray restored).

**InterviewClaudePilte v1.0.1 status (Nov 2026):** installer rebuilt and
smoke-launched; renderer bundle carries the new IC logo (no shield);
settings restore byte-identical after tests. Full mock interview passes
end-to-end through the real ask pipeline: `tools/mock_provider.cjs` (mock
OpenAI-compatible streaming endpoint) + `tools/cdp_mock_interview.cjs`
(CDP) — 3 rounds × 10 questions (HR/intro, technical, behavioral & close),
**30/30 streamed answers OK**, ~3.4–4.7 s each, 0 errors, provider log shows
30 × `stream: true` chat completions. Seeding gotcha documented: the startup
model picker requires `selectedModel` to match an available id
(`custom:<id>`); a bare model name gets cleared to `""` on launch — seed a
`customModels` entry instead.

1.2.8 — transcription supports a selectable **Local
(offline whisper.cpp)** or **API (OpenAI-compatible `/audio/transcriptions`)**
provider. The API mode manages **multiple saved endpoints** (Settings → API →
Transcription → Add / Edit / Use / Delete; persisted as `transcriptionProfiles`
with `selectedTranscriptionProfile`; legacy flat fields are migrated once into a
named profile on first launch of v1.2.0). Verified end-to-end with Groq's free
`whisper-large-v3`: real-speech sentence transcribed exactly (HTTP 200), both
NVIDIA custom chat models `OK` via in-app Test, `test-transcription` IPC OK
(success on Groq key, clean HTTP 401 on a bad key), profile add / switch /
delete selection logic exercised via IPC, API path drops phantom fillers on
near-silent clips. v1.2.1: the OS cursor never changes over the overlay
(plain arrow everywhere — no hand/pointer/I-beam tell during screen share);
provider errors are key-sanitized before reaching the UI/toast/log; pressing
Answer with no captured audio shows a small neutral toast instead of the red
answer card; preflight failures (`NO_CONTEXT` / `NO_MODEL`) drop the answer
card. v1.2.2: every native HTML `title` tooltip (e.g. "Click to open dashboard",
"Start listening") was replaced with in-page `.tip[data-tip]` CSS tooltips —
native Chromium tooltips are separate OS popups **not** covered by the window's
capture protection, so they were visible on screen shares. v1.2.3: new **Screen
analysis (vision)** toggle in Settings (default ON) controls whether screenshots
are sent to the model; an optional **Vision model** dropdown lets you dedicate a
multimodal model to screenshots only ("Same as answer model" by default). If the
model rejects the image (e.g. vLLM without `--enable-multimodal`), the app now
automatically retries text-only with a neutral toast instead of a dead answer
card — the screen prompt notes that no image is available and the answer is
grounded in the transcript. v1.2.4: Ctrl+H now confirms each capture with a toast (“Screenshot captured (n/5)”) instead of capturing silently, and a startup toast warns when a global shortcut could not register (e.g. claimed by another app). v1.2.5: Ctrl+Delete toasts the delete result (“Screenshot deleted (n left)” / “Last screenshot deleted — none left” / “No screenshots to delete”); shortcut and in-app delete share one code path. v1.2.6: Ctrl+←/→ now travels up to ±25% of the screen work-area width (dynamic, previously hardcoded ±400 px), and a stored legacy offset is clamped at startup. v1.2.7: the ±25%-of-screen movement change was reverted at user request — Ctrl+←/→ is back to the hardcoded ±400 px cap, no dynamic screen math, no startup clamp. v1.2.8: the real movement bug fixed — the renderer shifted the overlay with CSS `padding-left`, which cannot go negative, so Ctrl+← never rendered. Now `transform: translateX` (±75% of the screen work-area width, 120 ms ease-out).

---

## What this is

A Windows desktop interview assistant (Electron overlay):

1. Captures system audio loopback (+ optional mic) in the renderer.
2. Transcribes with a **selectable provider** — offline whisper.cpp
   (`whisper-cli.exe`, bundled Base model) or an OpenAI-compatible
   speech-to-text API (OpenAI `whisper-1`, Groq `whisper-large-v3`,
   self-hosted faster-whisper). Default is Local; switch in
   Settings → API → Transcription (takes effect on the next audio chunk, no
   restart). The API mode supports **multiple saved endpoints** (Add / Edit /
   Use / Delete; `transcriptionProfiles` + `selectedTranscriptionProfile` in
   settings; flat legacy fields auto-migrate once into a named profile).
3. Answers with a **user-supplied** AI endpoint (OpenAI-compatible custom API, or
   OpenAI/Anthropic/Google/NVIDIA keys). No bundled subscription, no login.
4. Can answer from a screenshot for vision models ("Analyse Screen").
5. Runs as a transparent, always-on-top, click-through overlay with an optional
   "Ultra Undetectable Mode" (excluded from screen capture).
6. **InterviewClaudePilte additions:** an **editable transcript** (add / edit /
   delete segments live), **custom OpenAI-compatible API providers** managed from
   the dashboard (add / edit / delete), and a **Coach Console** — a
   PIN-protected web page served over LAN (default port `47821`) that a coach on
   the same network can open to watch the live transcript and streaming answers,
   send hints/chat, see RTT latency, edit the transcript, and toggle
   auto-answer / tone / session controls remotely. The candidate sees connected
   coaches and their RTT in the dashboard.

It reproduces the behavior/layout of the reference app
`interviewhelpai-Windows.exe` v1.3.5 (Electron 43.4.1) without copying its code.
The `Billing` tab is replaced by an `API` tab.

---

## Commands

```powershell
npm install                 # deps (no native modules)
npm run typecheck           # tsc across main/preload/renderer
npm run build               # esbuild main+preload, vite renderer -> dist/
npm run dev                 # source run (Vite + electron)
npm run package             # installer -> release/InterviewClaudePilte Setup <ver>.exe
```

Verification tools in this repo (app must run with `--remote-debugging-port=<port>`;
upstream InterviewCopilot ships more tools — smoke/audio/API/profile/capture/move —
that were not ported; use the commands below, or port them the same way if needed):

```powershell
node tools/cdp_check_screenshot_limit.cjs 9228   # Ctrl+H 10-screenshot cap: 12 synthetic captures, asserts 10 stick, restores tray
node tools/mock_provider.cjs 8787                # fake OpenAI-compatible streaming endpoint on :8787 (logs each request as JSON lines)
node tools/cdp_mock_interview.cjs 9228           # full 3-round × 10-question mock interview via ask(mode:'chat') — 30/30 streamed answers OK (Nov 2026)
```

---

## File map (current architecture)

| Path | Responsibility |
| --- | --- |
| `src/main/main.ts` | Window creation, IPC handlers, global shortcuts, tray, screenshots, `handleAsk` orchestration, 120 s watchdog |
| `src/main/ai/AIProviderManager.ts` | Provider registry, `resolveProvider`, streaming + vision, custom endpoints |
| `src/main/whisper/WhisperTranscriber.ts` | 3 s buffering, silence gate, filler/hallucination filter, WAV writing, `whisper-cli` spawn, lazy model download, or POSTs WAV to an OpenAI-compatible `/audio/transcriptions` endpoint when `transcriptionProvider: 'api'` (IPC: `test-transcription` → `testApiConnection()`) |
| `src/main/settings/SettingsManager.ts` | electron-store defaults + `settingsVersion` migrations |
| `src/main/context/ContextManager.ts` | Resume/JD parsing (pdf-parse v1, mammoth, txt) |
| `src/main/stealth/StealthManager.ts` | Win32 helpers (capture exclusion, toolwindow) — only capture exclusion is wired |
| `src/main/paths.ts` | Packaged-aware resource paths (`app.isPackaged` → `process.resourcesPath`) |
| `src/preload/preload.ts` | `contextBridge` → `window.electronAPI` |
| `src/preload/types.ts` | **byte-identical duplicate** of `src/shared/types.ts` |
| `src/shared/types.ts` | IPC contract + `Settings` (single source of truth) |
| `src/renderer/src/App.tsx` | Overlay state machine, click-through hit-testing, UI command dispatch |
| `src/renderer/src/components/*` | `CommandBar`, `Dashboard`, `CommandsTab`, `SettingsTab`, `ApiTab`, `ChatPanel`, `AnswerView`, `Keycap` |
| `src/renderer/src/hooks/useAudioCapture.ts` | Loopback/mic → 16 kHz PCM s16le → IPC |
| `resources/whisper/` | `whisper-cli.exe` + DLLs + `models/ggml-base.bin` (141 MB) |
| `tools/` | Verification scripts (see above) |

`resources/ffmpeg/` is legacy and is **not** packaged — never reintroduce FFmpeg
for audio; loopback happens in the renderer.

---

## Invariants — breaking these breaks the app

1. `src/shared/types.ts` and `src/preload/types.ts` stay **identical**. They are
   bundled separately; drift produces silent IPC mismatches.
2. Every interactive container carries `data-ui`. Click-through is decided by
   `document.elementFromPoint(...).closest('[data-ui]')`; without the attribute a
   panel is invisible to the mouse.
3. `html`, `body`, `#root` stay transparent — the overlay must not tint the screen.
4. IPC channel names match on both sides (`ask`, `audio-chunk`, `ai-response-chunk`,
   `ai-response-end`, `ai-response-error`, `ai-transcript`, `set-ignore-mouse`, …).
5. Audio stays 16 kHz / mono / 2 bytes per sample. If that changes, update
   `writeWav()` in `WhisperTranscriber.ts` too.
6. `extraResources` must keep shipping only `ggml-base.bin` / `ggml-tiny.bin`.
   `ggml-large-v3.bin` is ~3 GB and must never enter the installer or git.
7. `pdf-parse` stays on v1 and is imported as `pdf-parse/lib/pdf-parse.js`
   (v2 needs `DOMMatrix`/`ImageData`, which do not exist in Electron main).
8. whisper.cpp boolean flags (`-nt`, `-np`, `-pp`) take **no** value; passing one
   makes `whisper-cli` treat it as an input file and fail with
   `1 input file(s) failed`.
9. The overlay window is created only inside `app.whenReady()` (`screen` module).
10. Do not lower the silence gate (`isSilent`, RMS < 0.004) to "get more
    transcript" — whisper then hallucinates `you` / `Thank you.` on noise.

---

## Settings and state

| What | Where |
| --- | --- |
| Settings | `%APPDATA%\interviewclaudepilte\interview-claudepilte-settings.json` |
| Lazy Whisper models | `%APPDATA%\interviewclaudepilte\whisper-models` |
| Temp WAVs | `%TEMP%\interview-claudepilte-whisper` |

`settingsVersion` is `3`; migration 2 moved the default Whisper model from
`large-v3` to `base` so a fresh install does not attempt a 3 GB download, and
migration 3 seeds a saved transcription profile from the legacy flat
`transcriptionApi*` fields when an API was configured (the profile list is the
UI source of truth; flat fields remain a fallback).

Model resolution in `settings.selectedModel`:

- `openai:gpt-4o` / `anthropic:…` / `google:…` / `nvidia:…` → built-in provider
- `custom:<id>` → entry from `customModels`
- bare name → generic OpenAI-compatible endpoint

If nothing resolves, the app shows a neutral toast
`No AI model configured — open Settings → API` (the Answer card is dropped,
not opened in red).

---

## Build facts

- Electron **28.0.0** pinned (reference uses 43; behavior used here exists in both).
- Renderer: React 18 + Tailwind 3 + Vite 5 (`base: './'` for `file://`).
- Main/preload: esbuild, single CJS bundle each, `--target=node18`,
  `--external:electron`.
- Installer: NSIS, per-user, `asInvoker`, unsigned → SmartScreen warns.
- Size: Electron ~90 MB + Whisper ~11 MB + `ggml-base.bin` 141 MB + asar ~54 MB
  ⇒ **~212 MB** installer.

---

## Known limitations

Electron 28 (not 43); unsigned with no auto-update; screenshots are primary
display only; no OCR for scanned PDFs; Whisper Base bundled (bigger models
download on demand); `StealthManager` task-manager/Alt-Tab hiding exists as code
but is not wired; UI is English-only (answers can be any output language).

---

## Related documents

| File | Content |
| --- | --- |
| `README.md` | User guide: shortcuts, API setup, transcription, build |
| `ENGINEERING_GUIDE.md` | Architecture, build method, update playbook, verification toolkit, reverse-engineering notes |
| `MULTI_AGENT_PROJECT_PLAN.md` | Historical plan; header table records what shipped |
| `AGENT_SKILLS_SETUP.md` | Optional agent-role catalog (generic tooling reference) |
