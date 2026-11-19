# InterviewClaudePilte

## What is this?

> **InterviewClaudePilte** is an independent, clean-room reimplementation of the
> workflow pioneered by [InterviewFury](https://interviewfury.com/) (its FuryModule
> desktop app). It does **not** contain any InterviewFury code — the original was a
> remote-loaded Electron shell, and this project rebuilds the same idea as a local,
> open app: a real-time interview assistant with editable APIs, an editable
> transcript, and a built-in remote Coach Console over LAN (PIN-protected, with
> live latency display). Reimplemented from scratch; no InterviewFury code is
> included.

InterviewClaudePilte is a desktop interview assistant: a transparent, always-on-top
overlay that listens to interview audio, transcribes it locally, and generates
answers with an AI model you configure yourself.

> **New here?** Read **[USER_GUIDE.md](./USER_GUIDE.md)** — the full how-to-use
> manual (first run, hotkeys, Coach Console step-by-step, troubleshooting).

The UI is a desktop overlay — a floating command bar, a white dashboard card,
a dark chat bar, and an answer card — not a browser page.

> Historical note: this documentation was adapted from the upstream
> **InterviewCopilot** project. Verification results quoted below (e.g. the Groq
> end-to-end check) describe the upstream baseline unless marked otherwise.

## What it does

| Action | Shortcut | Behavior |
| --- | --- | --- |
| Generate Answer | `Ctrl+Enter` | Answers the question just asked, using the live transcript as context |
| Analyse Screen | `Ctrl+Shift+Enter` | Captures the screen, then answers using what is visible plus the transcript |
| Chat with AI | `Ctrl+Alt+Enter` | Opens the chat bar (optional "Use Screen" toggle for vision models) |
| Reset Context | `Ctrl+R` | Clears transcript, screenshots, answers, and chat |
| Start / Stop Listening | `Ctrl+Shift+L` | Toggles live transcription |
| Take Screenshot | `Ctrl+H` | Manual capture; each press shows a toast confirming the shot was captured (keeps the newest 10) |
| Delete Last Screenshot | `Ctrl+Delete` | Removes the newest screenshot from context (toast confirms) |
| Show / Hide App | `Ctrl+\` | Hides the overlay completely; press again to bring it back |
| Move App | `Ctrl+←` / `Ctrl+→` | Slides the overlay horizontally — both directions, ±75% of the screen |
| Transparency | `Ctrl+[` / `Ctrl+]` | Lowers / raises overlay opacity |
| Scroll Answers | `Ctrl+Shift+↑/↓` | Scrolls the answer, then jumps to the previous/next answer at the edges |
| Quit | `Ctrl+Q` | Exits (also available from the tray menu) |

Clicking anywhere outside the app's own widgets passes the click through to the
window underneath, so the overlay never gets in the way during an interview.

## InterviewClaudePilte additions

Everything above is inherited from the original feature set. On top of it,
InterviewClaudePilte adds:

- **(a) Editable transcript** — add, edit, and delete transcript segments live.
  The transcript is treated as editable working state, not a read-only log, so
  you can fix a mis-heard word or drop a stray segment before it reaches the model.
- **(b) Custom API providers** — add, edit, and delete OpenAI-compatible
  endpoints from the dashboard (**Settings → API**). No rebuild or config-file
  editing required; changes apply to the next request.
- **(c) Coach Console** — a PIN-protected web page served over your LAN
  (e.g. `http://<your-pc-ip>:47821/`) that a friend or coach on the same Wi-Fi
  can open on a phone or a second PC. The coach can watch the live transcript
  and the streaming answers, send hints/chat messages, see the live connection
  latency (RTT), edit the transcript, and toggle auto-answer / tone / session
  controls remotely. The candidate sees the connected coaches and their RTT
  in the dashboard. The console page is plain HTML/JS (v1.0.3 fixes the page so
  it connects reliably). If a phone shows "connecting…" forever on the same
  Wi-Fi, the Coach tab shows all detected addresses, a `http://localhost:<port>/`
  self-test hint, router-isolation / mobile-data warnings, and a one-click
  **Allow through Windows Firewall** button (elevated `netsh` rule for TCP
  `47821`, private profile — a UAC prompt appears). Step-by-step instructions
  for the coach flow: [USER_GUIDE.md](./USER_GUIDE.md).
- **(d) 10-screenshot context** — `Ctrl+H` keeps the newest **10** screenshots
  for vision models (upstream kept 5); oldest are dropped past the cap, and
  `Ctrl+Delete` removes the newest. The capture toast shows `n/10`.
