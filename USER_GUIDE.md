# InterviewClaudePilte â€” User Guide (how this software works)

This is the practical manual: what you see, what the buttons and hotkeys do,
how to set it up in five minutes, and exactly what to do when something
doesn't work. For developers/verification see [ENGINEERING_GUIDE.md](./ENGINEERING_GUIDE.md);
for install/update/troubleshooting see [INSTALL_UPDATE.md](./INSTALL_UPDATE.md).

## 1. What you see after launch

- A floating **command bar** at the top of the screen: the IC logo, the current
  status (listening / model), and the mic/answer buttons. It is always on top.
- Click the **IC logo** (or `Ctrl+\`) to toggle the **dashboard** â€” a white card
  with tabs: **Commands, Transcript, Coach, Settings, API**.
- Press `Ctrl+Enter` to get an **answer card** docked under the command bar.
- Everything is drawn **inside** the overlay window, so **Ultra Undetectable
  Mode** (on by default) hides it from screen shares and recordings along
  with everything else (see Â§4).
- **Clicks pass through** everywhere except the app's own widgets â€” clicks land
  on the window underneath, so the overlay never blocks you mid-interview.

## 2. First run (about 5 minutes)

1. **Install** â€” download the installer from the GitHub release (see
   [INSTALL_UPDATE.md](./INSTALL_UPDATE.md); Windows 10/11 x64, per-user, no admin needed).
2. On first launch the **API** tab opens automatically.
3. **AI provider** â€” either:
   - **Custom API** (recommended): any OpenAI-compatible endpoint â€” Base URL
     (e.g. `https://integrate.api.nvidia.com/v1`, `https://api.groq.com/openai/v1`,
     `http://localhost:11434/v1` for Ollama), API key, Model name â†’
     **Add** â†’ **Test** (expect a short reply), or
   - Provider keys (OpenAI / Anthropic / Google / NVIDIA) if you have them.
4. **Transcription** â€” Settings â†’ API â†’ Transcription:
   - **Local (offline)** is the default (whisper.cpp, Base model bundled, no
     cloud, no key). Works for most voices; large models download on first use.
   - **API (cloud)** for better technical-vocabulary recognition â€” e.g. Groq
     `whisper-large-v3` free tier: Add a saved API (name / `https://api.groq.com/openai/v1` /
     key / `whisper-large-v3`) â†’ **Use** â†’ **Test connection**.
5. **Resume** â€” Settings â†’ Resume: upload PDF/DOCX/TXT. Every answer anchors to it.
6. **Instructions** â€” paste the ready-made block from [INSTRUCTIONS.md](./INSTRUCTIONS.md)
   into Settings â†’ Instructions (fits the 2000-char cap, applies to the next answer).
7. **Smoke test**: `Ctrl+Shift+L` to start listening, speak a question, watch
   the transcript appear, `Ctrl+Enter` for an answer.

## 3. During the interview â€” cheat sheet

