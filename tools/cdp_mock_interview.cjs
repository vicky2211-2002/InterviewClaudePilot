#!/usr/bin/env node
/**
 * Mock interview through the app's real AI pipeline (CDP).
 *   node tools/cdp_mock_interview.cjs 9228
 *
 * Sends a full 3-round × 10-question mock interview (30 questions) via
 * ask(mode: 'chat') and records the streamed answers from the app.
 * Run tools/mock_provider.cjs first and point Settings → API at it
 * (base URL http://127.0.0.1:8787/v1, key mock-key, model mock-model).
 *
 * Prints a per-question report and an overall result line; exits non-zero
 * if any question fails or streams an empty answer.
 */
const fs = require('fs');

const PORT = process.argv[2] || '9228';
const QUESTION_TIMEOUT_MS = 170_000;

const ROUNDS = [
  {
    round: 'Round 1 — HR / Introduction',
    questions: [
      'Tell me about yourself.',
      'Why are you looking for a new role right now?',
      'Walk me through your resume. What experience is most relevant here?',
      'What is your greatest weakness, and how are you working on it?',
      'Why do you want to work at this company?',
      'What are your salary expectations?',
      'Where do you see yourself in five years?',
      'Why should we hire you over other candidates?',
      'What kind of work environment helps you do your best work?',
      'What are you looking for in your next manager or team?',
    ],
  },
  {
    round: 'Round 2 — Technical',
    questions: [
      'Walk me through the most technically challenging project you have built. What was hard about it, and what did you do?',
      'How would you design a URL shortener? Talk me through your high-level design and the trade-offs.',
      'Tell me about a time a production issue taught you something. How did you debug it?',
      'How do you keep your code reliable day to day — testing, reviews, anything else?',
      'Explain the difference between a process and a thread. When would you choose one over the other?',
      'How would you design a rate limiter for a public API?',
      'What happens when you type a URL into a browser and press Enter?',
      'How do databases use indexes, and how do you decide when to add one?',
      'How would you handle a sudden 10x spike in traffic to a service you own?',
      'When would you choose eventual consistency over strong consistency?',
    ],
  },
  {
    round: 'Round 3 — Behavioral & close',
    questions: [
      'Describe a time you disagreed with a teammate or a manager. How did you handle it?',
      'Tell me about a time you missed a deadline. What did you do?',
      'Tell me about a time you took ownership of something that was not your responsibility.',
      'Tell me about a time you received difficult feedback. How did you respond?',
      'Describe a time you had to learn a new technology quickly. How did you approach it?',
      'Tell me about a time you mentored or helped a colleague grow.',
      'Describe a time you failed. What did you learn from it?',
      'How do you stay productive and avoid burnout in fast-paced environments?',
      'Do you have any questions for us?',
      'What concerns you most about this role, and how would you address them?',
    ],
  },
];

const TOTAL = ROUNDS.reduce((sum, r) => sum + r.questions.length, 0);

let ws;
let nextId = 0;
const pending = new Map();

function cdpSend(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression) {
  const result = await cdpSend('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || 'evaluation failed');
  }
  return result.result.value;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

(async () => {
  const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  const page = targets.find((t) => t.type === 'page');
  if (!page) {
    console.error('No page target. Launch the app with --remote-debugging-port.');
    process.exit(1);
  }

  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve) => (ws.onopen = resolve));
  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    message.error ? reject(new Error(JSON.stringify(message.error))) : resolve(message.result);
  };

  await cdpSend('Page.enable');

  let ok = 0;
  let failed = 0;
  let empty = 0;

  for (const [index, roundInfo] of ROUNDS.entries()) {
    let qIndex = ROUNDS.slice(0, index).reduce((sum, r) => sum + r.questions.length, 0);

    console.log(`\n########## ${roundInfo.round} ##########\n`);

    for (const question of roundInfo.questions) {
      qIndex += 1;
      const id = `mock_q${qIndex}_${Date.now()}`;
      const marker = `__mock_done_${id}`;
      const textVar = `__mock_text_${id}`;
      const errVar = `__mock_err_${id}`;

      // Install per-question collector in the page
      await evaluate(`window.${textVar} = ''; window.${marker} = false; window.${errVar} = '';`);
      await evaluate(`(() => {
        const offChunk = window.electronAPI.onAnswerChunk(({ id: cid, chunk }) => { if (cid === '${id}') window.${textVar} += chunk; });
        const offEnd = window.electronAPI.onAnswerEnd(({ id: cid }) => { if (cid === '${id}') { window.${marker} = true; offChunk(); offEnd(); offErr(); } });
        const offErr = window.electronAPI.onAnswerError(({ id: cid, error }) => { if (cid === '${id}') { window.${errVar} = error || 'unknown'; window.${marker} = true; offChunk(); offEnd(); offErr(); } });
      })(); true`);

      const started = Date.now();
      const result = await evaluate(`window.electronAPI.ask({ id: '${id}', mode: 'chat', question: ${JSON.stringify(
        question,
      )} })`);
      const duration = Date.now() - started;

      // Wait for streaming completion
      const deadline = Date.now() + QUESTION_TIMEOUT_MS;
      while (Date.now() < deadline) {
        const done = await evaluate(`window.${marker}`);
        if (done) break;
        await sleep(500);
      }
      const answer = String(await evaluate(`window.${textVar}`) ?? '');
      const err = String(await evaluate(`window.${errVar}`) ?? '');

      console.log(`--- Q${qIndex}/${TOTAL} (${duration} ms) ok=${result?.ok} ---`);
      console.log(`Q: ${question}`);
      if (err) {
        failed += 1;
        console.log(`ERROR: ${err}`);
      } else if (answer.trim().length === 0) {
        empty += 1;
        console.log('EMPTY ANSWER — provider returned nothing.');
      } else {
        ok += 1;
        console.log(`A (${answer.length} chars):`);
        console.log(answer.trim());
      }
      console.log('');
    }
  }

  console.log('=======================================================');
  console.log(`MOCK INTERVIEW RESULT: ${ok}/${TOTAL} streamed answers OK, ${failed} errors, ${empty} empty`);
  console.log('=======================================================');
  process.exit(failed + empty > 0 ? 1 : 0);
})().catch((error) => {
  console.error('mock interview failed:', error.message);
  process.exit(1);
});