- **(e) Refreshed IC logo** — a gradient **IC** tile (replacing the old shield)
  in the floating command bar. It is drawn inside the overlay window, so when
  Ultra Undetectable Mode is on (default) it disappears from screen shares and
  recordings together with everything else in the window.

## Configure the AI

Open the dashboard (IC logo in the command bar, or `Ctrl+\`), then the **API** tab. On first run
this tab opens automatically.

- **Custom API** — any OpenAI-compatible endpoint: base URL (for example
  `https://openrouter.ai/api/v1`, `http://localhost:11434/v1`, Groq, NVIDIA NIM,
  LM Studio, LiteLLM, vLLM, your own server), an API key, and the model name.
  Press **Add**, then **Test** to confirm.
- **Provider API Keys** — optional built-in providers (OpenAI, Anthropic, Google,
  NVIDIA). Any provider with a key appears in the model dropdown.

Nothing is sent anywhere except the endpoint you configure.

> **Free providers & models:** see [PROVIDERS.md](./PROVIDERS.md) — a list (verified
> Nov 2026, upstream InterviewCopilot baseline) of fast **free** endpoints for
> answers, vision/image upload, coding and reasoning (Gemini, Groq, NVIDIA NIM,
> OpenRouter, Cerebras), with exact Base URLs and model IDs you can paste into
> Custom API.

> **Interview answer style:** see [INSTRUCTIONS.md](./INSTRUCTIONS.md) — a
> paste-ready **Instructions** prompt for Settings → Instructions (resume
> anchoring, technical vs behavioural/HR vs non-tech handling, speakable
> plain-English answers, 1,489 chars). Applies to the very next answer.

## Transcription

You choose how speech becomes text in **Settings → API → Transcription**:

