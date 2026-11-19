import React, { useEffect, useState } from 'react';
import { Copy, Check, Radio, Users, Timer, RefreshCw, Play, Square } from 'lucide-react';
import QRCode from 'qrcode';
import { BridgeStatus } from '@shared/bridge';
import { Settings } from '@shared/types';
import { ANSWER_TONES } from '@shared/bridge';

interface CoachTabProps {
  settings: Settings;
  onUpdate: (partial: Partial<Settings>) => void;
}

function timeAgo(ts: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  return `${m}m ${String(s % 60).padStart(2, '0')}s ago`;
}

function rttBadge(rttMs: number | null): { label: string; className: string } {
  if (rttMs == null) return { label: '…', className: 'text-gray-400 border-gray-200 bg-gray-50' };
  if (rttMs < 80) return { label: `${rttMs} ms`, className: 'text-emerald-700 border-emerald-300 bg-emerald-50' };
  if (rttMs < 250) return { label: `${rttMs} ms`, className: 'text-amber-700 border-amber-300 bg-amber-50' };
  return { label: `${rttMs} ms`, className: 'text-red-600 border-red-300 bg-red-50' };
}

/**
 * Coach Console — lets someone on the same Wi-Fi (a coach, a friend, a second
 * laptop, a phone) watch the interview live, edit the transcript, push
 * answers to the screen, and chat — all without any cloud account.
 */
