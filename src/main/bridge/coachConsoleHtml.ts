// The Coach Console page served by the LAN hub. A self-contained HTML document —
// no build step, no framework downloads. The coach opens it on any device
// (phone, second laptop), enters the PIN, and lands on a dark-themed
// control room: live transcript (editable), answer stream, latency, hints.

interface ConsoleHtmlOptions {
  appName: string;
  pinRequired: boolean;
}

export function coachConsoleHtml(opts: ConsoleHtmlOptions): string {
  const { appName, pinRequired } = opts;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Coach Console — ${escapeHtml(appName)}</title>
<style>
  :root{--bg:#0b0f14;--panel:#12181f;--panel2:#1a222b;--line:#232d38;--text:#e8edf2;--dim:#8b98a8;--accent:#7c6cf0;--accent2:#38bdf8;--ok:#34d399;--warn:#fbbf24;--err:#f87171}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--text);font:14px/1.5 -apple-system,'Segoe UI',Inter,Roboto,sans-serif;min-height:100vh}
  header{display:flex;align-items:center;gap:12px;padding:10px 16px;background:linear-gradient(180deg,#131a23,#0e141b);border-bottom:1px solid var(--line);position:sticky;top:0;z-index:5}
  .logo{width:34px;height:34px;border-radius:9px;background:linear-gradient(135deg,#7c6cf0,#38bdf8);display:grid;place-items:center;font-weight:700;font-size:15px}
  h1{font-size:15px;margin:0}
  .sub{color:var(--dim);font-size:12px}
  .pill{margin-left:auto;display:flex;align-items:center;gap:8px;border:1px solid var(--line);border-radius:999px;padding:5px 12px;font-size:12px;color:var(--dim)}
  .dot{width:8px;height:8px;border-radius:50%;background:#475569}
  .dot.ok{background:var(--ok);box-shadow:0 0 8px var(--ok)}
  .dot.warn{background:var(--warn)}
  .dot.err{background:var(--err)}
  main{max-width:1100px;margin:0 auto;padding:14px 14px 90px;display:grid;grid-template-columns:1fr 340px;gap:14px}
  @media (max-width: 900px){main{grid-template-columns:1fr}}
  section{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:14px}
  h2{font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:var(--dim);margin:0 0 10px}
  .bar{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px}
  button{background:var(--accent);color:#fff;border:0;border-radius:9px;padding:8px 13px;font-weight:600;cursor:pointer;font-size:13px}
  button.alt{background:var(--panel2);color:var(--text);border:1px solid var(--line)}
  button.ghost{background:transparent;color:var(--dim);border:1px solid var(--line)}
  input,textarea,select{background:var(--panel2);border:1px solid var(--line);color:var(--text);border-radius:9px;padding:8px 10px;font-size:13px;width:100%}
  textarea{resize:vertical;min-height:52px}
  .row{display:flex;gap:8px}
  .row > *{flex:1}
  .transcript{max-height:44vh;overflow-y:auto;display:flex;flex-direction:column;gap:8px;padding-right:4px}
  .seg{border:1px solid var(--line);border-radius:10px;padding:9px 10px;background:var(--panel2)}
  .seg .who{font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--accent2);display:flex;justify-content:space-between;gap:8px;cursor:pointer}
  .seg .who.candidate{color:#fbbf24}
  .seg p{margin:5px 0 0;white-space:pre-wrap;word-break:break-word}
  .seg textarea{margin-top:6px}
  .seg .row{margin-top:6px}
  .answers{display:flex;flex-direction:column;gap:8px;max-height:34vh;overflow-y:auto}
  .answer{border:1px solid var(--line);border-left:3px solid var(--accent);border-radius:10px;padding:10px;background:var(--panel2)}
  .answer .meta{font-size:11px;color:var(--dim);display:flex;justify-content:space-between;gap:8px}
  .answer pre{white-space:pre-wrap;word-break:break-word;margin:6px 0 0}
  .latency{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;text-align:center}
  .metric{background:var(--panel2);border:1px solid var(--line);border-radius:10px;padding:10px 6px}
  .metric b{display:block;font-size:17px}
  .metric span{font-size:10px;color:var(--dim);letter-spacing:.06em;text-transform:uppercase}
  .hintbar{position:fixed;bottom:0;left:0;right:0;background:rgba(11,15,20,.92);backdrop-filter:blur(10px);border-top:1px solid var(--line);padding:10px 14px;display:flex;gap:8px;z-index:6}
  .hintbar input{flex:1}
  .toast{position:fixed;bottom:64px;left:50%;transform:translateX(-50%);background:#1e293b;padding:8px 14px;border-radius:8px;font-size:13px;opacity:0;transition:opacity .2s;pointer-events:none}
  .toast.show{opacity:1}
  dialog{border:1px solid var(--line);background:var(--panel);color:var(--text);border-radius:14px;padding:18px;max-width:420px;width:92vw}
  dialog::backdrop{background:rgba(0,0,0,.6)}
  .hidden{display:none!important}
</style>
</head>
<body>
<header>
  <div class="logo">${escapeHtml(appName.charAt(0).toUpperCase())}</div>
  <div>
    <h1>Coach Console</h1>
    <div class="sub">${escapeHtml(appName)} · LAN session</div>
  </div>
  <div class="pill"><span class="dot warn" id="connDot"></span><span id="connText">Connecting…</span></div>
</header>

<main>
  <div>
    <section>
      <h2>Live Transcript <button class="ghost" style="float:right;padding:2px 8px" onclick="toggleEditAll()">Edit</button></h2>
      <div class="bar">
        <select id="addSpeaker" style="max-width:130px">
          <option value="interviewer">Interviewer</option>
          <option value="candidate">Candidate</option>
          <option value="system">Note</option>
        </select>
        <input id="addText" placeholder="Type a line and press Enter…" style="flex:1" onkeydown="if(event.key==='Enter')addSegment()">
        <button class="alt" onclick="addSegment()">Add</button>
      </div>
      <div id="transcript" class="transcript"><div class="sub">Waiting for the candidate to start listening…</div></div>
    </section>
    <section style="margin-top:12px">
      <h2>Answers</h2>
      <div id="answers" class="answers"><div class="sub">No answers yet.</div></div>
    </section>
  </div>

  <div>
    <section>
      <h2>Session</h2>
      <div class="latency">
        <div class="metric"><b id="mRtt">—</b><span>Latency RTT</span></div>
        <div class="metric"><b id="mCoaches">1</b><span>Coaches</span></div>
        <div class="metric"><b id="mTime">—</b><span>Elapsed</span></div>
      </div>
      <div style="margin-top:10px" class="sub" id="candidateInfo">Candidate: …</div>
      <div class="row" style="margin-top:10px">
        <button class="alt" onclick="cmd({type:'ask'})">Ask AI</button>
        <button class="alt" onclick="cmd({type:'regen'})">Regenerate</button>
        <button class="alt" onclick="cmd({type:'scan'})">Scan Screen</button>
      </div>
      <div class="row" style="margin-top:8px">
        <button class="ghost" onclick="cmd({type:'nav',dir:'prev'})">← Prev Answer</button>
        <button class="ghost" onclick="cmd({type:'nav',dir:'next'})">Next Answer →</button>
        <button class="ghost" onclick="cmd({type:'clear'})">Clear</button>
      </div>
    </section>

    <section style="margin-top:12px">
      <h2>Context for the AI</h2>
      <div class="sub" style="margin-bottom:8px">Applied to the next answer request. Edit candidate context live.</div>
      <textarea id="instructions" placeholder="Extra instructions for tonight's interview…"></textarea>
      <div class="row" style="margin-top:8px">
        <select id="tone">
          <option value="professional">Professional</option>
          <option value="confident">Confident</option>
          <option value="humble">Humble</option>
          <option value="technical">Technical</option>
        </select>
        <button class="alt" onclick="saveTone()">Set Tone</button>
      </div>
      <div class="row" style="margin-top:8px">
        <label style="flex:1"><input type="checkbox" id="autoAnswer" onchange="cmd({type:'auto_answer',on:this.checked})"> Auto-answer</label>
      </div>
    </section>
  </div>
</main>

<div class="hintbar">
  <input id="hintInput" placeholder="Type a hint — it appears on the candidate's screen…" onkeydown="if(event.key==='Enter')sendHint()">
  <button onclick="sendHint()">Send</button>
</div>

<div id="toast" class="toast"></div>

${pinRequired ? '' : ''}
<script>
const params = new URLSearchParams(location.search);
let pin = params.get('pin') || sessionStorage.getItem('coachPin') || '';
if (!pin) {
  pin = prompt('Enter the 6-digit PIN shown on the candidate\'s screen') || '';
  sessionStorage.setItem('coachPin', pin);
}
let ws;
let transcript = [];
let answers = [];
let candidate = { name: 'Candidate', company: '', listening: false, autoAnswer: false, tone: 'professional', startedAt: null, limitMinutes: 0, online: true };
let coaches = [];
let selectedTone = 'professional';
let startedAt = Date.now();

function connect() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(proto + '://' + location.host + '/ws');
  ws.onopen = () => ws.send(JSON.stringify({ type: 'hello', pin, name: 'Coach', role: 'coach' }));
  ws.onmessage = (event) => {
    let msg; try { msg = JSON.parse(event.data); } catch { return; }
    handle(msg);
  };
  ws.onclose = () => {
    setConn(false);
    setTimeout(connect, 3000);
  };
  ws.onerror = () => ws.close();
}

function setConn(ok) {
  const dot = document.getElementById('connDot');
  const text = document.getElementById('connText');
  dot.className = 'dot ' + (ok ? 'ok' : 'err');
  text.textContent = ok ? 'Connected' : 'Disconnected';
}

function handle(msg) {
  switch (msg.type) {
    case 'welcome':
      setConn(true);
      applySnapshot(msg.snapshot);
      return;
    case 'state':
      applySnapshot(msg.snapshot);
      return;
    case 'presence':
      coaches = msg.coaches || [];
      document.getElementById('mCoaches').textContent = String(coaches.length || 1);
      return;
    case 'transcript':
      transcript = msg.transcript || [];
      renderTranscript();
      return;
    case 'answer_start':
      answers.push({ ...msg.answer, streaming: true });
      renderAnswers();
      return;
    case 'answer_chunk':
      answers = answers.map(a => a.id === msg.id ? { ...a, text: a.text + msg.chunk } : a);
      renderAnswers();
      return;
    case 'answer_end':
      answers = answers.map(a => a.id === msg.id ? { ...a, ...msg.answer, streaming: false } : a);
      renderAnswers();
      return;
    case 'answer_error':
      answers = answers.map(a => a.id === msg.id ? { ...a, error: msg.error, streaming: false } : a);
      renderAnswers();
      return;
    case 'hint':
      showToast('Hint from ' + msg.by + ': ' + msg.text);
      return;
    case 'chat':
      showToast(msg.by + ': ' + msg.text);
      return;
    case 'toast':
      showToast(msg.message);
      return;
    case 'error':
      showToast(msg.message);
      return;
    case 'kicked':
      showToast('Session ended');
      ws.close();
      return;
  }
}

function applySnapshot(snap) {
  transcript = snap.transcript || [];
  answers = snap.answers || [];
  candidate = snap.candidate || candidate;
  coaches = snap.coaches || [];
  startedAt = candidate.startedAt || Date.now();
  renderTranscript();
  renderAnswers();
  document.getElementById('mCoaches').textContent = String(coaches.length || 1);
  document.getElementById('candidateInfo').textContent =
    'Candidate: ' + (candidate.name || '—') + (candidate.company ? ' @ ' + candidate.company : '') +
    ' · tone: ' + (candidate.tone || 'professional') + ' · listening: ' + (candidate.listening ? 'yes' : 'no');
  document.getElementById('autoAnswer').checked = !!candidate.autoAnswer;
  document.getElementById('tone').value = candidate.tone || 'professional';
  selectedTone = candidate.tone || 'professional';
}

function renderTranscript() {
  const box = document.getElementById('transcript');
  if (!transcript.length) { box.innerHTML = '<div class="sub">Waiting for the candidate to start listening…</div>'; return; }
  box.innerHTML = transcript.map(seg =>
    '<div class="seg" data-id="' + escapeHtml(seg.id) + '">'
    + '<div class="who ' + (seg.speaker === 'candidate' ? 'candidate' : '') + '">'
    + '<span>' + escapeHtml(seg.speaker === 'candidate' ? 'Candidate' : seg.speaker === 'interviewer' ? 'Interviewer' : 'System') + '</span>'
    + '<span><button class="ghost" style="padding:2px 8px" onclick="editSegment(\'' + escapeHtml(seg.id) + '\')">Edit</button>'
    + '<button class="ghost" style="padding:2px 8px;color:#f87171" onclick="deleteSegment(\'' + escapeHtml(seg.id) + '\')">Del</button></span>'
    + '</div><p>' + escapeHtml(seg.text) + '</p>'
    + '</div>'
  ).join('');
}

function renderAnswers() {
  const box = document.getElementById('answers');
  if (!answers.length) { box.innerHTML = '<div class="sub">No answers yet.</div>'; return; }
  box.innerHTML = answers.slice().reverse().map(a =>
    '<div class="answer"><div class="meta"><span>' + (a.origin || 'coach') + ' · ' + escapeHtml(a.model || '') + '</span>'
    + '<span>' + (a.streaming ? '…' : (a.confidence != null ? 'conf ' + Math.round(a.confidence * 100) + '%' : '')) + '</span></div>'
    + '<pre>' + escapeHtml(a.text || '') + '</pre></div>'
  ).join('');
}

function escapeHtml(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

function cmd(obj) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj)); }

function addSegment() {
  const input = document.getElementById('addText');
  const text = input.value.trim();
  if (!text) return;
  cmd({ type: 'transcript_add', speaker: document.getElementById('addSpeaker').value, text });
  input.value = '';
}

function sendHint() {
  const input = document.getElementById('hintInput');
  const text = input.value.trim();
  if (!text) return;
  cmd({ type: 'hint', text });
  input.value = '';
}

function saveTone() { cmd({ type: 'set_tone', tone: document.getElementById('tone').value }); }

let editAll = false;
function toggleEditAll() { editAll = !editAll; renderTranscript(); }

function editSegment(id) {
  const seg = transcript.find(s => s.id === id);
  if (!seg) return;
  const next = prompt('Edit segment text', seg.text);
  if (next !== null) cmd({ type: 'transcript_update', id, text: next });
}

function deleteSegment(id) { if (confirm('Delete this segment?')) cmd({ type: 'transcript_delete', id }); }

function pingLoop() {
  const t0 = Date.now();
  cmd({ type: 'ping', t0 });
  setTimeout(() => { document.getElementById('mRtt').textContent = (Date.now() - t0 - 0) + ' ms'; pingLoop(); }, 5000);
}

setInterval(() => {
  const el = document.getElementById('mTime');
  const sec = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
  el.textContent = Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');
}, 1000);

connect();
pingLoop();
</script>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c));
}
