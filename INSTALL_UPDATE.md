# Install / Update Guide — InterviewClaudePilte

> **InterviewClaudePilte** is an independent, clean-room reimplementation of the
> workflow pioneered by [InterviewFury](https://interviewfury.com/) (its FuryModule
> desktop app). It does **not** contain any InterviewFury code — the original was a
> remote-loaded Electron shell, and this project rebuilds the same idea as a local,
> open app: a real-time interview assistant with editable APIs, an editable
> transcript, and a built-in remote Coach Console over LAN (PIN-protected, with
> live latency display). Reimplemented from scratch; no InterviewFury code is
> included.
>
> Historical note: this guide was adapted from the upstream **InterviewCopilot**
> project. Version numbers referenced below (up to v1.2.9) and verification
> results describe the upstream baseline; this project keeps its own version line
> (`package.json`, currently `1.0.1`). Where the upstream docs mentioned a
> prebuilt installer, note that this repo does not ship one — build your own with
> `npm run package`.

This document explains how to install InterviewClaudePilte for the first time, and how to
update an existing install without breaking anything.

| Item | Value |
|------|-------|
| Installer you build | `release/InterviewClaudePilte Setup <version>.exe` |
| Prebuilt installer in this repo | **None** — build it yourself with `npm run package` |
| GitHub repo | https://github.com/vicky2211-2002/InterviewClaudePilot |
| Default install folder | `C:\Users\<YourName>\AppData\Local\Programs\InterviewClaudePilte\InterviewClaudePilte.exe` |
| Settings file (user data) | `%APPDATA%\interviewclaudepilte\interview-claudepilte-settings.json` |
| Whisper models | `%APPDATA%\interviewclaudepilte\whisper-models` |
| Installer type | NSIS, **per-user**, no admin rights required (`asInvoker`) |

---

## 1. Pre-install checklist

Before you install or update:

1. **Close every InterviewClaudePilte process.**
   ```powershell
   Get-Process -Name InterviewClaudePilte -ErrorAction SilentlyContinue | Stop-Process -Force
   ```
2. **Backup your settings** (optional but recommended):
   ```powershell
   Copy-Item "$env:APPDATA\interviewclaudepilte\interview-claudepilte-settings.json" "$env:TEMP\interviewclaudepilte-settings-backup.json"
   ```
3. Free at least **300 MB** on the drive (the installer is ~212 MB; the app is ~200 MB).
4. No antivirus/group policy blocks required — the installer is unsigned and may trigger SmartScreen (choose **More info → Run anyway** if blocked).

---

## 2. Install for the first time

### Option A — Run the installer with UI (recommended for most users)
```powershell
Start-Process "C:\Users\Shivani Babar\interviewclaudepilte\release\InterviewClaudePilte Setup <version>.exe"
```
Follow the wizard; accept the default install folder.

### Option B — Silent install (for automated/scripted setups)
```powershell
Start-Process "C:\Users\Shivani Babar\interviewclaudepilte\release\InterviewClaudePilte Setup <version>.exe" -ArgumentList '/S' -Wait
```
The `/S` flag runs the NSIS installer silently. The app installs to
`%LOCALAPPDATA%\Programs\InterviewClaudePilte`.

### After install
1. Launch via the Start Menu shortcut **InterviewClaudePilte** (or double‑click the install path).
2. The first launch creates the settings file automatically with the following defaults:
   * Stealth mode: **enabled** (invisible on screen share, hidden from taskbar)
   * Whisper model: `ggml-base.bin` (already bundled; ~142 MB)
   * **Transcription**: **Local (offline)** by default — switch to **API (cloud)** in the same tab if local accuracy isn't enough (see section 9.1)
   * No AI model is configured yet — open **Settings → API** and add your provider/key/model
3. Verify the installed version:
   ```powershell
   (Get-Item "$env:LOCALAPPDATA\Programs\InterviewClaudePilte\InterviewClaudePilte.exe").VersionInfo
   ```

---

## 3. Update an existing install (e.g., v1.0.0 → the current version, upstream baseline v1.2.9)

1. **Close the running app** (same command as section 1).
2. Run the new installer (either with UI or silently):
   ```powershell
   Start-Process "C:\Users\Shivani Babar\interviewclaudepilte\release\InterviewClaudePilte Setup <version>.exe"
   # or silently:
   # Start-Process "C:\Users\Shivani Babar\interviewclaudepilte\release\InterviewClaudePilte Setup <version>.exe" -ArgumentList '/S' -Wait
   ```
