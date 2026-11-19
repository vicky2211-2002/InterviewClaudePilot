import React from 'react';
import { Mic } from 'lucide-react';

/** App logo: gradient "IC" tile — replaces the old shield. */
export function IcLogo({ size = 17 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <defs>
        <linearGradient id="ic-tile" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7c6cf0" />
          <stop offset="1" stopColor="#06b6d4" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="22" height="22" rx="6.2" fill="url(#ic-tile)" />
      <text
        x="11.1"
        y="15"
        textAnchor="middle"
        fontFamily="Inter, Segoe UI, sans-serif"
        fontWeight={800}
        fontSize="8.6"
        letterSpacing="0.6"
        fill="#ffffff"
      >
        IC
      </text>
      <polygon
        points="18.7,3.1 19.15,4.6 20.65,5.05 19.15,5.5 18.7,7 18.25,5.5 16.75,5.05 18.25,4.6"
        fill="#67e8f9"
      />
    </svg>
  );
}

interface CommandBarProps {
  listening: boolean;
  elapsed: string;
  level: number;
  onToggleDashboard: () => void;
  onToggleVisibility: () => void;
  onAnswer: () => void;
  onAnalyseScreen: () => void;
  onToggleChat: () => void;
  onToggleListening: () => void;
  busy?: boolean;
}

export function CommandBar({
  listening,
  elapsed,
  level,
  onToggleDashboard,
  onToggleVisibility,
  onAnswer,
  onAnalyseScreen,
  onToggleChat,
  onToggleListening,
  busy,
}: CommandBarProps) {
  return (
    <div
      data-ui
      className="chrome fade-in pointer-events-auto flex items-center gap-1.5 rounded-full px-2 py-1.5 shadow-[0_10px_35px_rgba(0,0,0,0.45)]"
    >
      <button
        type="button"
        onClick={onToggleDashboard}
        data-tip="Click to open dashboard"
        className="tip grid h-[34px] w-[34px] place-items-center rounded-full bg-white text-[#0c0c0e] transition hover:bg-white/90"
      >
        <IcLogo size={19} />
      </button>

      <button type="button" onClick={onAnswer} className="chrome-btn" disabled={busy}>
        Answer
      </button>
      <button type="button" onClick={onAnalyseScreen} className="chrome-btn" disabled={busy}>
        Analyse Screen
      </button>
      <button type="button" onClick={onToggleChat} className="chrome-btn">
        Chat
      </button>
      <button type="button" onClick={onToggleVisibility} className="chrome-btn">
        Show/Hide
      </button>

      <span className="ml-1.5 min-w-[36px] text-center text-[11.5px] font-medium tabular-nums text-white/85">
        {elapsed}
      </span>

      <button
        type="button"
        onClick={onToggleListening}
        data-tip={listening ? 'Stop listening' : 'Start listening'}
        className={`tip relative ml-0.5 grid h-[26px] w-[26px] place-items-center rounded-full transition ${
          listening ? 'bg-red-500 text-white pulse-ring' : 'bg-white text-[#0c0c0e] hover:bg-white/90'
        }`}
      >
        <Mic className="h-[13px] w-[13px]" strokeWidth={2.6} />
        {listening && (
          <span
            className="absolute inset-0 rounded-full border border-white/50"
            style={{ transform: `scale(${1 + level * 0.5})`, opacity: 0.3 + level * 0.4 }}
          />
        )}
      </button>
    </div>
  );
}
