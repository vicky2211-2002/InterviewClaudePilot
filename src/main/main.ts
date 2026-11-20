import {
  app,
  BrowserWindow,
  ipcMain,
  screen,
  globalShortcut,
  nativeImage,
  Tray,
  Menu,
  dialog,
  desktopCapturer,
  shell,
} from 'electron';
import { execFile } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import {
  AIModel,
  AskRequest,
  Settings,
  TranscriptSegment,
  UiCommand,
} from '@shared/types';
import { WhisperTranscriber } from './whisper/WhisperTranscriber';
import { AIProviderManager } from './ai/AIProviderManager';
import { SettingsManager } from './settings/SettingsManager';
import { StealthManager } from './stealth/StealthManager';
import { ContextManager } from './context/ContextManager';
import { BridgeServer } from './bridge/server';
import { preloadFile, rendererFile, iconFile, trayIconFile } from './paths';
import type { BridgeStatus, HubCommand, PublicAnswer, PublicModel } from '@shared/bridge';

// ---------------------------------------------------------------------------
// Single instance
// ---------------------------------------------------------------------------
if (!app.requestSingleInstanceLock()) {
  app.quit();
}

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

let settingsManager: SettingsManager;
let whisperTranscriber: WhisperTranscriber;
let aiProviderManager: AIProviderManager;
let stealthManager: StealthManager;
let contextManager: ContextManager;
let bridge: BridgeServer | null = null;

let isListening = false;
let currentTranscript: TranscriptSegment[] = [];
let screenshots: string[] = [];
let lastQuitAt = 0;
let listeningStartedAt = 0;
let bridgeActive = false;
// Answers are owned by the main process so the LAN hub can serve them to
// coaches even if the overlay window is hidden or reloaded.
let answerLog: PublicAnswer[] = [];

const appStartedAt = Date.now();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function send(channel: string, payload?: unknown) {
  mainWindow?.webContents.send(channel, payload);
}

function command(cmd: UiCommand) {
  send('ui-command', cmd);
}

function toast(message: string, kind: 'info' | 'error' | 'success' = 'info') {
  send('toast', { message, kind });
}

function currentSettings(): Settings {
  return settingsManager.getSettings();
}

// ---------------------------------------------------------------------------
// Window
// ---------------------------------------------------------------------------
/** Horizontal travel limit for Ctrl+←/→: ±75% of the screen's work-area width. */
function maxHorizontalOffset(): number {
  return Math.round(screen.getPrimaryDisplay().workAreaSize.width * 0.75);
}

