// The LAN hub. Runs inside the Electron main process while a InterviewClaudePilte
// session is live. Serves the Coach Console page to any device on the network,
// accepts WebSocket connections, and relays commands/snapshots between the
// candidate app and its coaches. No cloud, no accounts — just the local Wi-Fi.
//
// Security model: a random 6-digit PIN per session, shown in the overlay's
// Coach tab and as a QR code. The PIN is required to open the console page and
// to complete the WebSocket handshake. Nothing is written to disk.

import * as http from 'http';
import * as os from 'os';
import * as crypto from 'crypto';
import { WebSocketServer, WebSocket } from 'ws';
import type { IncomingMessage } from 'http';
import {
  BridgeStatus,
  CandidatePresence,
  CoachPresence,
  BridgeSnapshot,
  CoachCommand,
  HubCommand,
  HubMessage,
  PublicAnswer,
  PublicModel,
  PublicTranscript,
  AnswerTone,
} from '@shared/bridge';
import { BRIDGE_PORT_DEFAULT } from '@shared/bridge';
import { buildUrls, generatePin } from './lan';
import { coachConsoleHtml } from './coachConsoleHtml';

interface BridgeOptions {
  getSettings: () => {
    candidateName: string;
    companyName: string;
    answerTone: AnswerTone;
    autoAnswer: boolean;
    sessionLimitMinutes: number;
    sessionStartedAt: number | null;
    selectedModel: string;
    listening?: boolean;
  };
  getTranscript: () => PublicTranscript[];
  getAnswers: () => PublicAnswer[];
  getModels: () => PublicModel[];
  getVersion: () => string;
  getAppName: () => string;
  /** Ask the candidate app to do something. Implemented by main.ts. */
  sendToCandidate: (cmd: HubCommand) => void;
  log?: (msg: string) => void;
}

interface Client {
  id: string;
  ws: WebSocket;
  name: string;
  userAgent: string;
  connectedAt: number;
  lastSeen: number;
  rttMs: number | null;
  authed: boolean;
  /** Timestamp of the last ping sent, used to compute RTT. */
  pingSentAt: number | null;
  role: 'coach' | 'candidate';
}

export class BridgeServer {
  private server: http.Server | null = null;
  private wss: WebSocketServer | null = null;
  private clients = new Map<string, Client>();
  private opts: BridgeOptions;
  private pin = generatePin();
  private sessionId = crypto.randomBytes(8).toString('hex');
  private port: number;
  private running = false;
  private lastError: string | null = null;
  private heartbeat: NodeJS.Timeout | null = null;
  private qrDataUrl: string | null = null;

  constructor(opts: BridgeOptions, preferredPort = BRIDGE_PORT_DEFAULT) {
    this.opts = opts;
    this.port = preferredPort;
  }

  getPin() {
    return this.pin;
  }

  getSessionId() {
    return this.sessionId;
  }

  getPort() {
    return this.port;
  }

  isRunning() {
    return this.running;
  }

  async start(): Promise<BridgeStatus> {
    if (this.running) return this.status();

    this.pin = generatePin();
    this.sessionId = crypto.randomBytes(8).toString('hex');

    // Try the preferred port, then fall back to an ephemeral one.
    for (const candidate of [this.port, BRIDGE_PORT_DEFAULT, 0]) {
      try {
        await this.listen(candidate);
        this.port = candidate === 0 ? this.boundPort() : candidate;
        this.running = true;
        this.qrDataUrl = null;
        this.startHeartbeat();
        this.broadcastState();
        return this.status();
      } catch (err) {
        this.lastError = err instanceof Error ? err.message : String(err);
      }
    }
    return this.status();
  }

  stop(): Promise<BridgeStatus> {
    this.running = false;
    this.stopHeartbeat();
    for (const client of [...this.clients.values()]) {
      try {
        client.ws.send(JSON.stringify({ type: 'kicked' } satisfies HubMessage));
        client.ws.close();
      } catch {
        /* ignore */
      }
    }
    this.clients.clear();
    this.server?.close();
    this.server = null;
    this.wss?.close();
    this.wss = null;
    return Promise.resolve(this.status());
  }

  status(): BridgeStatus {
    const { urls, primaryUrl } = buildUrls(this.port);
    return {
      running: this.running,
      port: this.port,
      urls,
      primaryUrl,
      qrDataUrl: this.qrDataUrl,
      pin: this.pin,
      coaches: this.coachList(),
      candidate: this.candidateSnapshot(),
      error: this.lastError,
    };
  }

  // ------------------------------------------------------------------ HTTP
  private boundPort(): number {
    const addr = this.server?.address();
    if (addr && typeof addr === 'object' && 'port' in addr) return (addr as { port: number }).port;
    return this.port;
  }