- **Local (offline)** — [whisper.cpp](https://github.com/ggerganov/whisper.cpp), no cloud, no key. This is the default.
  - The **Base** model (~142 MB) ships with the installer and works offline.
  - Larger models (small / medium / large-v3) download once into
    `%APPDATA%\interviewclaudepilte\whisper-models` the first time they are selected.
- **API (cloud)** — every ~3 s of audio is POSTed to an OpenAI‑compatible
  `…/audio/transcriptions` endpoint (multipart WAV). Works with OpenAI `whisper-1`,
  **Groq `whisper-large-v3`** (recommended; free tier at console.groq.com), or any
  self‑hosted faster‑whisper server. The Groq setup was verified end‑to‑end in the
  upstream InterviewCopilot project (Nov 2026 — Base URL
  `https://api.groq.com/openai/v1`, Model `whisper-large-v3`); re-verify with
  **Test connection** on your own key.
  **Multiple saved endpoints** are supported: **Add** a named API (name,
  Base URL, key, model), **Use** to switch the active one, **Edit** / **Delete**
  as needed. **Test connection** checks the active saved API. Your flat Base
  URL / key / model from earlier versions is migrated into a saved profile on
  first launch — nothing is lost. Use this when the local models mis-hear
  technical vocabulary/accents.
  Note: NVIDIA NIM has **no** transcription endpoint (verified — HTTP 404), so
  NVIDIA keys work for answers only, not for speech.

Either way:

- Audio is captured with desktop loopback (Web Audio), so Stereo Mix or a virtual
  cable is **not** required. A microphone can be enabled alongside it.
- Silent audio is discarded before transcription, which prevents phantom
  segments on quiet stretches.

## Customize answers

**Settings** tab:

- **Output Language** for AI responses.
- **Resume Context** — pick a PDF/DOCX/TXT resume; its text is added to every prompt.
- **Instructions** — up to 2000 characters, auto-saved.
- **Ultra Undetectable Mode** — hides the window from screen capture/recording.
  The cursor never changes over the overlay either (always a plain arrow — no
  hand/pointer/I-beam over invisible widgets during a screen share), and
  provider errors are sanitized so no API key can appear in the UI (v1.2.1).
  Hover hints ("Click to open dashboard", "Start listening") are in-page
  tooltips hidden by the same protection — native OS tooltips are never shown
  (v1.2.2). Pressing Answer with no audio captured shows a small neutral
  toast, not a red error card.
- **Screen vision control** (v1.2.3) — choose whether "Analyse Screen" sends
  screenshots to the model, and optionally dedicate a multimodal model to
  screenshots (Settings → Screen analysis). If your endpoint rejects images
  (e.g. vLLM without `--enable-multimodal`), the app automatically answers
  from the transcript instead of failing.

## Development

### Requirements

- Windows 10/11 (x64) — the installer is Windows-only.
- Node.js (LTS, 18+) and npm.
- ~500 MB free disk for the build; the resulting installer is ~212 MB.
- A PC that can play audio through its speakers (loopback capture), with or
  without a microphone.

### Run from source

```powershell
npm install
npm run dev            # run from source (Vite renderer + electron)
npm run build          # typecheck, bundle main/preload, build renderer
npm run package        # build release/InterviewClaudePilte Setup <version>.exe (NSIS)
```

`npm run package` produces a Windows NSIS installer in `release/`
(`release/InterviewClaudePilte Setup <version>.exe`, per-user install, no admin
prompt). The build bundles `resources/whisper` (CLI + Base model) as extra
resources; nothing else is downloaded at install time. (`npx electron-builder
--win nsis` is the underlying command if you prefer calling it directly.)

### Verification status (v1.0.3, Nov 2026)

- `npm run build` (typecheck + bundles) is clean; renderer bundle contains the
  IC logo and no shield assets, and **zero native `title=` attributes** (all
  tooltips are capture-protected in-page `data-tip` ones — native OS/browser
  tooltips are visible on screen shares).
- **Coach Console fixed and verified live in v1.0.3** (the v1.0.2 release had a
  syntax error in the console page's inline script — every client sat on
  "Connecting…" forever regardless of network; plus a second string-escaping
  syntax error in the transcript Edit/Delete buttons, an undefined `showToast`,
  and a stubbed RTT widget). In the packaged app, in a real browser: page loads
  with **zero console errors**, WebSocket **Connected** (readyState 1),
  candidate snapshot syncs, coaches register server-side, RTT live (**6 ms**),
  and a hint was sent console→overlay end-to-end.
- Coach Console connectivity: same LAN, the page itself is same-origin
  (HTTP + WS on port 47821). If a phone shows "connecting…" on v1.0.3+, it is
  Windows Firewall (use the in-app **Allow through Windows Firewall** button
  or `netsh advfirewall firewall add rule name="InterviewClaudePilte Coach
  Bridge" dir=in action=allow protocol=TCP localport=47821 profile=private`)
  or router AP/client isolation (guest Wi-Fi / Android hotspot client isolation
  — use a non-guest network, or view the console on the hotspot host).
- **v1.0.2 display note:** v1.0.2 added the firewall diagnostics but its
  installer still ships the broken console page — treat v1.0.2 as superseded
  for Coach Console use and update to v1.0.3.
- `tools/cdp_check_screenshot_limit.cjs` passes: 10 captures stick, the
  11th/12th are clipped, tray restored to empty (Ctrl+H context cap = 10).
- **Full mock interview passes end-to-end** (`tools/cdp_mock_interview.cjs` +
  `tools/mock_provider.cjs`): 3 rounds × 10 questions (HR/intro, technical,
  behavioral & close) asked through the real `ask(mode: 'chat')` pipeline into
  the OpenAI-compatible mock endpoint — **30/30 streamed answers**, ~3.4–4.7 s
  each, 0 errors, 0 empty; provider log shows 30 × `POST /v1/chat/completions`
  with `stream: true`. Settings restored byte-identically afterwards.
- Live run: Whisper ready, overlay created, Coach Console HTTP 200; wrong PIN
  rejected; coach → candidate transcript add verified end-to-end over CDP.
- Tabs (Commands / Transcript / Coach Console / Settings / API) render and
  accept clicks; Ultra Undetectable Mode is on by default
  (`undetectableMode` / `invisibleOnScreenShare` → `setContentProtection`).
- **Not yet covered by automated tests:** real loopback audio transcription,
  live answers against a paid endpoint, and actual invisibility inside a real
  screen-sharing session — verify in your own meeting setup.
- Global hotkeys are not available while InterviewCopilot (or any app that
  claimed the same accelerators) is running — run one at a time.

### Layout

```
src/main/       Electron main process: overlay window, IPC, shortcuts, tray,
                screenshots, answer orchestration
src/main/ai/    Provider manager (OpenAI/Anthropic/Google/NVIDIA/custom, streaming + vision)
src/main/whisper/  whisper.cpp wrapper (lazy model download, WAV wrapping, silence gate)
src/main/bridge/   LAN Coach Console hub (HTTP + WebSocket, PIN auth, RTT tracking)
src/preload/    contextBridge API (types.ts re-exports src/shared/types.ts)
src/renderer/   React + Tailwind overlay UI
src/shared/     Shared types
tools/          Verification tools (cdp_check_screenshot_limit.cjs: fires 12 synthetic captures, asserts the
                10-shot cap, restores the tray; mock_provider.cjs + cdp_mock_interview.cjs: 3-round × 10-question
                mock interview through the real ask pipeline)
```

### Settings location

`%APPDATA%\interviewclaudepilte\interview-claudepilte-settings.json`