function createOverlayWindow() {
  const display = screen.getPrimaryDisplay();
  const { width, height } = display.workAreaSize;

  mainWindow = new BrowserWindow({
    x: display.workArea.x,
    y: display.workArea.y,
    width,
    height,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    show: false,
    webPreferences: {
      preload: preloadFile(),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });

  // Stay above normal windows without stealing focus.
  mainWindow.setAlwaysOnTop(true, 'screen-saver');
  if (process.platform === 'win32') {
    mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  }

  mainWindow.loadFile(rendererFile('index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow?.showInactive();
    applyStealth();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Renderer wants click-through except over its own widgets.
  mainWindow.webContents.on('did-finish-load', () => {
    send('settings-update', currentSettings());
    mainWindow?.webContents.send('transcript-update', currentTranscript);
    if (screenshots.length) send('screenshots-update', { count: screenshots.length });
    setTimeout(() => mainWindow?.setIgnoreMouseEvents(true, { forward: true }), 250);
  });
}

function applyStealth() {
  if (!mainWindow) return;
  const settings = currentSettings();
  mainWindow.setAlwaysOnTop(settings.alwaysOnTop, 'screen-saver');
  mainWindow.setOpacity(clamp(settings.windowOpacity, 0.2, 1));
  // WDA_EXCLUDEFROMCAPTURE — invisible to screen shares/recordings.
  try {
    mainWindow.setContentProtection(settings.undetectableMode || settings.invisibleOnScreenShare);
  } catch (err) {
    console.warn('[Main] setContentProtection failed:', err);
  }

  // Task Manager / Alt+Tab invisibility
  if (process.platform === 'win32') {
    try {
      if (settings.invisibleInTaskManager) {
        // Hide from taskbar and Alt+Tab
        mainWindow.setSkipTaskbar(true);
        // Use a generic AppUserModelId so it doesn't show "InterviewClaudePilte" in Task Manager Details
        app.setAppUserModelId('Windows.System.Host');
      } else {
        mainWindow.setSkipTaskbar(true); // Always keep skipTaskbar for overlay behavior
        app.setAppUserModelId('com.interviewclaudepilte.app');
      }
    } catch (err) {
      console.warn('[Main] TaskManager invisibility failed:', err);
    }
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/**
 * Provider errors sometimes echo the rejected key (OpenAI-style messages do).
 * Never let a gsk_/nvapi-/sk-/Bearer token reach the UI, the toast, or the log.
 */
function sanitizeProviderMessage(text: string): string {
  return text
    .replace(/gsk_[A-Za-z0-9_-]+/g, 'gsk_…')
    .replace(/nvapi-[A-Za-z0-9_-]+/g, 'nvapi-…')
    .replace(/sk-[A-Za-z0-9_-]{6,}/g, 'sk-…')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer …');
}

/** True when the provider rejected image input because multimodal is disabled/unsupported. */
function isMultimodalRejection(text: string): boolean {
  return /(--enable-multimodal|multimodal|modalit)/i.test(text);
}

function createTray() {
  try {
    const iconPath = trayIconFile();
    const icon = fs.existsSync(iconPath)
      ? nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 })
      : nativeImage.createEmpty();

    tray = new Tray(icon);
    const menu = Menu.buildFromTemplate([
      { label: 'Show / Hide', click: () => toggleVisibility() },
      { label: 'Open Dashboard', click: () => { showWindow(); command({ type: 'toggle-dashboard' }); } },
      {
        label: 'Start / Stop Listening',
        click: () => {
          command({ type: 'toggle-listening' });
        },
      },
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() },
    ]);
    tray.setToolTip('InterviewClaudePilte');
    tray.setContextMenu(menu);
    tray.on('double-click', () => toggleVisibility());
  } catch (err) {
    console.warn('[Main] tray unavailable:', err);
  }
}

function toggleVisibility() {
  if (!mainWindow) return;
  if (mainWindow.isVisible()) {
    mainWindow.hide();
  } else {
    mainWindow.showInactive();
    applyStealth();
  }
}

// ---------------------------------------------------------------------------
// Transcript / AI
// ---------------------------------------------------------------------------
function pushTranscript(segment: TranscriptSegment) {
  currentTranscript.push(segment);
  if (currentTranscript.length > 200) currentTranscript = currentTranscript.slice(-200);
  send('transcript-update', currentTranscript);
  if (bridgeActive && bridge) bridge.broadcastState();
}

function pushAnswer(answer: PublicAnswer) {
  answerLog.push(answer);
  if (answerLog.length > 200) answerLog = answerLog.slice(-200);
  if (bridgeActive && bridge) {
    bridge.broadcast({ type: 'answer_start', answer });
  }
}

/** Apply a coach-issued transcript edit to the overlay's history. */
function applyCoachTranscriptEdit(action: 'add' | 'update' | 'delete', segment: TranscriptSegment) {
  if (action === 'add') {
    currentTranscript.push(segment);
    if (currentTranscript.length > 200) currentTranscript = currentTranscript.slice(-200);
  } else if (action === 'update') {
    currentTranscript = currentTranscript.map((s) => (s.id === segment.id ? { ...s, ...segment } : s));
  } else if (action === 'delete') {
    currentTranscript = currentTranscript.filter((s) => s.id !== segment.id);
  }
  send('transcript-update', currentTranscript);
  if (bridgeActive && bridge) bridge.broadcastState();
}

/** Route a coach command coming over the LAN bridge into the app. */
function handleCoachCommand(cmd: HubCommand) {
  switch (cmd.type) {
    case 'ui_command': {
      switch (cmd.name) {
        case 'answer':
          send('ui-command', { type: 'answer' });
          break;
        case 'analyse-screen':
          send('ui-command', { type: 'analyse-screen' });
          break;
        case 'reset-context':
          send('ui-command', { type: 'reset-context' });
          break;
        case 'toggle-listening':
          send('ui-command', { type: 'toggle-listening' });
          break;
        case 'scroll-up':
          send('ui-command', { type: 'scroll', direction: 'up' });
          break;
        case 'scroll-down':
          send('ui-command', { type: 'scroll', direction: 'down' });
          break;
        default:
          break;
      }
      break;
    }
    case 'set_model': {
      const available = aiProviderManager?.getAvailableModels() ?? [];
      if (available.some((m) => m.id === cmd.model)) {
        settingsManager.updateSettings({ selectedModel: cmd.model });
        aiProviderManager.updateSettings(currentSettings());
        send('settings-update', currentSettings());
        toast('Coach switched the AI model', 'info');
      } else {
        toast('Coach tried to select an unknown model', 'error');
      }
      break;
    }
    case 'overlay': {
      if (!mainWindow) break;
      switch (cmd.action) {
        case 'hide':
          mainWindow.hide();
          break;
        case 'show':
          mainWindow.showInactive();
          applyStealth();
          break;
        case 'front':
          mainWindow.setAlwaysOnTop(true, 'screen-saver');
          break;
        case 'opacity_up':
        case 'opacity_down': {
          const delta = cmd.action === 'opacity_up' ? 0.1 : -0.1;
          const next = Math.min(1, Math.max(0.2, currentSettings().windowOpacity + delta));
          settingsManager.updateSettings({ windowOpacity: next });
          send('settings-update', currentSettings());
          applyStealth();
          break;
        }
        case 'scroll_up':
          send('ui-command', { type: 'scroll', direction: 'up' });
          break;
        case 'scroll_down':
          send('ui-command', { type: 'scroll', direction: 'down' });
          break;
        default:
          break;
      }
      break;
    }
    case 'transcript_edit': {
      if (cmd.action === 'add') {
        const text = (cmd.text ?? '').trim();
        if (!text) break;
        applyCoachTranscriptEdit('add', {
          id: `coach_${Date.now()}`,
          speaker: cmd.speaker ?? 'system',
          text,
          timestamp: Date.now(),
          isFinal: true,
        });
      } else if (cmd.action === 'update' && cmd.id) {
        const existing = currentTranscript.find((s) => s.id === cmd.id);
        if (existing) applyCoachTranscriptEdit('update', { ...existing, text: cmd.text ?? existing.text });
      } else if (cmd.action === 'delete' && cmd.id) {
        applyCoachTranscriptEdit('delete', {
          id: cmd.id,
          speaker: 'system',
          text: '',
          timestamp: Date.now(),
          isFinal: true,
        });
      }
      break;
    }
    case 'candidate': {
      const partial: Partial<Settings> = {};
      if (typeof cmd.candidate.autoAnswer === 'boolean') partial.autoAnswer = cmd.candidate.autoAnswer;
      if (cmd.candidate.tone) partial.answerTone = cmd.candidate.tone;
      if (Object.keys(partial).length) {
        settingsManager.updateSettings(partial);
        send('settings-update', currentSettings());
      }
      break;
    }
    case 'toast':
      send('toast', { message: cmd.message, kind: cmd.kind });
      break;
    default:
      // answer_* / transcript / error / kicked flow hub → coach only.
      break;
  }
}

function emptyBridgeStatus(): BridgeStatus {
  return {
    running: false,
    port: currentSettings().coachPort,
    urls: [],
    primaryUrl: null,
    coaches: [],
    pin: '',
    candidate: {
      name: currentSettings().candidateName || 'Candidate',
      company: currentSettings().companyName || '',
      listening: isListening,
      autoAnswer: currentSettings().autoAnswer,
      tone: currentSettings().answerTone,
      startedAt: currentSettings().sessionStartedAt,
      limitMinutes: currentSettings().sessionLimitMinutes,
      online: true,
    },
    error: null,
    qrDataUrl: null,
  };
}

function buildQuestionContext(): string {
  const recent = currentTranscript.slice(-12).map((s) => `${s.speaker}: ${s.text}`).join('\n');
  return recent;
}

async function resolveImages(extra?: string[]): Promise<string[]> {
  const shots = [...screenshots, ...(extra || [])];
  // Return ALL screenshots (up to MAX_SCREENSHOTS) for multi-image context
  // The vision provider will receive them as separate image_url entries
  return shots.slice(-MAX_SCREENSHOTS);
}

async function handleAsk(request: AskRequest): Promise<{ ok: boolean; error?: string; code?: string }> {
  const settings = currentSettings();
  const baseModelId = settings.selectedModel;
  if (!baseModelId) {
    return {
      ok: false,
      error: 'No AI model configured. Open Settings → API.',
      code: 'NO_MODEL',
    };
  }

  // Vision is optional: the user may run a text-only endpoint (e.g. vLLM
  // without --enable-multimodal) or dedicate a separate vision model.
  const visionEnabled = settings.screenVisionEnabled !== false;
  let images: string[] = [];
  if (request.mode === 'screen' && visionEnabled) {
    images = await resolveImages(request.images);
  }
  const visionModelId = (settings.visionModel || '').trim();
  const modelId = images.length > 0 && visionModelId ? visionModelId : baseModelId;

  let prompt = request.question?.trim() || '';

  if (request.mode === 'answer') {
    const context = buildQuestionContext();
    if (!context && !prompt) {
      const settings = currentSettings();
      const listeningStatus = isListening ? 'ON' : 'OFF';
      const transcriptCount = currentTranscript.length;
      return {
        ok: false,
        error: `No interview audio captured yet. Listening: ${listeningStatus} | Transcript segments: ${transcriptCount}. Fix: (1) Press Ctrl+Shift+L to start listening, (2) Ensure transcription provider is configured in Settings → API → Transcription, (3) Speak or play interview audio.`,
        code: 'NO_CONTEXT',
      };
    }
    prompt = [
      'A question was just asked in a live interview. Give the candidate a strong, ready-to-speak answer.',
      context ? `Conversation so far:\n${context}` : '',
      prompt ? `Additional instruction: ${prompt}` : '',
      'Answer directly. No preamble, no "the candidate should". Use short paragraphs or bullets.',
    ]
      .filter(Boolean)
      .join('\n\n');
  } else if (request.mode === 'screen') {
    const context = buildQuestionContext();
    const intro =
      images.length > 0
        ? 'Analyse the attached screenshot of the interview and answer the question shown or asked.'
        : 'No screenshot is attached (vision is disabled) — answer from the conversation transcript only.';
    prompt = [
      intro,
      context ? `Conversation so far:\n${context}` : '',
      prompt ? `Question: ${prompt}` : '',
      'Give a concise, complete answer the candidate can read out loud.',
    ]
      .filter(Boolean)
      .join('\n\n');
  }

  // The tone is coach-controllable live from the console.
  const tone = settings.answerTone || 'professional';
  const toneHint =
    tone === 'technical'
      ? 'Tone: technical and precise — assume an engineering audience.'
      : tone === 'confident'
        ? 'Tone: confident and assertive — own the answer, no hedging.'
        : tone === 'humble'
          ? 'Tone: humble and modest — understated, collaborative phrasing.'
          : 'Tone: professional — polished, structured, interview-ready.';
  prompt += `\n\n${toneHint}`;

  // Never let a stalled provider leave the UI stuck in a "streaming" state.
  let settled = false;
  let answerText = '';
  // Streaming skeleton for the LAN hub — coaches watch the answer being typed.
  const answerSkeleton: PublicAnswer = {
    id: request.id,
    question: (request.question || prompt).slice(-2000),
    text: '',
    model: modelId,
    tone: settings.answerTone,
    createdAt: Date.now(),
    streaming: true,
    confidence: null,
    origin: 'candidate',
  };
  answerLog.push(answerSkeleton);
  if (answerLog.length > 200) answerLog = answerLog.slice(-200);
  if (bridgeActive && bridge) bridge.broadcast({ type: 'answer_start', answer: answerSkeleton });

  const finalizeAnswer = (ok: boolean, error?: string) => {
    const finalAnswer: PublicAnswer = {
      ...answerSkeleton,
      text: answerText,
      streaming: false,
      error,
    };
    const idx = answerLog.findIndex((a) => a.id === request.id);
    if (idx >= 0) answerLog[idx] = finalAnswer;
    if (bridgeActive && bridge) {
      if (ok) bridge.broadcast({ type: 'answer_end', answer: finalAnswer });
      else bridge.broadcast({ type: 'answer_error', id: request.id, error: error || 'Unknown error' });
    }
    return finalAnswer;
  };

  const watchdog = setTimeout(() => {
    if (settled) return;
    settled = true;
    finalizeAnswer(false, 'The model did not respond in time.');
    send('ai-response-error', { id: request.id, error: 'The model did not respond in time.' });
  }, 120_000);

  try {
    const onChunk = (chunk: string) => {
      answerText += chunk;
      if (!settled) send('ai-response-chunk', { id: request.id, chunk });
      if (bridgeActive && bridge) bridge.broadcast({ type: 'answer_chunk', id: request.id, chunk });
    };

    if (images.length > 0) {
      try {
        // Send ALL images for multi-screenshot context
        await aiProviderManager.generateResponseStreamWithVision(
          prompt,
          modelId,
          images,
          onChunk,
        );
      } catch (visionError) {
        const raw = visionError instanceof Error ? visionError.message : String(visionError);
        if (isMultimodalRejection(raw)) {
          // e.g. vLLM started without --enable-multimodal: retry text-only so
          // the candidate still gets an answer instead of a dead card.
          console.warn('[Main] vision model rejected the image, retrying text-only:', sanitizeProviderMessage(raw));
          toast('Model has no multimodal processing — answering without screenshots', 'info');
          await aiProviderManager.generateResponseStream(
            `${prompt}\n\nNOTE: No images are available to you — answer from the transcript only.`,
            modelId,
            onChunk,
          );
          clearTimeout(watchdog);
          settled = true;
          finalizeAnswer(true);
          send('ai-response-end', { id: request.id });
          return { ok: true };
        }
        throw visionError;
      }
    } else {
      await aiProviderManager.generateResponseStream(prompt, modelId, onChunk);
    }

    clearTimeout(watchdog);
    settled = true;
    finalizeAnswer(true);
    send('ai-response-end', { id: request.id });
    return { ok: true };
  } catch (error) {
    clearTimeout(watchdog);
    settled = true;
    const message = sanitizeProviderMessage(error instanceof Error ? error.message : String(error));
    console.error('[Main] ask failed:', message);
    finalizeAnswer(false, message);
    send('ai-response-error', { id: request.id, error: message });
    return { ok: false, error: message, code: 'PROVIDER_ERROR' };
  }
}

/** Max screenshots kept in context; oldest are dropped past this. */
const MAX_SCREENSHOTS = 10;

// ---------------------------------------------------------------------------
// Screenshots
// ---------------------------------------------------------------------------
async function captureScreen(): Promise<string | null> {
  const display = screen.getPrimaryDisplay();
  const maxWidth = 1600;
  const scale = Math.min(1, maxWidth / (display.size.width * display.scaleFactor));
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: {
      width: Math.round(display.size.width * display.scaleFactor * scale),
      height: Math.round(display.size.height * display.scaleFactor * scale),
    },
  });
  const source = sources.find((s) => s.display_id === String(display.id)) || sources[0];
  if (!source || source.thumbnail.isEmpty()) return null;
  const dataUrl = source.thumbnail.toDataURL();
  screenshots.push(dataUrl);
  if (screenshots.length > MAX_SCREENSHOTS) screenshots = screenshots.slice(-MAX_SCREENSHOTS);
  send('screenshots-update', { count: screenshots.length });
  return dataUrl;
}

