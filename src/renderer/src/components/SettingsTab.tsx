import React, { useEffect, useState } from 'react';
import { ChevronDown, FileText, Sparkles, Zap, Code, Brain, Layout, MessageSquare, AlertCircle, CheckCircle } from 'lucide-react';
import { AIModelOption, Settings, VisionCapableModel } from '@shared/types';
import { Toggle } from './Keycap';

interface SettingsTabProps {
  settings: Settings;
  onUpdate: (partial: Partial<Settings>) => void;
  appVersion: string;
  onPickResume: () => Promise<void>;
  resumeLoading?: boolean;
}

// Interview instruction templates for different scenarios
const INSTRUCTION_TEMPLATES: { key: string; label: string; icon: React.ReactNode; content: string }[] = [
  {
    key: 'coding',
    label: 'Coding Interview',
    icon: <Code className="h-4 w-4" />,
    content: `You are a senior software engineer helping with a live coding interview.

INTERVIEW FORMAT: The interviewer will present a problem (algorithm, data structure, system design, or debugging). You provide the candidate with a clear, step-by-step solution.

YOUR RESPONSE STYLE:
- Start with a brief approach/algorithm explanation (2-3 sentences)
- Provide clean, well-commented code in the requested language
- Include time/space complexity analysis
- Mention edge cases and potential optimizations
- Use bullet points for clarity
- Keep total response under 200 words

CODE FORMAT:
\`\`\`language
// Clear comments explaining each step
function solution(input) {
  // implementation
}
\`\`\`

If the interviewer asks "explain line by line", add inline comments for every line.
If they ask "modify with X approach", adapt the solution accordingly.
If they show code on screen, analyze it and suggest improvements/fixes.`
  },
  {
    key: 'system-design',
    label: 'System Design',
    icon: <Layout className="h-4 w-4" />,
    content: `You are a staff engineer helping with a system design interview.

INTERVIEW FORMAT: The interviewer asks for a scalable system design (e.g., "Design Twitter", "Design a URL shortener").

YOUR RESPONSE STYLE:
- Start with requirements clarification (functional + non-functional)
- High-level architecture diagram description (components, data flow)
- Deep dive into 2-3 key components (database, caching, messaging, etc.)
- Address scalability, availability, consistency trade-offs
- Mention specific technologies where relevant (e.g., Redis, Kafka, PostgreSQL)
- Estimate scale (QPS, storage, bandwidth) and justify choices
- Use bullet points and numbered sections
- Keep response structured but concise

SECTIONS TO COVER:
1. Requirements & Constraints
2. High-Level Architecture
3. Component Deep Dives
4. Data Models & Storage
5. Scaling & Bottlenecks
6. Monitoring & Operations`
  },
  {
    key: 'line-by-line',
    label: 'Line-by-Line Explanation',
    icon: <MessageSquare className="h-4 w-4" />,
    content: `The interviewer is showing code on screen and asking for a line-by-line explanation.

YOUR TASK: Explain EVERY LINE of the visible code clearly and concisely.

FORMAT:
\`\`\`
Line 1: [what this line does]
Line 2: [what this line does]
...
\`\`\`

ADDITIONAL NOTES:
- Identify the overall purpose of the code block
- Point out any bugs, inefficiencies, or anti-patterns
- Suggest improvements if relevant
- If the code is incomplete, note what's missing
- Use simple language; avoid jargon unless the code uses it`
  },
  {
    key: 'modify-approach',
    label: 'Modify Code with Approach',
    icon: <Zap className="h-4 w-4" />,
    content: `The interviewer has shown code and asked to "modify this with [X] approach" (e.g., "use dynamic programming", "make it thread-safe", "add caching", "refactor to use Strategy pattern").

YOUR TASK: 
1. Briefly explain the current approach in the code
2. Explain the requested approach and why it's better/different
3. Provide the modified code with clear comments showing the changes
4. Note any trade-offs (complexity, performance, readability)

FORMAT:
**Current Approach:** [2-3 sentences]
**Requested Approach:** [what changes and why]
**Modified Code:**
\`\`\`language
// Modified code with comments highlighting changes
\`\`\`
**Trade-offs:** [bullet points]`
  },
  {
    key: 'architecture',
    label: 'Architecture Discussion',
    icon: <Brain className="h-4 w-4" />,
    content: `The interviewer is asking an open-ended architecture/design question (e.g., "How would you design a rate limiter?", "Explain microservices vs monolith", "How does Kafka work?").

YOUR RESPONSE STYLE:
- Start with a clear, direct answer (1-2 sentences)
- Provide structured explanation with sections
- Use analogies for complex concepts
- Include practical considerations (trade-offs, when to use, pitfalls)
- Reference real-world examples where applicable
- Keep it conversational but technically accurate
- End with a "Key Takeaway" summary

STRUCTURE:
**Direct Answer:** [1-2 sentences]
**Detailed Explanation:** [bulleted sections]
**Practical Considerations:** [trade-offs, gotchas]
**Key Takeaway:** [one memorable sentence]`
  },
  {
    key: 'behavioral',
    label: 'Behavioral (STAR)',
    icon: <MessageSquare className="h-4 w-4" />,
    content: `The interviewer is asking a behavioral question (e.g., "Tell me about a time you...", "Describe a challenge...", "How do you handle...").

YOUR RESPONSE STYLE: Use the STAR method (Situation, Task, Action, Result).

FORMAT:
**Situation:** [Brief context - 1-2 sentences]
**Task:** [What you needed to accomplish - 1 sentence]
**Action:** [What YOU did specifically - 3-5 bullet points with strong verbs]
**Result:** [Quantifiable outcome - metrics, impact, what you learned]

GUIDELINES:
- Focus on YOUR actions, not the team's
- Use metrics (%, $, time saved, scale)
- Be specific, not generic
- Connect to the role you're interviewing for
- Keep total response under 150 words`
  },
];