3. Your settings and models are preserved — the installer only overwrites program files.
4. Launch the app and confirm **footer/version** shows the new version and that your saved custom models are still present in **Settings → API**.

> **Note (upstream InterviewCopilot baseline — v1.1.0 through v1.2.9):** v1.1.0 added the transcription provider switch (Local/API), v1.1.1 verified both providers end‑to‑end, v1.2.0 adds **saved transcription endpoints** (add / edit / use / delete multiple STT APIs in Settings → API → Transcription), and v1.2.1 makes the overlay undetectable to cursor tracking (plain arrow cursor everywhere, no hand/pointer/I-beam changes over invisible widgets) and sanitizes provider errors so no API key can appear in the UI. v1.2.2 replaces every native hover tooltip (e.g. "Click to open dashboard") with in-page ones hidden by the capture protection — native OS tooltips were visible on screen shares. v1.2.3 adds a Screen vision toggle + optional vision model in Settings, and automatically falls back to a text-only answer when a model rejects screenshots (e.g. vLLM without --enable-multimodal). v1.2.4 makes Ctrl+H confirm each captured screenshot with a toast (“Screenshot captured (n/5)”) and toasts at startup if a global shortcut could not register (e.g. another app claimed it) — previously both were silent. v1.2.5 adds the same confirmation toast to Ctrl+Delete (“Screenshot deleted (n left)” / “No screenshots to delete”) — the shortcut and the in-app delete now share one code path. v1.2.6 changes Ctrl+←/→ horizontal movement from a hardcoded ±400 px to a dynamic ±25% of the screen work-area width, and clamps any stored legacy offset at startup. v1.2.7 reverts the v1.2.6 movement change at the user’s request — Ctrl+←/→ is back to the hardcoded ±400 px with no startup clamp; the ±25%-of-screen dynamic cap is retired. v1.2.8 fixes horizontal movement for real: the renderer used CSS `padding-left`, which cannot go negative, so Ctrl+← never rendered (only Ctrl+→ worked). The overlay now slides via `transform: translateX` with a 120 ms transition, and the travel limit is ±75% of the screen work-area width in both directions. The installer picks up the updated renderer automatically. Upgrading from ≤ v1.1.x seeds your existing flat API configuration (e.g. the Groq `whisper-large-v3` setup) into a saved profile named `whisper-large-v3` on first launch — nothing is lost.

---

## 4. Verify the install

### Smoke test (recommended)
```powershell
Start-Process "$env:LOCALAPPDATA\Programs\InterviewClaudePilte\InterviewClaudePilte.exe" -ArgumentList "--remote-debugging-port=9228"
Start-Sleep -Seconds 15   # Whisper model load takes a few seconds; watch for "[Whisper] ready"
```
Expect the app log to show `[Whisper] ready` and `overlay window created` (run the exe
from a console or check `%TEMP%\*.log` if you redirect output). For an automated
interaction check, run this repo's CDP tool against it:

```powershell
node tools/cdp_check_screenshot_limit.cjs 9228   # asserts the 10-shot capture cap; Ctrl+H path
```

For a full end-to-end answer-pipeline check (no paid key required), see
`tools/mock_provider.cjs` + `tools/cdp_mock_interview.cjs` (3 rounds x 10 questions,
30/30 streamed answers verified Nov 2026).
(upstream InterviewCopilot also ships `cdp_smoke.cjs`, `cdp_audio_e2e.cjs`,
`cdp_test_apis.cjs`, `cdp_test_profiles.cjs`, `cdp_check_capture.cjs`, `cdp_check_move.cjs`
-- not ported to this repository yet.)