export function CoachTab({ settings, onUpdate }: CoachTabProps) {
  const [status, setStatus] = useState<BridgeStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState<'url' | 'pin' | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [, setTick] = useState(0);

  // Poll the bridge every 2 s while the tab is open so coach RTTs stay live.
  useEffect(() => {
    let stopped = false;
    const refresh = () => {
      window.electronAPI
        .getBridgeStatus()
        .then((s) => !stopped && setStatus(s))
        .catch(() => undefined);
    };
    refresh();
    const id = window.setInterval(refresh, 2000);
    // Re-render once a second for the "last seen" labels.
    const tick = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => {
      stopped = true;
      window.clearInterval(id);
      window.clearInterval(tick);
    };
  }, []);

  // Generate a QR whenever the primary URL changes.
  useEffect(() => {
    const url = status?.primaryUrl;
    if (!url) {
      setQr(null);
      return;
    }
    QRCode.toDataURL(url, { width: 168, margin: 1 })
      .then(setQr)
      .catch(() => setQr(null));
  }, [status?.primaryUrl]);

  const running = status?.running ?? false;
  const anyLan = !!status?.primaryUrl;

  const toggleBridge = async () => {
    setBusy(true);
    setError('');
    try {
      if (running) {
        const next = await window.electronAPI.stopBridge();
        setStatus(next);
        onUpdate({ coachEnabled: false });
      } else {
        const next = await window.electronAPI.startBridge();
        setStatus(next);
        if (next.running) onUpdate({ coachEnabled: true });
        else if (next.error) setError(next.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const copyText = async (text: string, kind: 'url' | 'pin') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      window.setTimeout(() => setCopied(null), 1800);
    } catch {
      /* clipboard unavailable */
    }
  };

  const resetSession = () => {
    onUpdate({ sessionStartedAt: Date.now() });
  };

  const candidateName = settings.candidateName || '';
  const tone = settings.answerTone ?? 'professional';

  return (
    <div className="space-y-4 px-6 pb-6 pt-5">
      {/* Bridge on / off */}
      <section className="section">
        <div className="flex items-start justify-between gap-6">
          <div className="min-w-0">
            <h3 className="text-[16px] font-semibold text-gray-900">Coach Console (LAN)</h3>
            <p className="mt-1 max-w-[640px] text-[13px] leading-relaxed text-gray-500">
              Any phone, laptop or tablet on the same Wi‑Fi can open the console, watch the live transcript,
              edit it, and nudge you during the interview — no account, no cloud, exact pin-protected local link.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void toggleBridge()}
            disabled={busy}
            className={`flex shrink-0 items-center gap-2 rounded-lg px-4 py-2.5 text-[13.5px] font-semibold text-white transition ${
              running ? 'bg-red-500 hover:bg-red-600' : 'bg-emerald-500 hover:bg-emerald-600'
            } disabled:opacity-50`}
          >
            {running ? <Square className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            {busy ? 'Working…' : running ? 'Turn off' : 'Turn on'}
          </button>
        </div>

        {error && <p className="mt-2 break-words text-[12.5px] text-red-600">{error}</p>}

        {running && (
          <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
            <div className="flex flex-wrap items-center gap-5">
              {qr && (
                <div className="rounded-lg border border-emerald-200 bg-white p-2">
                  <img src={qr} alt="Coach console QR code" width={140} height={140} />
                  <p className="mt-1 text-center text-[10px] font-medium uppercase tracking-wide text-emerald-700">
                    Scan to open
                  </p>
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-wide text-emerald-800">
                  <Radio className="h-4 w-4" /> Live — waiting for your coach
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <code className="block w-full truncate rounded-md border border-emerald-200 bg-white px-3 py-2 text-[13px] text-gray-800">
                    {status?.primaryUrl ?? 'No LAN address found'}
                  </code>
                  <button
                    type="button"
                    onClick={() => status?.primaryUrl && void copyText(status.primaryUrl, 'url')}
                    className="shrink-0 rounded-md border border-emerald-300 bg-white p-2 text-emerald-700 hover:bg-emerald-100"
                    aria-label="Copy console URL"
                  >
                    {copied === 'url' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </button>
                </div>
                {!anyLan && (
                  <p className="mt-1 text-[11px] text-amber-700">
                    No LAN IPv4 detected — check your Wi‑Fi connection. Port: {status?.port}
                  </p>
                )}
                <div className="mt-3 flex items-end gap-4">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Pairing PIN</div>
                    <div className="mt-0.5 flex items-center gap-2">
                      <span className="font-mono text-3xl font-bold tracking-[0.35em] text-gray-900">
                        {status?.pin ?? '------'}
                      </span>
                      <button
                        type="button"
                        onClick={() => status?.pin && void copyText(status.pin, 'pin')}
                        className="rounded-md border border-gray-200 bg-white p-1.5 text-gray-500 hover:bg-gray-50"
                        aria-label="Copy PIN"
                      >
                        {copied === 'pin' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                  <p className="max-w-[220px] text-[11px] leading-snug text-gray-500">
                    The coach enters this PIN once, on the console page. It changes every time you turn the console on.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Connected coaches + latency */}
      <section className="section">
        <h3 className="flex items-center gap-2 text-[15px] font-semibold text-gray-900">
          <Users className="h-4 w-4" /> Connected coaches
          <span className="ml-1 rounded-full bg-gray-100 px-2 py-0.5 text-[12px] font-semibold text-gray-700">
            {status?.coaches.length ?? 0}
          </span>
          <button
            type="button"
            className="tip ml-auto rounded-md border border-gray-200 p-1.5 text-gray-400 hover:bg-gray-50"
            data-tip="Refresh now"
            onClick={() => window.electronAPI.getBridgeStatus().then(setStatus).catch(() => undefined)}
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </h3>
        <div className="mt-2 space-y-2">
          {(status?.coaches ?? []).length === 0 && (
            <div className="rounded-lg border border-dashed border-gray-300 p-4 text-center text-[12.5px] text-gray-400">
              No coaches yet. {running ? 'Share the URL + PIN above — the console opens on any device.' : 'Turn the console on to pair a coach.'}
            </div>
          )}
          {(status?.coaches ?? []).map((coach) => {
            const badge = rttBadge(coach.rttMs);
            return (
              <div key={coach.id} className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-3">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-indigo-100 text-[13px] font-bold text-indigo-700">
                  {(coach.name || 'C').slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-medium text-gray-900">{coach.name}</div>
                  <div className="text-[11px] text-gray-400">
                    connected {timeAgo(coach.connectedAt)} · last seen {timeAgo(coach.lastSeen)}
                  </div>
                </div>
                <div className="text-right">
                  <span className={`inline-block rounded-full border px-2.5 py-1 font-mono text-[11px] font-semibold ${badge.className}`}>
                    {badge.label}
                  </span>
                  <div className="mt-0.5 text-[10px] uppercase tracking-wide text-gray-400">RTT</div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Session context */}
      <section className="section">
        <h3 className="text-[15px] font-semibold text-gray-900">This session</h3>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <div className="md:col-span-2">
            <label className="mb-1 block text-[12.5px] font-medium text-gray-600">Your name (shown to the coach)</label>
            <input
              className="field"
              placeholder="e.g. Vivek"
              value={candidateName}
              onChange={(event) => onUpdate({ candidateName: event.target.value })}
            />
          </div>
          <div>
            <label className="mb-1 block text-[12.5px] font-medium text-gray-600">Answer tone</label>
            <div className="grid grid-cols-2 gap-1.5">
              {ANSWER_TONES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => onUpdate({ answerTone: t.id })}
                  className={`rounded-md border px-2 py-1.5 text-[12px] font-medium transition ${
                    tone === t.id
                      ? 'border-emerald-400 bg-emerald-50 text-emerald-800'
                      : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                  }`}
                  title={t.hint}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="mb-1 block text-[12.5px] font-medium text-gray-600">Session limit</label>
            <div className="flex items-center gap-2">
              <input
                className="field w-24"
                type="number"
                min={5}
                max={240}
                value={settings.sessionLimitMinutes ?? 30}
                onChange={(event) => onUpdate({ sessionLimitMinutes: Math.max(1, Number(event.target.value) || 30) })}
              />
              <span className="text-[12px] text-gray-500">minutes</span>
              {settings.sessionStartedAt && (
                <button
                  type="button"
                  onClick={resetSession}
                  className="flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1.5 text-[12px] font-medium text-gray-600 hover:bg-gray-50"
                  title="Restart the timer"
                >
                  <Timer className="h-3.5 w-3.5" /> Reset
                </button>
              )}
              {!settings.sessionStartedAt && (
                <button
                  type="button"
                  onClick={resetSession}
                  className="flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1.5 text-[12px] font-medium text-gray-600 hover:bg-gray-50"
                >
                  <Play className="h-3.5 w-3.5" /> Start
                </button>
              )}
            </div>
          </div>
          <label className="flex items-center gap-3 text-[13px] text-gray-800 md:col-span-2">
            <input
              type="checkbox"
              className="h-4 w-4 accent-emerald-500"
              checked={!!settings.autoAnswer}
              onChange={(event) => onUpdate({ autoAnswer: event.target.checked })}
            />
            Auto-answer when a question is detected (the coach can also toggle this from the console)
          </label>
        </div>
      </section>

      <p className="flex items-center gap-2 text-[11px] leading-snug text-gray-400">
        <Radio className="h-3.5 w-3.5 shrink-0" />
        Everything stays on your local network — no audio, transcript or answers ever leave this Wi‑Fi. The console
        stops working as soon as you turn it off or quit the app.
      </p>
    </div>
  );
}