interface SettingsTabProps {
  settings: Settings;
  onUpdate: (partial: Partial<Settings>) => void;
  appVersion: string;
  onPickResume: () => Promise<void>;
  resumeLoading?: boolean;
}

const LANGUAGES = [
  'English (US)',
  'English (UK)',
  'Hindi',
  'Spanish',
  'French',
  'German',
  'Portuguese',
  'Italian',
  'Russian',
  'Chinese (Simplified)',
  'Japanese',
  'Korean',
  'Arabic',
];

export function SettingsTab({ settings, onUpdate, appVersion, onPickResume, resumeLoading }: SettingsTabProps) {
  const [instructions, setInstructions] = useState(settings.instructions || '');
  const [availableModels, setAvailableModels] = useState<AIModelOption[]>([]);
  const [visionCapableModels, setVisionCapableModels] = useState<VisionCapableModel[]>([]);
  const [visionModelWarning, setVisionModelWarning] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    window.electronAPI
      .getAvailableModels()
      .then((models) => {
        if (!cancelled) setAvailableModels(models || []);
      })
      .catch(() => {
        if (!cancelled) setAvailableModels([]);
      });
    window.electronAPI
      .getVisionCapableModels()
      .then((models) => {
        if (!cancelled) setVisionCapableModels(models || []);
      })
      .catch(() => {
        if (!cancelled) setVisionCapableModels([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Validate vision model selection
  useEffect(() => {
    if (!settings.visionModel || !settings.screenVisionEnabled) {
      setVisionModelWarning(null);
      return;
    }
    const isVisionCapable = visionCapableModels.some(m => m.id === settings.visionModel);
    if (!isVisionCapable) {
      setVisionModelWarning(`⚠ "${settings.visionModel}" may not support vision. Screen analysis will fall back to text-only. Use a vision-capable model (GPT-4o, Claude 3.5, Gemini 1.5, etc.) or leave "Same as answer model" if that model supports vision.`);
    } else {
      setVisionModelWarning(null);
    }
  }, [settings.visionModel, settings.screenVisionEnabled, visionCapableModels]);

  return (
    <div className="space-y-4 px-6 pb-6 pt-5">
      {/* Undetectable mode */}
      <section className="section">
        <div className="flex items-start justify-between gap-6">
          <div>
            <h3 className="text-[16px] font-semibold text-blue-500">Ultra Undetectable Mode</h3>
            <p className="mt-2 max-w-[760px] text-[14px] leading-relaxed text-gray-500">
              When ON, all mouse activity and text input on the app become completely undetectable and cannot be
              captured by any platforms.
            </p>
            <button
              type="button"
              onClick={() =>
                window.open('https://www.electronjs.org/docs/latest/api/browser-window#winsetcontentprotectionenable-macos-windows', '_blank')
              }
              className="mt-3 text-[13.5px] font-medium text-blue-500 hover:underline"
            >
              How this works →
            </button>
          </div>
          <Toggle
            checked={settings.undetectableMode}
            onChange={(next) => onUpdate({ undetectableMode: next, invisibleOnScreenShare: next })}
            label="Ultra undetectable mode"
          />
        </div>
      </section>

      {/* Task Manager invisibility */}
      <section className="section">
        <div className="flex items-start justify-between gap-6">
          <div>
            <h3 className="text-[16px] font-semibold text-gray-900">Task Manager invisibility</h3>
            <p className="mt-1 text-[14px] text-gray-500">
              Hide the app from Task Manager's Details tab and Alt+Tab switcher. Uses a generic system
              process name ("Windows.System.Host") instead of "InterviewClaudePilte". Requires Windows.
            </p>
          </div>
          <Toggle
            checked={settings.invisibleInTaskManager}
            onChange={(next) => onUpdate({ invisibleInTaskManager: next })}
            label="Hide from Task Manager"
          />
        </div>
      </section>

      {/* Output language */}
      <section className="section flex items-center justify-between gap-6">
        <div>
          <h3 className="text-[16px] font-semibold text-gray-900">Output Language</h3>
          <p className="mt-1 text-[14px] text-gray-500">Choose the language for AI responses.</p>
        </div>
        <div className="relative">
          <select
            value={settings.outputLanguage}
            onChange={(event) => onUpdate({ outputLanguage: event.target.value })}
            className="w-[260px] appearance-none rounded-md border border-gray-300 bg-white px-3 py-2 pr-9 text-[14px] text-gray-900 outline-none focus:border-emerald-400"
          >
            {LANGUAGES.map((language) => (
              <option key={language} value={language}>
                {language}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        </div>
      </section>

      {/* Screen analysis (vision) */}
      <section className="section">
        <div className="flex items-start justify-between gap-6">
          <div>
            <h3 className="text-[16px] font-semibold text-gray-900">Screen analysis (vision)</h3>
            <p className="mt-1 text-[14px] text-gray-500">
              Send screenshots to the model for “Analyse Screen”. Your endpoint must have multimodal processing
              enabled (e.g. vLLM needs <code className="rounded bg-gray-100 px-1 py-0.5 text-[12px]">--enable-multimodal</code>).
              If the model rejects the image, the app falls back to a text-only answer from the transcript.
            </p>
          </div>
          <Toggle
            checked={settings.screenVisionEnabled !== false}
            onChange={(next) => onUpdate({ screenVisionEnabled: next })}
            label="Screen vision"
          />
        </div>

        <div className="mt-4">
          <span className="label-caps">Vision model (optional)</span>
          <div className="relative">
            <select
              value={settings.visionModel || ''}
              disabled={settings.screenVisionEnabled === false}
              onChange={(event) => onUpdate({ visionModel: event.target.value })}
              className="w-full appearance-none rounded-md border border-gray-300 bg-white px-3 py-2 pr-9 text-[14px] text-gray-900 outline-none focus:border-emerald-400 disabled:opacity-50"
            >
              <option value="">Same as answer model (default)</option>
              {visionCapableModels.length > 0 ? (
                visionCapableModels.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.name} — {model.provider}
                  </option>
                ))
              ) : (
                availableModels.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.name || model.id} {model.supportsVision ? '(vision ✓)' : '(text only)'}
                  </option>
                ))
              )}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          </div>
          {visionModelWarning && (
            <div className="mt-2 flex items-start gap-2 text-[12px] text-amber-700 bg-amber-50 rounded-md p-3">
              <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <span>{visionModelWarning}</span>
            </div>
          )}
          {!visionModelWarning && settings.visionModel && settings.screenVisionEnabled && visionCapableModels.some(m => m.id === settings.visionModel) && (
            <p className="mt-2 flex items-center gap-1.5 text-[12px] text-emerald-700">
              <CheckCircle className="h-3.5 w-3.5" />
              <span>This model supports vision ✓</span>
            </p>
          )}
          <p className="mt-2 text-[12.5px] text-gray-400">
            Use a multimodal model just for screenshots (e.g. GPT-4o, Claude 3.5, Gemini 1.5).
            Leave “Same as answer model” if that model supports vision. With the toggle OFF, answers come from transcript only.
          </p>
        </div>
      </section>

      {/* Customization */}
      <section className="section">
        <div className="flex items-start gap-2">
          <Sparkles className="mt-0.5 h-4 w-4 text-emerald-500" />
          <div>
            <h3 className="text-[16px] font-semibold text-gray-900">Customization</h3>
            <p className="mt-1 text-[14px] text-gray-500">
              Customize AI responses with your resume and custom instructions.
            </p>
          </div>
        </div>

        <div className="mt-5">
          <span className="label-caps">Resume context</span>
          <button
            type="button"
            onClick={() => void onPickResume()}
            className="flex w-full items-center justify-between rounded-md border border-gray-300 bg-white px-3 py-2.5 text-left text-[14px] text-gray-700 hover:border-gray-400"
          >
            <span className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-gray-400" />
              {resumeLoading ? 'Reading resume…' : settings.resumeFileName || 'Select Resume'}
            </span>
            <ChevronDown className="h-4 w-4 text-gray-400" />
          </button>
          <p className="mt-2 text-[12.5px] text-gray-400">
            Select a resume to let AI provide personalized, context-aware answers tailored to your resume.
          </p>
        </div>

        <div className="mt-5">
          <div className="flex items-center justify-between">
            <span className="label-caps mb-0">Instructions</span>
            <span className="text-[12px] tabular-nums text-gray-400">{instructions.length} / 2000</span>
          </div>
          
          {/* Instruction Templates */}
          <div className="mt-3">
            <label className="mb-1.5 block text-[13px] font-medium text-gray-700">Interview Scenario Template</label>
            <select
              value=""
              onChange={(event) => {
                const template = INSTRUCTION_TEMPLATES.find(t => t.key === event.target.value);
                if (template) {
                  setInstructions(template.content);
                  onUpdate({ instructions: template.content });
                }
              }}
              className="w-full appearance-none rounded-md border border-gray-300 bg-white px-3 py-2 pr-9 text-[14px] text-gray-900 outline-none focus:border-emerald-400"
            >
              <option value="" disabled selected>Select a template (appends to instructions)…</option>
              {INSTRUCTION_TEMPLATES.map((template) => (
                <option key={template.key} value={template.key}>
                  {template.label}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <p className="mt-1.5 text-[11px] text-gray-400">Pick a scenario to auto-fill proven interview instructions. You can edit after.</p>
          </div>

          <textarea
            value={instructions}
            maxLength={2000}
            onChange={(event) => {
              setInstructions(event.target.value);
              onUpdate({ instructions: event.target.value });
            }}
            placeholder="e.g. Keep answers concise. Focus on my React experience. Use bullet points."
            className="mt-2 h-[150px] w-full resize-none rounded-md border border-gray-300 bg-white px-3 py-2.5 text-[14px] text-gray-800 outline-none focus:border-emerald-400"
          />
          <p className="mt-2 text-[12.5px] text-gray-400">
            Define your preferred style or rules. <span className="font-medium text-gray-500">Auto-save enabled.</span>
          </p>
        </div>
      </section>

      {/* Version */}
      <section className="section flex items-center justify-between">
        <div>
          <h3 className="text-[16px] font-semibold text-gray-900">App version</h3>
          <p className="mt-1 text-[14px] text-gray-500">
            Current version: <span className="font-semibold text-gray-700">{appVersion}</span>
          </p>
        </div>
        <span className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[13px] font-medium text-emerald-600">
          Installed
        </span>
      </section>
    </div>
  );
}