### Manual check
* Command bar is visible at top of screen
* `Ctrl+Shift+L` toggles listening
* `Ctrl+\` hides/restores the overlay
* `Ctrl+Enter` triggers an AI answer (requires an API key)
* Tray icon is visible with Show/Hide, Open Dashboard, Quit

---

## 5. Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| "Installation failed" / blocked by SmartScreen | Unsigned installer | Click **More info → Run anyway** |
| App doesn't launch after install | Install folder permissions or missing VC++ runtime | Re-run installer as-is (no admin needed); if still failing, uninstall via **Settings → Apps → Installed apps → InterviewClaudePilte → Uninstall** (or the uninstaller in `%LOCALAPPDATA%\Programs\InterviewClaudePilte\`), then reinstall |
| Old UI shows after update | Cached copy in `win-unpacked` or old shortcut pointing to old path | Delete `%LOCALAPPDATA%\Programs\InterviewClaudePilte` entirely and reinstall silently (`/S`) |
| Custom model still 404 | Wrong Base URL (must end with `/v1` for OpenAI‑compatible endpoints) | Open **Settings → API**, edit the model, set Base URL to `https://integrate.api.nvidia.com/v1` (or your endpoint’s `/v1` root), click **Save** |
| Coach Console: phone/browser shows "connecting" forever | Before v1.0.3: broken console page (syntax error). On v1.0.3+: Firewall / router AP-isolation / mobile data | If on v1.0.2 or older: update to v1.0.4 first. Otherwise Coach tab -> **Allow through Windows Firewall** (UAC), or elevated: `netsh advfirewall firewall add rule name="InterviewClaudePilte Coach Bridge" dir=in action=allow protocol=TCP localport=47821 profile=private` - if it persists: router AP/client isolation (use non-guest SSID or phone hotspot host), or mobile data (turn off). Self-test: `http://localhost:47821/` must load on this PC; see USER_GUIDE.md §5.4 |
| "Analyse Screen" doesn't use screenshots / says "Model has no multimodal processing" | Screen Vision OFF, or model isn't multimodal, or endpoint rejects images | 1) Settings → API → Screen analysis (vision) → toggle **ON** 2) Use a multimodal model (GPT-4o, Claude 3.5 Sonnet, Gemini 1.5 Pro/Flash, NVIDIA Nemotron 3 Ultra Omni) 3) If using vLLM/self-hosted: start with `--enable-multimodal`. Vision status: CommandBar shows 🟢 green eye = ON, ⚪ gray = OFF |
| "No audio captured yet" when pressing Answer | Listening is OFF, or no transcription provider configured, or audio was silent | 1) Press `Ctrl+Shift+L` to start listening (red mic icon = ON) 2) Settings → API → Transcription: configure Local (offline) or API (cloud) 3) Speak/play interview audio. Error now shows `Listening: ON/OFF | Transcript segments: N` + fix checklist |
| Multiple screenshots not sent to vision | Pre-v1.0.4: only last screenshot was used | Update to v1.0.4+. Now all screenshots (up to 10 via `Ctrl+H`) are sent simultaneously. CommandBar badge shows count. |
| Custom model capabilities unknown / wrong model picked | No capability labels on custom models | Update to v1.0.5+. Settings → API → Custom API → when adding/editing a model, tick **C** (coding), **T** (text), **I** (image/vision), **R** (reasoning). Badges `C T I R` appear on the model card for instant recognition. |
| Settings not loaded | Corrupt `settings.json` | Restore backup from step 1.2, or delete the file (app will regenerate defaults on next launch) |
| Larger Whisper model missing | Not bundled; downloads on first use | Settings → API → Transcription → Whisper model → pick `small`/`medium`/`large-v3`; wait for one-time download to `%APPDATA%\interviewclaudepilte\whisper-models` |
| Transcription garbage / mishears technical words | Local model too small (base) | Switch **Settings → API → Transcription → Whisper model** to `small`/`medium`, or switch the provider to **API (cloud)** with Base URL `https://api.openai.com/v1` (or Groq `https://api.groq.com/openai/v1`), model `whisper-1` — then click **Test connection** |
| Transcription API fails with 401/403 | Wrong or missing key | Re-check the key in Settings → API → Transcription → API Key; the key is sent as `Authorization: Bearer …` |
| Transcription API fails with 404 | Wrong base URL | The path `/audio/transcriptions` is appended automatically — set Base URL to the `/v1` root, e.g. `https://api.openai.com/v1`, not to the full endpoint |
| Build fails for source | Missing node_modules or TypeScript error | `npm ci && npm run build` |
| Installer doesn't appear in Program Files | Expected for per-user install | It installs under `%LOCALAPPDATA%\Programs`, not `C:\Program Files` |

---

## 6. Building the installer from source (for developers)

```powershell
# 1. Build renderer + main/preload bundles
npm install
npm run build

# 2. Create NSIS installer (per-user, ~212 MB in the upstream build)
npm run package
# Output: release\InterviewClaudePilte Setup <version>.exe
# (npm run package is electron-builder --win nsis; the output name comes from
#  electron-builder's default: <productName> Setup <version>.<ext>)
```

Version is controlled by `package.json` → `"version"` (currently `1.0.5` — bump as needed).

---

## 7. Where everything lives