  private async listen(port: number): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const server = http.createServer((req, res) => this.handleHttp(req, res));
      server.once('error', reject);
      server.listen(port, '0.0.0.0', () => {
        server.removeListener('error', reject);
        this.server = server;
        this.wss = new WebSocketServer({ noServer: true });
        server.on('upgrade', (req, socket, head) => this.handleUpgrade(req, socket, head));
        this.wss.on('connection', (ws: WebSocket, req: IncomingMessage) =>
          this.handleConnection(ws, req),
        );
        resolve();
      });
    });
  }

  private handleHttp(req: http.IncomingMessage, res: http.ServerResponse) {
    const url = new URL(req.url || '/', 'http://localhost');
    const pinOk = url.searchParams.get('pin') === this.pin;

    if (url.pathname === '/' || url.pathname === '/console') {
      // The console page itself is harmless; it still needs the PIN to connect.
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(coachConsoleHtml({ appName: this.opts.getAppName(), pinRequired: true }));
      return;
    }
    if (url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, running: this.running, port: this.port }));
      return;
    }
    if (url.pathname === '/favicon.ico') {
      res.writeHead(204).end();
      return;
    }
    if (!pinOk) {
      res.writeHead(403, { 'Content-Type': 'text/plain' }).end('PIN required');
      return;
    }
    res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
  }

  // ----------------------------------------------------------------- WS
  private handleUpgrade(req: IncomingMessage, socket: import('stream').Duplex, head: Buffer) {
    const url = new URL(req.url || '/', 'http://localhost');
    if (url.pathname !== '/ws') {
      socket.writableEnded || socket.destroy();
      return;
    }
    this.wss?.handleUpgrade(req, socket as never, head, (ws) => {
      this.wss?.emit('connection', ws, req);
    });
  }

  private handleConnection(ws: WebSocket, req: IncomingMessage) {
    const id = crypto.randomBytes(8).toString('hex');
    const ua = String(req.headers['user-agent'] || '').slice(0, 120);
    const client: Client = {
      id,
      ws,
      name: 'Coach',
      userAgent: ua,
      connectedAt: Date.now(),
      lastSeen: Date.now(),
      rttMs: null,
      authed: false,
      pingSentAt: null,
      role: 'candidate',
    };
    this.clients.set(id, client);

    ws.on('message', (raw) => {
      let msg: HubMessage | null = null;
      try {
        msg = JSON.parse(raw.toString()) as HubMessage;
      } catch {
        this.sendError(client, 'Bad message');
        return;
      }
      void this.handleMessage(client, msg!);
    });
    ws.on('pong', () => {
      client.lastSeen = Date.now();
      if (client.pingSentAt) {
        client.rttMs = Math.max(0, Date.now() - client.pingSentAt);
        client.pingSentAt = null;
      }
    });
    ws.on('close', () => {
      this.clients.delete(id);
      this.broadcastPresence();
      this.broadcastState();
    });
    ws.on('error', () => {
      this.clients.delete(id);
    });
  }

  private async handleMessage(client: Client, msg: HubMessage) {
    client.lastSeen = Date.now();
    switch (msg.type) {
      case 'hello': {
        if (msg.pin !== this.pin) {
          this.sendError(client, 'Wrong PIN');
          client.ws.close();
          return;
        }
        client.authed = true;
        client.name = (msg.name || 'Coach').slice(0, 60);
        client.role = msg.role === 'candidate' ? 'candidate' : 'coach';
        this.send(client, { type: 'welcome', snapshot: this.snapshot(), you: { id: client.id, name: client.name } });
        this.broadcastPresence();
        this.broadcastState();
        return;
      }
      case 'pong': {
        if (client.pingSentAt) {
          client.rttMs = Math.max(0, Date.now() - client.pingSentAt);
          client.pingSentAt = null;
        }
        return;
      }
      case 'ping':
        this.send(client, { type: 'pong', t0: msg.t0 });
        return;
      default:
        if (!client.authed) return;
        this.routeCommand(client, msg as unknown as CoachCommand);
    }
  }

  private routeCommand(client: Client, cmd: CoachCommand) {
    switch (cmd.type) {
      case 'hint':
        this.broadcast({ type: 'hint', text: cmd.text.slice(0, 2000), by: client.name }, client.id);
        // Surface the hint on the candidate's overlay.
        this.opts.sendToCandidate({ type: 'toast', message: `Hint from ${client.name}: ${cmd.text}`, kind: 'info' });
        return;
      case 'chat':
        this.broadcast({ type: 'chat', text: cmd.text.slice(0, 2000), by: client.name }, client.id);
        // Candidate sees the coach's message as a toast as well.
        this.opts.sendToCandidate({ type: 'toast', message: `${client.name}: ${cmd.text}`, kind: 'info' });
        return;
      case 'ask':
        this.opts.sendToCandidate({ type: 'ui_command', name: 'answer' });
        return;
      case 'scan':
        this.opts.sendToCandidate({ type: 'ui_command', name: 'analyse-screen' });
        return;
      case 'regen':
        this.opts.sendToCandidate({ type: 'ui_command', name: 'answer' });
        return;
      case 'clear':
        this.opts.sendToCandidate({ type: 'ui_command', name: 'reset-context' });
        return;
      case 'nav':
        // prev/next answer ≈ scroll the answer card up/down.
        this.opts.sendToCandidate({ type: 'ui_command', name: cmd.dir === 'prev' ? 'scroll-up' : 'scroll-down' });
        return;
      case 'auto_answer':
        this.opts.sendToCandidate({ type: 'candidate', candidate: { autoAnswer: cmd.on } });
        return;
      case 'set_model':
        this.opts.sendToCandidate({ type: 'set_model', model: cmd.model });
        return;
      case 'set_tone':
        this.opts.sendToCandidate({ type: 'candidate', candidate: { tone: cmd.tone } });
        return;
      case 'transcript_add':
        this.opts.sendToCandidate({ type: 'transcript_edit', action: 'add', speaker: cmd.speaker, text: cmd.text });
        return;
      case 'transcript_update':
        this.opts.sendToCandidate({ type: 'transcript_edit', action: 'update', id: cmd.id, text: cmd.text });
        return;
      case 'transcript_delete':
        this.opts.sendToCandidate({ type: 'transcript_edit', action: 'delete', id: cmd.id });
        return;
      case 'overlay':
        this.opts.sendToCandidate({ type: 'overlay', action: cmd.action });
        return;
      case 'report':
        this.opts.sendToCandidate({ type: 'toast', message: `${client.name} asked for the post-interview report`, kind: 'info' });
        return;
      default:
        break;
    }
  }

  // -------------------------------------------------------------- helpers
  private send(client: Client, msg: HubMessage) {
    if (client.ws.readyState === WebSocket.OPEN) client.ws.send(JSON.stringify(msg));
  }

  private sendError(client: Client, message: string) {
    this.send(client, { type: 'error', message });
  }

  /** Broadcast a hub → coach envelope to all authenticated clients (optionally skipping one). */
  public broadcast(msg: HubMessage, exceptId?: string) {
    for (const client of this.clients.values()) {
      if (!client.authed) continue;
      if (exceptId && client.id === exceptId) continue;
      this.send(client, msg);
    }
  }

  broadcastState() {
    if (!this.running) return;
    this.broadcast({ type: 'state', snapshot: this.snapshot() });
  }

  broadcastPresence() {
    if (!this.running) return;
    this.broadcast({ type: 'presence', coaches: this.coachList(), candidate: this.candidateSnapshot() });
  }

  private snapshot(): BridgeSnapshot {
    const settings = this.opts.getSettings();
    return {
      app: this.opts.getAppName(),
      version: this.opts.getVersion(),
      sessionId: this.sessionId,
      serverTime: Date.now(),
      candidate: this.candidateSnapshot(),
      transcript: this.opts.getTranscript(),
      answers: this.opts.getAnswers(),
      models: this.opts.getModels(),
      selectedModel: settings.selectedModel,
      coaches: this.coachList(),
    };
  }

  private candidateSnapshot(): CandidatePresence {
    const settings = this.opts.getSettings();
    return {
      name: settings.candidateName || 'Candidate',
      company: settings.companyName || '',
      listening: settings.listening ?? false,
      autoAnswer: settings.autoAnswer,
      tone: settings.answerTone,
      startedAt: settings.sessionStartedAt,
      limitMinutes: settings.sessionLimitMinutes,
      online: true,
    };
  }

  private coachList(): CoachPresence[] {
    return [...this.clients.values()]
      .filter((c) => c.authed && c.role !== 'candidate')
      .map((c) => ({
        id: c.id,
        name: c.name,
        rttMs: c.rttMs,
        connectedAt: c.connectedAt,
        lastSeen: c.lastSeen,
        userAgent: c.userAgent,
      }));
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeat = setInterval(() => {
      for (const client of this.clients.values()) {
        try {
          client.pingSentAt = Date.now();
          client.ws.ping();
        } catch {
          /* ignore */
        }
      }
      this.broadcastPresence();
      this.broadcastState();
    }, 10_000);
  }

  private stopHeartbeat() {
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = null;
  }
}

export function networkLabel(port: number): string {
  const list = os.networkInterfaces();
  const found: string[] = [];
  for (const [iface, infos] of Object.entries(list)) {
    for (const info of infos || []) {
      if (info.family === 'IPv4' && !info.internal) found.push(`${iface} ${info.address}`);
    }
  }
  return `${found.join(' · ')} · port ${port}`;
}
