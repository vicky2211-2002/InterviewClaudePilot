import React, { useState } from 'react';
import { Check, Pencil, Trash2, Plus, X } from 'lucide-react';
import { TranscriptSegment } from '@shared/types';

interface TranscriptTabProps {
  transcript: TranscriptSegment[];
}

const SPEAKERS: { id: TranscriptSegment['speaker']; label: string; className: string }[] = [
  { id: 'interviewer', label: 'Interviewer', className: 'text-amber-600 border-amber-300 bg-amber-50' },
  { id: 'candidate', label: 'Candidate', className: 'text-emerald-600 border-emerald-300 bg-emerald-50' },
  { id: 'system', label: 'Note', className: 'text-sky-700 border-sky-300 bg-sky-50' },
];

function speakerLabel(s: TranscriptSegment['speaker']): string {
  return SPEAKERS.find((x) => x.id === s)?.label ?? s;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}

/**
 * Live, editable transcript. Add / edit / delete segments — the same
 * mutations flow to any coach connected over the LAN bridge, and vice versa.
 */
export function TranscriptTab({ transcript }: TranscriptTabProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [adding, setAdding] = useState(false);
  const [addSpeaker, setAddSpeaker] = useState<TranscriptSegment['speaker']>('interviewer');
  const [addText, setAddText] = useState('');
  const [notice, setNotice] = useState('');

  const push = (action: 'add' | 'update' | 'delete', segment: TranscriptSegment) => {
    window.electronAPI.pushCoachEdit(action, segment);
  };

  const saveEdit = (seg: TranscriptSegment) => {
    const text = draft.trim();
    if (text) push('update', { ...seg, text });
    setEditingId(null);
    setDraft('');
  };

  const remove = (seg: TranscriptSegment) => {
    push('delete', seg);
  };

  const addSegment = () => {
    const text = addText.trim();
    if (!text) return;
    push('add', {
      id: `manual_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      speaker: addSpeaker,
      text,
      timestamp: Date.now(),
      isFinal: true,
    });
    setAddText('');
    setAdding(false);
    setNotice('Segment added — synced with the coach console.');
    window.setTimeout(() => setNotice(''), 2500);
  };

  return (
    <div className="px-6 pb-6 pt-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="text-[16px] font-semibold text-gray-900">Live Transcript</h3>
          <p className="mt-0.5 text-[12.5px] text-gray-500">
            {transcript.length === 0
              ? 'Start listening and the interview will appear here — live.'
              : `${transcript.length} segment${transcript.length === 1 ? '' : 's'} — every add / edit / delete syncs to the coach console over LAN.`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          className="flex items-center gap-1.5 rounded-md bg-gray-900 px-3 py-2 text-[13px] font-medium text-white"
        >
          {adding ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {adding ? 'Close' : 'Add segment'}
        </button>
      </div>

      {notice && <p className="mt-2 text-[12px] text-emerald-600">{notice}</p>}

      {adding && (
        <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <select
              className="field w-auto"
              value={addSpeaker}
              onChange={(event) => setAddSpeaker(event.target.value as TranscriptSegment['speaker'])}
            >
              {SPEAKERS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
            <input
              className="field min-w-0 flex-1"
              autoFocus
              placeholder="Type the segment text…"
              value={addText}
              onChange={(event) => setAddText(event.target.value)}
              onKeyDown={(event) => event.key === 'Enter' && addSegment()}
            />
            <button
              type="button"
              onClick={addSegment}
              className="shrink-0 rounded-md bg-emerald-500 px-3 py-2 text-[13px] font-medium text-white"
            >
              Add
            </button>
          </div>
        </div>
      )}

      <div className="mt-4 max-h-[46vh] space-y-2 overflow-y-auto pr-1">
        {transcript.length === 0 && (
          <div className="rounded-lg border border-dashed border-gray-300 p-6 text-center text-[13px] text-gray-400">
            Nothing transcribed yet. Press Ctrl+Shift+L or the mic button to start listening.
          </div>
        )}
        {transcript.map((seg) => {
          const editing = editingId === seg.id;
          const meta = SPEAKERS.find((s) => s.id === seg.speaker);
          return (
            <div key={seg.id} className="rounded-lg border border-gray-200 bg-white p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                      meta?.className ?? 'text-gray-600 border-gray-300 bg-gray-50'
                    }`}
                  >
                    {speakerLabel(seg.speaker)}
                  </span>
                  <span className="text-[11px] tabular-nums text-gray-400">{formatTime(seg.timestamp)}</span>
                  {!seg.isFinal && <span className="text-[10px] font-medium uppercase text-amber-500">live…</span>}
                </div>
                <div className="flex shrink-0 gap-2">
                  {!editing && (
                    <>
                      <button
                        type="button"
                        aria-label="Edit segment"
                        onClick={() => {
                          setEditingId(seg.id);
                          setDraft(seg.text);
                        }}
                        className="rounded p-1.5 text-indigo-600 hover:bg-indigo-50"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        aria-label="Delete segment"
                        onClick={() => remove(seg)}
                        className="rounded p-1.5 text-red-500 hover:bg-red-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </>
                  )}
                </div>
              </div>
              {editing ? (
                <div className="mt-2">
                  <textarea
                    className="field"
                    rows={3}
                    autoFocus
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                  />
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={() => saveEdit(seg)}
                      className="flex items-center gap-1.5 rounded-md bg-emerald-500 px-3 py-1.5 text-[12.5px] font-medium text-white"
                    >
                      <Check className="h-4 w-4" /> Save
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(null);
                        setDraft('');
                      }}
                      className="rounded-md border border-gray-300 px-3 py-1.5 text-[12.5px] font-medium text-gray-600"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <p className="mt-1.5 whitespace-pre-wrap break-words text-[13.5px] leading-relaxed text-gray-800">
                  {seg.text}
                </p>
              )}
            </div>
          );
        })}
      </div>

      <p className="mt-3 text-[11px] text-gray-400">
        Edits here appear instantly for every connected coach — and edits made in the coach console appear here.
      </p>
    </div>
  );
}