| Shortcut | Action |
|---|---|
| `Ctrl+Shift+L` | Start / stop live transcription (loopback â€” no Stereo Mix needed) |
| `Ctrl+Enter` | Generate answer (from the live transcript) |
| `Ctrl+Shift+Enter` | Analyse Screen â€” capture the screen, answer from what is visible + the transcript (**sends ALL screenshots**, up to 10) |
| `Ctrl+Alt+Enter` | Toggle the chat bar ("Use Screen" checkbox for vision models) |
| `Ctrl+H` | Take a screenshot into context (newest **10** kept; toast shows `n/10`; CommandBar badge shows count) |
| `Ctrl+Delete` | Remove the newest screenshot |
| `Ctrl+R` | Reset context (transcript, screenshots, answers, chat) |
| `Ctrl+\` | Show / hide the overlay completely |
| `Ctrl+â†` / `Ctrl+â†’` | Slide the overlay sideways (Â±75% of the screen) |
| `Ctrl+[` / `Ctrl+]` | Overlay opacity down / up |
| `Ctrl+Shift+â†‘/â†“` | Scroll the answer; at the edges, jump to previous/next answer |
| `Ctrl+Q` | Quit (also in the tray menu) |

Silent audio is discarded (no phantom transcript segments). If the transcript
mishears something you may edit or delete any segment live.

## 4. Ultra Undetectable Mode (on by default)

- The overlay is invisible to screen capture and recording (`setContentProtection`).
- The cursor never changes shape over the overlay (always a plain arrow â€” no
  hand/pointer/I-beam gives invisible widgets away).
- Provider errors printed in the UI are sanitized â€” no API key can leak to
  someone glancing at your screen. Native OS tooltips are never used; hover
  hints are in-page tooltips hidden by the same protection.
- **Limits:** invisibility depends on your screen-share software and OS capture
  path; there is no universal guarantee â€” do a trial run in your own meeting
  setup before relying on it. Global hotkeys collide with any app that claimed
  the same shortcuts (e.g. InterviewCopilot) â€” run one at a time.

## 4.1 Vision Status Indicator (v1.0.4)

The CommandBar (top floating bar) now shows a **vision status indicator** at all times:
- ðŸŸ¢ **Green eye icon** â€” Screen Vision is **ON** (Settings â†’ API â†’ Screen analysis (vision) enabled)
- âšª **Gray eye icon** â€” Screen Vision is **OFF**
- **Red badge with count** â€” Number of screenshots currently captured (via `Ctrl+H`, max 10)

This lets you confirm at a glance whether "Analyse Screen" will send images to the model.

## 4.2 Interview Scenario Templates (v1.0.4)

In **Settings â†’ Instructions**, a dropdown above the Instructions textarea offers six one-click templates. Selecting one auto-fills proven instructions for that interview format:

| Template | Best For |
|----------|----------|
| **Coding Interview** | Algorithm + clean code + time/space complexity |
| **System Design** | Requirements â†’ architecture â†’ scaling â†’ trade-offs |
| **Line-by-Line Explanation** | Explaining every line of on-screen code |
| **Modify Code with Approach** | "Use DP / thread-safety / Strategy pattern / caching" |
| **Architecture Discussion** | Open-ended design questions |
| **Behavioral (STAR)** | Situation/Task/Action/Result with metrics |

After selecting a template, you can edit the text before it's saved. The Instructions field persists across restarts.

## 4.3 Model Capability Badges (v1.0.5)

When you add a **Custom API** model in **Settings â†’ API**, you now see four checkboxes to declare what that endpoint can do. Colored badges appear on the model card so you know at a glance:

| Badge | Letter | Meaning | Color |
|-------|--------|---------|-------|
| **C** | Code | Coding, refactoring, algorithms, code generation | ðŸŸ¢ Emerald |
| **T** | Text | General text generation, chat, summarization | ðŸ”µ Blue |
| **I** | Image | Vision, multimodal, image upload/analysis | ðŸŸ£ Purple |
| **R** | Reason | Chain-of-thought, step-by-step reasoning | ðŸŸ  Amber |

**Any combination works** â€” tick only what applies:
- `C T` = coding + text (most common)
- `C T I` = coding + text + vision
- `C T I R` = full-featured (coding, text, vision, reasoning)
- `T I` = vision chat model
- `I R` = vision + reasoning model

**How to set it:**
1. Settings â†’ API â†’ Custom API
2. Fill Base URL, API Key, Model Name
3. Tick the capability checkboxes below the fields
4. Click **Add** (or **Save** if editing)
5. Badges appear instantly on the model card in the list below

**Why this matters:** If you add a coding-specialist endpoint (e.g., DeepSeek-Coder) but forget to tick **I**, you'll know not to use it for "Analyse Screen". If you add a vision model (e.g., GPT-4o) and tick **I**, the green eye in the CommandBar will work with it.

## 5. Coach Console â€” a friend/coach helps you live (LAN)

A second person on the **same Wi-Fi** (or a second PC) can open a PIN-protected
dark console in a browser â€” no account, nothing leaves your LAN â€” and watch the
interview with you: live transcript, your streaming answers, RTT latency, plus
chat, hints, and session controls.

### 5.1 Turn it on (candidate)

1. Dashboard â†’ **Coach** tab â†’ **Turn on**.
2. The tab shows the URL (e.g. `http://10.x.x.x:47821/`), a **QR code**, and a
   **6-digit PIN**. The PIN changes every time you toggle the console or the
   app restarts â€” it is never embedded in the QR.
3. If you leave it on, it starts with the app (log prints `Coach bridge
   listening on http://â€¦` at launch; toggle state persists in settings).

### 5.2 Join (coach)

