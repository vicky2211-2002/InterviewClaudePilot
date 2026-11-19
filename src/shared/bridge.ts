// Wire protocol for the Coach bridge.
//
// The desktop app is the hub: it runs a tiny HTTP + WebSocket server on the
// LAN, the candidate's overlay talks to it through IPC, and any other device
// on the same network (a phone, a second laptop) opens the Coach Console in a
// browser. Both sides speak the envelopes below.
//
// Deliberately dependency-free and renderer-safe: this file is imported by the
// Electron main process AND by the coach web page, so it must not reference
// `electron`, `fs`, or `ws`.

import type { TranscriptSegment } from './types';

export type AnswerTone = 'professional' | 'confident' | 'humble' | 'technical';

export const ANSWER_TONES: { id: AnswerTone; label: string; hint: string }[] = [
  { id: 'professional', label: 'Professional', hint: 'Polished' },
  { id: 'confident', label: 'Confident', hint: 'Assertive' },
  { id: 'humble', label: 'Humble', hint: 'Modest' },
  { id: 'technical', label: 'Technical', hint: 'Precise' },
];

export type PublicAnswer = {
  id: string;
  question: string;
  text: string;
  model: string;
  tone: AnswerTone;
  createdAt: number;
  streaming: boolean;
  confidence: number | null;
  error?: string;
  /** Who asked for it: the candidate's hotkey, auto-answer, or the coach. */
  origin: 'candidate' | 'auto' | 'coach';
};

export type PublicModel = {
  id: string;
  name: string;
  provider: string;
};

export type PublicTranscript = TranscriptSegment;

export type CoachPresence = {
  id: string;
  name: string;
  /** Round-trip time (ms) the hub measures: ping → pong. */
  rttMs: number | null;
  connectedAt: number;
  lastSeen: number;
  userAgent?: string;
};

export interface CandidatePresence {
  name: string;
  company: string;
  listening: boolean;
  autoAnswer: boolean;
  tone: AnswerTone;
  startedAt: number | null;
  limitMinutes: number;
  online: boolean;
}

export interface BridgeSnapshot {
  app: string;
  version: string;
  sessionId: string;
  serverTime: number;
  candidate: CandidatePresence;
  transcript: PublicTranscript[];
  answers: PublicAnswer[];
  models: PublicModel[];
  selectedModel: string;
  coaches: CoachPresence[];
}

export interface BridgeStatus {
  running: boolean;
  port: number;
  /** Ready-to-paste URLs, one per LAN address. */
  urls: string[];
  /** Primary URL a phone on the same Wi-Fi should open. */
  primaryUrl: string | null;
  qrDataUrl: string | null;
  /** 6-digit pairing PIN for this session (only shown on the candidate's screen). */
  pin: string;
  coaches: CoachPresence[];
  candidate: CandidatePresence;
  error: string | null;
}

/** Commands the hub (LAN server) sends to the candidate app. */
export type HubCommand =
  | { type: 'answer_start'; answer: PublicAnswer }
  | { type: 'answer_chunk'; id: string; chunk: string }
  | { type: 'answer_end'; answer: PublicAnswer }
  | { type: 'answer_error'; id: string; error: string }
  | { type: 'transcript'; transcript: PublicTranscript[] }
  | { type: 'candidate'; candidate: Partial<CandidatePresence> }
  | { type: 'ui_command'; name: 'answer' | 'analyse-screen' | 'reset-context' | 'toggle-listening' | 'scroll-up' | 'scroll-down' }
  | { type: 'set_model'; model: string }
  | { type: 'overlay'; action: 'hide' | 'show' | 'front' | 'opacity_up' | 'opacity_down' | 'scroll_up' | 'scroll_down' }
  | { type: 'transcript_edit'; action: 'add' | 'update' | 'delete'; speaker?: PublicTranscript['speaker']; id?: string; text?: string }
  | { type: 'toast'; message: string; kind?: 'info' | 'error' | 'success' }
  | { type: 'error'; message: string }
  | { type: 'kicked' };

/** Commands a coach may send to the hub. */
export type CoachCommand =
  | { type: 'hint'; text: string; append?: boolean }
  | { type: 'ask'; question?: string }
  | { type: 'scan' }
  | { type: 'regen' }
  | { type: 'nav'; dir: 'prev' | 'next' }
  | { type: 'clear' }
  | { type: 'chat'; text: string }
  | { type: 'auto_answer'; on: boolean }
  | { type: 'set_model'; model: string }
  | { type: 'set_tone'; tone: AnswerTone }
  | { type: 'transcript_add'; speaker: PublicTranscript['speaker']; text: string }
  | { type: 'transcript_update'; id: string; text: string }
  | { type: 'transcript_delete'; id: string }
  | { type: 'overlay'; action: 'hide' | 'show' | 'front' | 'opacity_up' | 'opacity_down' | 'scroll_up' | 'scroll_down' }
  | { type: 'report'; format: 'txt' | 'pdf' };

/** Envelopes exchanged over the WebSocket. */
export type HubMessage =
  | { type: 'hello'; pin: string; name?: string; role?: string }
  | { type: 'pong'; t0: number }
  | { type: 'ping'; t0: number }
  | { type: 'welcome'; snapshot: BridgeSnapshot; you: { id: string; name: string } }
  | { type: 'state'; snapshot: BridgeSnapshot }
  | { type: 'presence'; coaches: CoachPresence[]; candidate: CandidatePresence }
  | { type: 'answer_start'; answer: PublicAnswer }
  | { type: 'answer_chunk'; id: string; chunk: string }
  | { type: 'answer_end'; answer: PublicAnswer }
  | { type: 'answer_error'; id: string; error: string }
  | { type: 'transcript'; transcript: PublicTranscript[] }
  | { type: 'hint'; text: string; by: string }
  | { type: 'chat'; text: string; by: string }
  | { type: 'report_ready'; format: 'txt' | 'pdf'; url: string }
  | { type: 'toast'; message: string; kind?: 'info' | 'error' | 'success' }
  | { type: 'error'; message: string }
  | { type: 'kicked' };

export const BRIDGE_PORT_DEFAULT = 47821;