function deleteLastScreenshot(): void {
  const removed = screenshots.pop();
  send('screenshots-update', { count: screenshots.length });
  if (!removed) {
    toast('No screenshots to delete', 'info');
  } else if (screenshots.length === 0) {
    toast('Last screenshot deleted — none left', 'info');
  } else {
    toast(`Screenshot deleted (${screenshots.length} left)`, 'info');
  }
}

// ---------------------------------------------------------------------------
// Shortcuts
// ---------------------------------------------------------------------------
function registerShortcuts() {
  const bind = (accelerator: string, handler: () => void) => {
    try {
      const ok = globalShortcut.register(accelerator, handler);
      if (!ok) {
        console.warn('[Main] shortcut unavailable:', accelerator);
        toast(`Shortcut ${accelerator} is unavailable (another app may have claimed it)`, 'error');
      }
    } catch (err) {
      console.warn('[Main] shortcut error', accelerator, err);
    }
  };

  bind('CommandOrControl+Enter', () => command({ type: 'answer' }));
  bind('CommandOrControl+Shift+Enter', () => command({ type: 'analyse-screen' }));
  bind('CommandOrControl+Alt+Enter', () => command({ type: 'open-chat' }));
  bind('CommandOrControl+R', () => command({ type: 'reset-context' }));
  bind('CommandOrControl+H', () => {
    void captureScreen().then((shot) => {
      if (shot) {
        toast(`Screenshot captured (${screenshots.length}/${MAX_SCREENSHOTS}) — used by Analyse Screen`, 'info');
      } else {
        toast('Screen capture failed', 'error');
      }
    });
  });
  bind('CommandOrControl+Delete', () => {
    deleteLastScreenshot();
  });
  bind('CommandOrControl+\\', () => toggleVisibility());
  bind('CommandOrControl+Q', () => {
    lastQuitAt = Date.now();
    app.quit();
  });
  bind('CommandOrControl+Shift+Alt+O', () => {
    if (!lastQuitAt || Date.now() - lastQuitAt < 30 * 60 * 1000) {
      showWindow();
    }
  });
  bind('CommandOrControl+Shift+Up', () => command({ type: 'scroll', direction: 'up' }));
  bind('CommandOrControl+Shift+Down', () => command({ type: 'scroll', direction: 'down' }));
  bind('CommandOrControl+Shift+Left', () => command({ type: 'scroll', direction: 'left' }));
  bind('CommandOrControl+Shift+Right', () => command({ type: 'scroll', direction: 'right' }));
  bind('CommandOrControl+Left', () => command({ type: 'move', delta: -40 }));
  bind('CommandOrControl+Right', () => command({ type: 'move', delta: 40 }));
  bind('CommandOrControl+[', () => command({ type: 'opacity', delta: -0.05 }));
  bind('CommandOrControl+]', () => command({ type: 'opacity', delta: 0.05 }));
  bind('CommandOrControl+Shift+L', () => command({ type: 'toggle-listening' }));
}