1. Same Wi-Fi â†’ scan the QR (or type the URL) in any browser.
2. Enter the **current** 6-digit PIN â†’ you land on the dark Coach Console.
3. What you get: live transcript (add/edit/delete lines), answers as they
   stream, **Send** hints (they appear as a toast on the candidate's screen),
   chat, RTT (latency), coaches count, tone selector, **Auto-answer** toggle,
   **Ask AI / Regenerate / Scan Screen**, answer navigation, session controls
   and live editing of the candidate context.

### 5.3 Candidate view

Connected coaches and their RTT appear in the Coach tab; every hint lands as a
small toast on your screen. Use hotkeys normally â€” nothing changes.

### 5.4 "It shows connectingâ€¦ forever" â€” checklist (works in v1.0.5)

Note: builds **before v1.0.3** had a broken console page (a syntax error in its
script) â€” every device sat on "Connectingâ€¦" forever regardless of network. If
you are on v1.0.2 or older, **update to v1.0.5 first**. On v1.0.3+:

1. On **this PC**, open `http://localhost:47821/` â€” if it loads and the phone
   cannot, it is the network, not the app:
2. Phone must be on the **same Wi-Fi** with **mobile data off**.
3. **Windows Firewall** (most common): Coach tab â†’ **Allow through Windows
   Firewall** (UAC prompt) or an elevated PowerShell:
   `netsh advfirewall firewall add rule name="InterviewClaudePilte Coach Bridge" dir=in action=allow protocol=TCP localport=47821 profile=private`
4. **Router isolation** (guest Wi-Fi / hotel / campus / Android phone hotspot
   clientâ†”client isolation): use a non-guest Wi-Fi or a router, or view the
   console on the **hotspot host phone itself**.
5. **Wrong PIN**: the page says "Disconnected" â€” PIN rotates per start; refresh
   the tab and enter the PIN currently shown in the Coach tab.

### 5.5 What never leaves your LAN

Everything the coach sees is served by this PC; there is no cloud relay. The
console is PIN-protected, and the candidate can toggle the bridge off any
time (Coach tab â†’ **Turn off**).

## 6. Where your data lives

- Settings (keys, models, resume context path, preferences):
  `%APPDATA%\interviewclaudepilte\interview-claudepilte-settings.json`
- Whisper models (if you download larger ones):
  `%APPDATA%\interviewclaudepilte\whisper-models`
- Your API keys are stored **only** in the settings file â€” never in the repo,
  never uploaded anywhere except the endpoint you configured.
- With **Local** transcription, audio never leaves the PC. With **API**, every
  ~3 s chunk is POSTed to your chosen transcription endpoint over HTTPS.
- Answers go only to the AI endpoint you configured.

## 7. Troubleshooting (fast answers)

| Symptom | Fix |
|---|---|
| Overlay hidden, want it back | `Ctrl+\` or the tray icon |
| Hotkeys do nothing | Another app claimed them (e.g. InterviewCopilot) â€” run one at a time |
| Empty / no answer | Check the API tab **Test** button, your key, and that the transcript isn't empty |
| Answer 404 | Base URL must end with `/v1` (e.g. `https://â€¦/v1`) |
| Whisper mishears | Switch to cloud transcription (Â§2.4) â€” e.g. Groq `whisper-large-v3` |
| "Analyse Screen" refuses images / "Model has no multimodal processing" toast | 1) Settings â†’ API â†’ Screen analysis (vision) â†’ toggle **ON** 2) Use a multimodal model (GPT-4o, Claude 3.5 Sonnet, Gemini 1.5 Pro/Flash, NVIDIA Nemotron 3 Ultra Omni) 3) If self-hosted (vLLM): start with `--enable-multimodal`. Vision status: CommandBar shows ðŸŸ¢ green eye = ON, âšª gray = OFF |
| "No audio captured yet" when pressing Answer | 1) Press `Ctrl+Shift+L` to start listening (red mic icon = ON) 2) Settings â†’ API â†’ Transcription: configure Local (offline) or API (cloud) 3) Speak/play interview audio. Error now shows `Listening: ON/OFF | Transcript segments: N` + fix checklist |
| Multiple screenshots not sent to vision | Update to v1.0.4+. Now all screenshots (up to 10 via `Ctrl+H`) are sent simultaneously. CommandBar badge shows count. |
| Custom model capabilities unknown / picked wrong model | Update to v1.0.5+. Settings â†’ API â†’ Custom API â†’ when adding/editing a model, tick **C** (coding), **T** (text), **I** (image/vision), **R** (reasoning). Badges `C T I R` appear on the model card for instant recognition. |
| Coach console "connectingâ€¦" | See Â§5.4 |
| Coach console wrong PIN / Disconnected | PIN rotates on every start â€” refresh the tab, enter the current PIN |
| Tray icon missing | Restart the app; check the installer finished |
| Screen-share invisibility unproven | Trial in your own meeting setup â€” Ultra Undetectable Mode is on by default but capture paths differ |

## 8. Documentation map

| File | What it covers |
|---|---|
| [README.md](./README.md) | Product overview, feature list, build/verification status |
| [INSTALL_UPDATE.md](./INSTALL_UPDATE.md) | Install / update / uninstall / troubleshooting / building from source |
| [INSTRUCTIONS.md](./INSTRUCTIONS.md) | Paste-ready answer-style prompt for Settings â†’ Instructions |
| [PROVIDERS.md](./PROVIDERS.md) | Free providers & models for answers/vision/coding/reasoning |
| [ENGINEERING_GUIDE.md](./ENGINEERING_GUIDE.md) | Architecture, stealth, bridge, verification & release process |
| [CLAUDE.md](./CLAUDE.md) | AI-assistant context (current state, hard-won notes) |
| [MULTI_AGENT_PROJECT_PLAN.md](./MULTI_AGENT_PROJECT_PLAN.md) | Historical project plan (upstream baseline) |
| [AGENT_SKILLS_SETUP.md](./AGENT_SKILLS_SETUP.md) | Agent skills setup notes |