| What | Path |
|------|------|
| Source | `C:\Users\Shivani Babar\interviewclaudepilte\` |
| Installer | `release\InterviewClaudePilte Setup <version>.exe` |
| Installed app | `%LOCALAPPDATA%\Programs\InterviewClaudePilte\SystemHost.exe` |
| User settings | `%APPDATA%\interviewclaudepilte\interview-claudepilte-settings.json` |
| Whisper models | `%APPDATA%\interviewclaudepilte\whisper-models\` (downloaded on demand) |
| Temp audio | `%TEMP%\interview-claudepilte-whisper\` |
| Tools | `tools/cdp_check_screenshot_limit.cjs`, `tools/mock_provider.cjs`, `tools/cdp_mock_interview.cjs` (this repo; upstream also ships smoke/audio/API/profile/capture/move — not ported) |
| Git remote | https://github.com/vicky2211-2002/InterviewClaudePilot |

---

## 8. Quick reference — commands

```powershell
# Close all instances
Get-Process -Name InterviewClaudePilte -ErrorAction SilentlyContinue | Stop-Process -Force

# Install silently
Start-Process "C:\path\to\InterviewClaudePilte Setup <version>.exe" -ArgumentList '/S' -Wait

# Launch with debug port for smoke test
Start-Process "$env:LOCALAPPDATA\Programs\InterviewClaudePilte\InterviewClaudePilte.exe" -ArgumentList "--remote-debugging-port=9228"
Start-Sleep -Seconds 15

# Smoke test (screenshot-cap tool — see Section 4)
node tools/cdp_check_screenshot_limit.cjs 9228

# Backup settings
Copy-Item "$env:APPDATA\interviewclaudepilte\interview-claudepilte-settings.json" "$env:TEMP\ic-backup.json"

# Restore backup
Copy-Item "$env:TEMP\ic-backup.json" "$env:APPDATA\interviewclaudepilte\interview-claudepilte-settings.json" -Force
```

---

## 9. After install - first 5 minutes

> **Full manual:** [USER_GUIDE.md](./USER_GUIDE.md) explains the whole app (command bar, hotkeys, coach console step-by-step, troubleshooting) - start there if anything below is unclear.

1. Open **Settings → API**.
2. Check **Base URL** for your custom provider (e.g., NVIDIA NIM: `https://integrate.api.nvidia.com/v1`).
3. Click **Test** next to the model name — you should see a short response.
4. Under **Transcription**, confirm the provider is **Local (offline)** (default). If the local model mis-hears questions, switch to **API (cloud)**: add a saved API (name, Base URL, key, model — e.g. Groq `whisper-large-v3`), make sure it shows **Active**, then click **Test connection** (see section 9.1).
5. Start listening with `Ctrl+Shift+L` and say anything — the transcript appears under the command bar.
6. (Recommended) Upload your resume under **Settings → Resume**, then paste the answer-style prompt from **section 9.3** into **Settings → Instructions**.

## 9.1 Transcription providers (v1.2.0+, upstream InterviewCopilot baseline)

| Provider | Where it runs | Setup |
|----------|---------------|-------|
| **Local (offline)** — default | Your PC, via whisper.cpp | Settings → API → Transcription → Local; pick a model (`base` bundled; `small`/`medium`/`large-v3` download once) |
| **API (cloud)** — Groq recommended | Remote, via any OpenAI‑compatible `POST {base}/audio/transcriptions` | Settings → API → Transcription → API; add a saved API (name, Base URL, key, model); click **Test connection** |

### Saved transcription APIs (v1.2.0+)

The **API (cloud)** provider manages **multiple saved endpoints** — same UX as
saved custom chat models. In **Settings → API → Transcription → API** you can:

* **Add** — fill in Name, Base URL, API Key, Model and click **Add**. The new
  endpoint becomes the active one immediately.
* **Use** — click **Use** on any saved entry to make it active (a green
  **Active** badge marks the current one).
* **Edit** — click **Edit**, change any field, then **Save** (or **Cancel** to discard).
* **Delete** — click **Delete** to remove a saved endpoint. If you delete the
  active one, the first remaining saved endpoint becomes active. If you delete
  all of them, the app falls back to the legacy flat fields (if any).

Keys are stored only in the local settings file
(`%APPDATA%\interviewclaudepilte\interview-claudepilte-settings.json`) — never in the
repo, never sent anywhere else. Changes take effect on the next ~3 s audio
chunk — no restart needed. **Test connection** always checks the **active**
saved API.

