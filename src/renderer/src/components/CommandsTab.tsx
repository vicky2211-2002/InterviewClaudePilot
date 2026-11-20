import React from 'react';
import { Shortcut } from './Keycap';

interface Row {
  keys: string[];
  title: string;
  description: string;
}

const PRIMARY: Row[] = [
  {
    keys: ['Ctrl', 'Enter'],
    title: 'Generate Answer',
    description:
      "Generates a fast, concise answer to any interviewer's asked question using the live transcript. This mode does NOT capture your screen. Requires: listening active + transcript captured.",
  },
  {
    keys: ['Ctrl', 'Shift', 'Enter'],
    title: 'Analyse Screen and Generate Answer',
    description:
      "Captures your screen, then generates an answer using on-screen content + transcript. Use for coding questions, code review, or any visual context. Requires: Screen Vision enabled in Settings → Screen analysis (vision) + a multimodal model (GPT-4o, Claude 3.5, Gemini 1.5, etc.).",
  },
];

const SECONDARY: Row[] = [
  {
    keys: ['Ctrl', 'Alt', 'Enter'],
    title: 'Chat with AI',
    description: 'Opens the chat box to ask the AI assistant any question. Toggle "Use Screen" in chat to include screenshots.',
  },
  {
    keys: ['Ctrl', 'R'],
    title: 'Reset Context',
    description: 'Clears conversation history, answers, chat, and screenshots — start fresh.',
  },
  {
    keys: ['Ctrl', 'Shift', 'L'],
    title: 'Start / Stop Listening',
    description: 'Toggles live transcription (loopback audio + microphone). MUST be ON for answers to work.',
  },
  {
    keys: ['Ctrl', 'H'],
    title: 'Take Screenshot (×10 max)',
    description: 'Capture current screen. Press multiple times for multi-image context (up to 10). Toast shows count. Used by "Analyse Screen" and chat with "Use Screen".',
  },
  {
    keys: ['Ctrl', 'Delete'],
    title: 'Delete Last Screenshot',
    description: 'Removes the most recent screenshot from context. Shows remaining count in toast.',
  },
  {
    keys: ['Ctrl', '\\'],
    title: 'Hide / Show App',
    description: 'Toggle InterviewClaudePilte visibility instantly.',
  },
  {
    keys: ['Ctrl', 'Q'],
    title: 'Quit App',
    description: 'Quit the application.',
  },
  {
    keys: ['Ctrl', 'Shift', 'Alt', 'O'],
    title: 'Relaunch App',
    description: 'Relaunch the app if it was quit via Ctrl+Q within the last 30 minutes.',
  },
  {
    keys: ['Ctrl', 'Shift', 'â†‘', 'or', 'â†“'],
    title: 'Scroll / Navigate Answers',
    description:
      "Scroll the current answer vertically. At the top or bottom, the same keys navigate to the previous (Up) or next (Down) answer.",
  },
  {
    keys: ['Ctrl', 'Shift', 'â†', 'or', 'â†’'],
    title: 'Scroll Answers â€” Horizontal',
    description: 'Scroll the current answer horizontally when a horizontal scrollbar is present.',
  },
  {
    keys: ['Ctrl', 'â†', 'or', 'â†’'],
    title: 'Move App Horizontally',
    description: "Adjust the application's position left or right on your screen.",
  },
  {
    keys: ['Ctrl', '[', 'or', ']'],
    title: 'Adjust Transparency',
    description: 'Increase or decrease the app opacity for better visibility.',
  },
];

function RowItem({ row }: { row: Row }) {
  return (
    <div className="grid grid-cols-[270px_1fr] items-start gap-8 py-5">
      <Shortcut keys={row.keys} />
      <div>
        <div className="text-[15px] font-semibold text-gray-900">{row.title}</div>
        <p className="mt-1 text-[13.5px] leading-relaxed text-gray-500">{row.description}</p>
      </div>
    </div>
  );
}

export function CommandsTab({ onAction }: { onAction: (action: 'answer' | 'screen' | 'chat' | 'reset') => void }) {
  return (
    <div className="px-6 pb-6">
      <div className="mt-5 rounded-[10px] border border-emerald-300 bg-emerald-50/50 p-6">
        <h3 className="mb-4 text-[16px] font-semibold text-emerald-600">AI Response</h3>
        <div className="divide-y divide-emerald-200/60">
          {PRIMARY.map((row, index) => (
            <button
              key={row.title}
              type="button"
              onClick={() => onAction(index === 0 ? 'answer' : 'screen')}
              className="grid w-full grid-cols-[270px_1fr] items-start gap-8 py-4 text-left"
            >
              <Shortcut keys={row.keys} />
              <div>
                <div className="text-[15px] font-semibold text-gray-900">{row.title}</div>
                <p className="mt-1 text-[13.5px] leading-relaxed text-gray-500">{row.description}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="mt-2 divide-y divide-gray-200">
        {SECONDARY.map((row) => (
          <RowItem key={row.title} row={row} />
        ))}
      </div>
    </div>
  );
}