function showWindow() {
  if (!mainWindow) return;
  if (!mainWindow.isVisible()) mainWindow.showInactive();
  applyStealth();
}

// ---------------------------------------------------------------------------
// IPC
// ---------------------------------------------------------------------------
function setupIPC() {
  ipcMain.handle('get-settings', () => currentSettings());

  ipcMain.handle('update-settings', (_event, partial: Partial<Settings>) => {
    settingsManager.updateSettings(partial);
    const settings = currentSettings();

    whisperTranscriber.updateSettings(settings);
    aiProviderManager.updateSettings(settings);
    contextManager.updateSettings(settings);

    if (partial.windowOpacity !== undefined || partial.alwaysOnTop !== undefined || partial.undetectableMode !== undefined || partial.invisibleOnScreenShare !== undefined) {
      applyStealth();
    }

    send('settings-update', settings);
    return settings;
  });

  ipcMain.handle('get-available-models', () => aiProviderManager.getAvailableModels());

  ipcMain.handle('add-custom-model', (_event, model: AIModel) => {
    settingsManager.addCustomModel(model);
    aiProviderManager.updateSettings(currentSettings());
    send('settings-update', currentSettings());
  });

  ipcMain.handle('remove-custom-model', (_event, modelId: string) => {
    settingsManager.removeCustomModel(modelId);
    aiProviderManager.updateSettings(currentSettings());
    send('settings-update', currentSettings());
  });

  ipcMain.handle('test-model', async (_event, { modelId, prompt }: { modelId: string; prompt: string }) => {
    try {
      const res = await aiProviderManager.testModel(modelId, prompt || 'Reply with exactly: OK');
      return { success: true, response: res.text };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle('test-transcription', async () => {
    try {
      return await whisperTranscriber.testApiConnection();
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  // Audio ---------------------------------------------------------------
  ipcMain.handle('get-audio-devices', async () => {
    // Enumerated in the renderer with navigator.mediaDevices; here we only
    // report the loopback-capable screen source.
    return [];
  });

  ipcMain.handle('get-loopback-source', async () => {
    const sources = await desktopCapturer.getSources({ types: ['screen'] });
    const primary = sources[0];
    return primary ? { id: primary.id, name: primary.name } : null;
  });

  ipcMain.on('audio-chunk', (_event, pcm: ArrayBuffer) => {
    if (!isListening) return;
    void whisperTranscriber.processAudio(Buffer.from(pcm));
  });

  ipcMain.handle('start-listening', async () => {
    try {
      await whisperTranscriber.initialize();
      isListening = true;
      listeningStartedAt = Date.now();
      send('ui-command', { type: 'listening', active: true });
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast(`Transcription unavailable: ${message}`, 'error');
      return { success: false, error: message };
    }
  });

  ipcMain.handle('stop-listening', () => {
    isListening = false;
    send('ui-command', { type: 'listening', active: false });
  });

  // AI ------------------------------------------------------------------
  ipcMain.handle('ask', async (_event, request: AskRequest) => {
    return handleAsk(request);
  });

  ipcMain.on('cancel-ask', () => {
    whisperTranscriber; // no-op placeholder; streaming cannot be aborted mid-flight
  });

  // Screenshots ---------------------------------------------------------
  ipcMain.handle('capture-screen', async () => {
    const shot = await captureScreen();
    if (!shot) toast('Screen capture failed', 'error');
    return shot;
  });

  ipcMain.handle('get-screenshots', () => screenshots);

  ipcMain.handle('delete-screenshot', () => {
    deleteLastScreenshot();
  });

  // Window / UI ---------------------------------------------------------
  ipcMain.on('set-ignore-mouse', (_event, ignore: boolean) => {
    mainWindow?.setIgnoreMouseEvents(ignore, { forward: true });
  });

  ipcMain.on('set-opacity', (_event, value: number) => {
    const settings = currentSettings();
    const next = clamp(settings.windowOpacity + value, 0.2, 1);
    settingsManager.updateSettings({ windowOpacity: next });
    mainWindow?.setOpacity(next);
    send('settings-update', { windowOpacity: next });
  });

  ipcMain.on('move-x', (_event, delta: number) => {
    const settings = currentSettings();
    const limit = maxHorizontalOffset();
    const next = clamp(settings.windowOffsetX + delta, -limit, limit);
    settingsManager.updateSettings({ windowOffsetX: next });
    send('settings-update', { windowOffsetX: next });
  });

  ipcMain.on('toggle-dashboard', () => command({ type: 'toggle-dashboard' }));
  ipcMain.on('show-window', () => showWindow());
  ipcMain.on('hide-window', () => mainWindow?.hide());
  ipcMain.on('quit-app', () => app.quit());

  ipcMain.on('clear-transcript', () => {
    currentTranscript = [];
    answerLog = [];
    screenshots = [];
    send('transcript-update', []);
    send('screenshots-update', { count: 0 });
    if (bridgeActive && bridge) bridge.broadcastState();
  });

  // Files ---------------------------------------------------------------
  ipcMain.handle('pick-file', async (_event, { kind }: { kind: 'resume' | 'job-description' }) => {
    const result = await dialog.showOpenDialog({
      title: kind === 'resume' ? 'Select resume' : 'Select job description',
      properties: ['openFile'],
      filters: [
        { name: 'Documents', extensions: ['pdf', 'docx', 'doc', 'txt', 'md'] },
        { name: 'All files', extensions: ['*'] },
      ],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  ipcMain.handle('read-text-file', async (_event, filePath: string) => {
    try {
      if (filePath.toLowerCase().endsWith('.pdf')) {
        // pdf-parse v1 (pdfjs 1.10) works in Node; the v2 build needs DOM
        // globals (DOMMatrix/ImageData) that the main process does not have.
        const pdfParse = require('pdf-parse/lib/pdf-parse.js');
        const data = await pdfParse(fs.readFileSync(filePath));
        return String(data.text || '');
      }
      if (filePath.toLowerCase().endsWith('.docx')) {
        const mammoth = require('mammoth');
        const result = await mammoth.extractRawText({ path: filePath });
        return String(result.value || '');
      }
      return fs.readFileSync(filePath, 'utf8');
    } catch (error) {
      console.error('[Main] read-text-file failed:', error);
      return '';
    }
  });

  ipcMain.handle('get-app-version', () => app.getVersion());

  // Coach bridge (LAN) — InterviewClaudePilte additions
  ipcMain.handle('getBridgeStatus', () => (bridge ? bridge.status() : emptyBridgeStatus()));

  ipcMain.handle('startBridge', async () => {
    if (!bridge) return emptyBridgeStatus();
    const status = await bridge.start();
    bridgeActive = status.running;
    return status;
  });

  ipcMain.handle('stopBridge', async () => {
    if (!bridge) return emptyBridgeStatus();
    const status = await bridge.stop();
    bridgeActive = false;
    return status;
  });

  // One-click unblock for the most common "phone can't reach the console on
  // the same Wi-Fi" cause: Windows Defender Firewall silently dropping inbound
  // TCP for this app. Adds a private-profile inbound rule via an elevated
  // netsh (a UAC prompt is shown; the user may cancel, in which case we return
  // the manual command). Failure NEVER throws — the renderer shows the text.
  ipcMain.handle('allowBridgeFirewall', async (): Promise<{ ok: boolean; error?: string }> => {
    const port = currentSettings().coachPort || 47821;
    const ps =
      `$ErrorActionPreference = 'Stop'; ` +
      `try { ` +
      `Start-Process netsh -Verb RunAs -Wait -ArgumentList 'advfirewall','firewall','add','rule','name="InterviewClaudePilte Coach Bridge"','dir=in','action=allow','protocol=TCP','localport=${port}','profile=private' | Out-Null; ` +
      `exit 0 ` +
      `} catch { exit 1 }`;
    const manual =
      `Run this in an elevated PowerShell: netsh advfirewall firewall add rule name="InterviewClaudePilte Coach Bridge" dir=in action=allow protocol=TCP localport=${port} profile=private`;
    return new Promise((resolve) => {
      execFile(
        'powershell.exe',
        ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps],
        { windowsHide: true, timeout: 60000 },
        (error, _stdout, stderr) => {
          if (!error) return resolve({ ok: true });
          const detail = (stderr || error.message || '').trim().slice(0, 300);
          resolve({
            ok: false,
            error:
              `Firewall rule not added${detail ? ` (${detail})` : ''} — UAC may have been cancelled or blocked. ` +
              manual,
          });
        },
      );
    });
  });

  ipcMain.on('sendCoachHint', (_event, text: string) => {
    const trimmed = String(text || '').trim().slice(0, 2000);
    if (!trimmed || !bridgeActive || !bridge) return;
    bridge.broadcast({
      type: 'hint',
      text: trimmed,
      by: currentSettings().coachDisplayName || 'Candidate',
    });
  });

  ipcMain.on('sendCoachChat', (_event, text: string) => {
    const trimmed = String(text || '').trim().slice(0, 2000);
    if (!trimmed || !bridgeActive || !bridge) return;
    bridge.broadcast({
      type: 'chat',
      text: trimmed,
      by: currentSettings().coachDisplayName || 'Candidate',
    });
  });

  ipcMain.on(
    'pushCoachEdit',
    (_event, action: 'add' | 'update' | 'delete', segment: TranscriptSegment) => {
      applyCoachTranscriptEdit(action, segment);
    },
  );
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
async function initializeManagers() {
  settingsManager = new SettingsManager();
  const settings = settingsManager.getSettings();

  whisperTranscriber = new WhisperTranscriber(settings);
  whisperTranscriber.onTranscript = (segment) => {
    pushTranscript(segment);
    const latest = currentSettings();
    if ((latest.autoTriggerAI || latest.autoAnswer) && segment.isFinal && segment.speaker === 'interviewer') {
      const id = `ans_${Date.now()}`;
      void handleAsk({ id, mode: 'answer', question: '' });
    }
  };
  whisperTranscriber.onStatus = (status) => send('whisper-status', status);

  aiProviderManager = new AIProviderManager(settings);
  stealthManager = new StealthManager();
  contextManager = new ContextManager(settings);

  // Coach bridge (LAN) — InterviewClaudePilte additions. The hub starts only
  // when the user enables it (or presses the button in the overlay); it then
  // serves the Coach Console to devices on the local network.
  bridge = new BridgeServer(
    {
      getSettings: () => ({
        candidateName: currentSettings().candidateName,
        companyName: currentSettings().companyName,
        answerTone: currentSettings().answerTone,
        autoAnswer: currentSettings().autoAnswer,
        sessionLimitMinutes: currentSettings().sessionLimitMinutes,
        sessionStartedAt: currentSettings().sessionStartedAt,
        selectedModel: currentSettings().selectedModel,
        listening: isListening,
      }),
      getTranscript: () => currentTranscript.slice(-200),
      getAnswers: () => answerLog.slice(-200),
      getModels: (): PublicModel[] =>
        aiProviderManager.getAvailableModels().map((m) => ({
          id: m.id,
          name: m.name,
          // ids look like `openai:gpt-4o` / `custom:foo` — the prefix is the provider.
          provider: m.id.split(':')[0] || 'custom',
        })),
      getVersion: () => app.getVersion(),
      getAppName: () => 'InterviewClaudePilte',
      sendToCandidate: handleCoachCommand,
    },
    settings.coachPort,
  );

  // Pick a usable model if the saved one is not available.
  const available = aiProviderManager.getAvailableModels();
  const saved = settingsManager.getSettings().selectedModel;
  const savedUsable = saved && available.some((m) => m.id === saved);
  if (!savedUsable) {
    const next = available[0]?.id ?? '';
    if (next !== saved) {
      settingsManager.updateSettings({ selectedModel: next });
      aiProviderManager.updateSettings(currentSettings());
    }
  }

  try {
    await whisperTranscriber.initialize();
  } catch (error) {
    console.error('[Main] Whisper init failed (will retry on listen):', error);
  }
}

app.whenReady().then(async () => {
  app.setAppUserModelId('com.interviewclaudepilte.app');
  await initializeManagers();
  createOverlayWindow();
  createTray();
  setupIPC();
  registerShortcuts();

  const settings = currentSettings();
  app.setLoginItemSettings({ openAtLogin: settings.autoStart });

  // Auto-start the coach bridge if the user left it enabled.
  if (settings.coachEnabled && bridge) {
    bridge
      .start()
      .then((status) => {
        bridgeActive = status.running;
        if (status.running) {
          console.log(`[Main] Coach bridge listening on ${status.primaryUrl} (PIN ${status.pin ?? 'shown in overlay'})`);
        }
      })
      .catch((err) => console.error('[Main] Coach bridge failed to start:', err));
  }

  // Keep the overlay aligned with the primary display when it changes.
  screen.on('display-metrics-changed', () => {
    if (!mainWindow) return;
    const display = screen.getPrimaryDisplay();
    mainWindow.setBounds({ x: display.workArea.x, y: display.workArea.y, ...display.workAreaSize });
  });

  console.log('[Main] ready — overlay window created');
});

app.on('window-all-closed', () => {
  // Keep running in tray unless the user quits explicitly.
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  if (bridge) void bridge.stop();
});

app.on('second-instance', () => {
  showWindow();
});