Upgrading from v1.0.x/v1.1.x: your existing flat Base URL / key / model are
automatically seeded into a saved profile named after your model
(e.g. `whisper-large-v3`) on first launch of v1.2.0. Nothing is lost; the flat
fields remain as a fallback if every saved profile is deleted.

### Recommended: Groq free tier (upstream InterviewCopilot baseline — verified Nov 2026)

The upstream build was verified end‑to‑end with **Groq's free `whisper‑large‑v3`** (Nov 2026):

1. Sign up free at **https://console.groq.com** → **API Keys** → **Create API Key** (`gsk_…`).
2. In **Settings → API → Transcription**, select **API (cloud)** and **Add** a saved API with:
   * Name: e.g. `Groq whisper-large-v3`
   * Base URL: `https://api.groq.com/openai/v1`
   * Model: `whisper-large-v3` (or `whisper-large-v3-turbo` for lower latency)
   * API Key: your `gsk_…` key
3. Click **Test connection** → expect `API reachable` (a bad key fails cleanly with the provider's HTTP 401).
4. Real-speech check: a spoken test sentence (“What is your experience with Git …”)
   returned an exact transcription (HTTP 200). Both NVIDIA chat models
   (`mistral-large-4-1t-a52b`, `nvidia/nemotron-3-ultra-550b-a55b`) were also
   verified with the in-app **Test** button, and the saved-profile flows
   (add → select → test → switch → delete) were exercised end-to-end via IPC.

Notes:
* Groq free tier is generous for interview prep; keys never leave the local settings file.
* Every ~3 s WAV clip is uploaded over HTTPS. Switching providers takes effect on the next audio chunk — no restart needed.
* The API path applies the same phantom-filler filter as the local path (drops
  “you”/“Thank you.” style hallucinations on near-silent clips).
* **NVIDIA NIM has no transcription endpoint** — `https://integrate.api.nvidia.com/v1/audio/transcriptions` returns HTTP 404 (verified Nov 2026). NVIDIA keys work for the AI answer models only; use Groq/OpenAI/self-hosted faster-whisper for speech.

## 9.2 Free providers & models for answers/vision/coding/reasoning

See **[PROVIDERS.md](./PROVIDERS.md)** — a catalogue of fast
**free** OpenAI-compatible endpoints (Google AI Studio Gemini, Groq, NVIDIA NIM,
OpenRouter, Cerebras) with exact Base URLs and model IDs for (verification
results are the upstream InterviewCopilot baseline, Nov 2026):

* **Answer** — `mistral-large-4-1t-a52b` (NIM), `qwen3.8-27b` (Groq), `gpt-oss-120b` (Cerebras ~3000 tok/s), `gemini-3.8-flash` (free multimodal)
* **Image upload / vision** — `nemotron-3-nano-omni-30b-a3b-reasoning` or `nemotron-3.5-super-vl-120b-a12b` (NIM, ✅ reads screenshots), Gemini Flash models
* **Coding** — `gemini-3.8-flash` / `gemini-4-hydrogen` (free), `poolside/laguna-xs-2.1` (NIM), `cohere/north-mini-code:free` (OpenRouter)
* **Reasoning** — Groq/Cerebras `gpt-oss-120b`, NIM nano-omni (✅ 17×23=391)

Each entry includes signup links, where the free limits live, and the
verification result so you know it worked on 2026-11-18.

## 9.3 Interview answer style — Settings → Instructions

The **Instructions** field (**Settings** tab) is prepended to every AI request
as `CANDIDATE INSTRUCTIONS (follow strictly):` — it controls *how* the copilot
answers (format, tone, length), not which model runs.

See **[INSTRUCTIONS.md](./INSTRUCTIONS.md)** — a paste-ready prompt (1,489
chars, under the 2000-char cap shown as `n / 2000` in the UI). It tells the
model to:

* **Anchor on your resume** — real skills/projects/years only; never invent companies;
* **Detect the question type** — technical (1–2 spoken lines + ≤20-line code, default Python), behavioural/HR (STAR, simple spoken English, 45–90 s), or other (short, confident, plain English);
* **Format for glanceability** — speakable line first, plain text, no markdown headers, ~150 words unless you ask for detail.

Upload your resume first (**Settings → Resume**) so rule 1 and the STAR rule have
something to anchor to. The change is in-memory and effective on the **next
answer** — no restart. The file also includes tuning variants (pure-coding
interviews, HR-only roles, longer answers, different default code language).
