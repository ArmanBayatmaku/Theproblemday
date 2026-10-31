// Server-side job assistant. Uses Claude (tool use) to turn a free-text request into a structured
// intent that the web app understands. The browser never sees the API key.
//
// The response mirrors `AssistantIntent` in shared/parser.ts so the client can treat Claude and the
// offline parser the same way. Places come back unresolved (site ids, area names or postcodes) —
// the client resolves them against its own site list and postcodes.io.
import Anthropic from '@anthropic-ai/sdk';
import type { Request, Response } from 'express';
import type { AssistantIntent } from '../../shared/parser';
import type { CommandName, JobDraft, Recurrence, Timing, Weekday } from '../../shared/types';

export const DEFAULT_MODEL = 'claude-sonnet-5-5';
export const aiConfigured = () => !!process.env.ANTHROPIC_API_KEY;
export const aiModel = () => process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;

let client: Anthropic | null = null;
const getClient = () => (client ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }));

const COMMANDS: CommandName[] = [
  'pause', 'resume', 'hold', 'return_to_base', 'goto', 'estop', 'release_estop', 'takeoff', 'land', 'charge',
  'open_bay', 'close_bay', 'lights_on', 'lights_off', 'horn', 'sleep', 'wake', 'reboot', 'update_firmware',
  'set_speed_limit', 'assign_site', 'message_driver', 'cancel_trip',
];

const TOOL: Anthropic.Tool = {
  name: 'interpret_request',
  description: 'Record what the operator wants: a delivery job (or changes to the one being drafted), booking a priced option, a control command for machines, a question, or a reset.',
  input_schema: {
    type: 'object',
    properties: {
      intent: { type: 'string', enum: ['job', 'book', 'command', 'question', 'reset', 'unknown'] },
      reply: { type: 'string', description: 'One short, friendly sentence for the operator. Never quote prices or ETAs — the app calculates those.' },
      job: {
        type: 'object',
        description: 'Only the fields the operator mentioned in this message (changes to the current draft).',
        properties: {
          pickup: { type: 'string', description: 'A site id from the list if it matches (e.g. S-KEN), otherwise a London place name, street address or UK postcode.' },
          dropoff: { type: 'string', description: 'Same format as pickup.' },
          description: { type: 'string', description: 'What is being sent, e.g. "6 crates of chilled produce".' },
          weightKg: { type: 'number', description: 'Total weight in kg.' },
          quantity: { type: 'integer' },
          size: { type: 'string', enum: ['envelope', 'small', 'medium', 'large', 'pallet'] },
          temperature: { type: 'string', enum: ['ambient', 'chilled', 'frozen'] },
          fragile: { type: 'boolean' },
          valueGbp: { type: 'number' },
          timing: { type: 'string', enum: ['now', 'scheduled', 'recurring'] },
          at: { type: 'string', description: 'Local London wall-clock time "YYYY-MM-DDTHH:mm" for a scheduled job, or the first run of a recurring one.' },
          recurrence: {
            type: 'object',
            properties: {
              freq: { type: 'string', enum: ['hourly', 'daily', 'weekly', 'monthly'] },
              interval: { type: 'integer', minimum: 1 },
              byWeekday: { type: 'array', items: { type: 'integer', minimum: 0, maximum: 6 }, description: '0 = Monday … 6 = Sunday' },
              time: { type: 'string', description: 'HH:mm' },
              until: { type: 'string', description: 'YYYY-MM-DD, optional' },
            },
            required: ['freq'],
          },
          priority: { type: 'string', enum: ['balanced', 'cheapest', 'fastest', 'greenest'] },
          customer: { type: 'string' },
          notes: { type: 'string' },
        },
      },
      book: {
        type: 'object',
        properties: { which: { type: 'string', description: 'recommended, cheapest, fastest, greenest, drone, waymo, uber, bike, van, own, or an option number.' } },
      },
      command: {
        type: 'object',
        properties: {
          command: { type: 'string', enum: COMMANDS },
          targetIds: { type: 'array', items: { type: 'string' }, description: 'Machine ids from the list.' },
          targetLabel: { type: 'string', description: 'Short description of the targets, e.g. "all drones at Nine Elms".' },
        },
        required: ['command', 'targetIds'],
      },
      question: { type: 'object', properties: { topic: { type: 'string', enum: ['weather', 'fleet', 'jobs', 'help', 'airspace'] } } },
    },
    required: ['intent', 'reply'],
  },
};

const SYSTEM = `You are the operations assistant inside HIVE, a London-only dashboard that books deliveries across Hive drones, Waymo robotaxis, couriers, partner vans, cargo bikes and the customer's own fleet, and controls their autonomous machines (drones, humanoids, AMRs, sidewalk robots, robot arms, vans and trucks).

Always call the interpret_request tool exactly once.
- A delivery request or a change to the draft → intent "job" with only the fields mentioned. Prefer site ids for the customer's own locations ("Kensington store" → S-KEN). Keep postcodes exactly as written.
- "book it", "go with the drone", "the cheapest one" → intent "book".
- Controlling machines ("pause DR-03", "send all robots at Park Royal to charge") → intent "command" with machine ids from the list. Never invent ids.
- Weather, airspace, fleet or schedule questions → intent "question".
- "start again" → intent "reset".
Times are London local time. "Weekdays" means byWeekday [0,1,2,3,4]. A one-off future time is "scheduled"; anything repeating is "recurring".
Estimate total weight when the operator gives only a count (e.g. a crate ≈ 15 kg, a grocery bag ≈ 6 kg, a pallet ≈ 250 kg, a parcel ≈ 2 kg).`;

interface Body {
  message: string;
  history?: { role: 'user' | 'assistant'; text: string }[];
  draft?: JobDraft;
  now?: string; // local wall-clock, "YYYY-MM-DDTHH:mm Weekday"
  sites?: { id: string; name: string; kind: string }[];
  machines?: { id: string; kind: string; siteId?: string }[];
}

interface ToolJob {
  pickup?: string;
  dropoff?: string;
  description?: string;
  weightKg?: number;
  quantity?: number;
  size?: JobDraft['cargo']['size'];
  temperature?: 'ambient' | 'chilled' | 'frozen';
  fragile?: boolean;
  valueGbp?: number;
  timing?: Timing['mode'];
  at?: string;
  recurrence?: Recurrence;
  priority?: JobDraft['priority'];
  customer?: string;
  notes?: string;
}
interface ToolInput {
  intent: AssistantIntent['type'];
  reply: string;
  job?: ToolJob;
  book?: { which?: string };
  command?: { command: CommandName; targetIds: string[]; targetLabel?: string };
  question?: { topic?: 'weather' | 'fleet' | 'jobs' | 'help' | 'airspace' };
}

function toIntent(input: ToolInput, body: Body): AssistantIntent {
  switch (input.intent) {
    case 'job': {
      const j = input.job ?? {};
      const cargo: Partial<JobDraft['cargo']> = {};
      if (j.description) cargo.description = j.description;
      if (typeof j.weightKg === 'number' && j.weightKg > 0) cargo.weightKg = j.weightKg;
      if (typeof j.quantity === 'number' && j.quantity > 0) cargo.quantity = Math.round(j.quantity);
      if (j.size) cargo.size = j.size;
      if (j.temperature) cargo.temperature = j.temperature;
      if (typeof j.fragile === 'boolean') cargo.fragile = j.fragile;
      if (typeof j.valueGbp === 'number') cargo.valueGbp = j.valueGbp;
      const patch: Partial<JobDraft> = {};
      if (Object.keys(cargo).length) patch.cargo = cargo as JobDraft['cargo'];
      if (j.priority) patch.priority = j.priority;
      if (j.customer) patch.customer = j.customer;
      if (j.notes) patch.notes = j.notes;
      if (j.timing === 'now') patch.timing = { mode: 'now' };
      if (j.timing === 'scheduled' && j.at) patch.timing = { mode: 'scheduled', at: j.at };
      if (j.timing === 'recurring' && j.recurrence) {
        const r = j.recurrence;
        const rule: Recurrence = {
          freq: r.freq,
          interval: Math.max(1, r.interval ?? 1),
          byWeekday: r.byWeekday?.filter((d) => d >= 0 && d <= 6) as Weekday[] | undefined,
          time: r.time ?? j.at?.slice(11, 16),
          until: r.until,
        };
        patch.timing = { mode: 'recurring', rule, startAt: j.at ?? (body.now ?? '').slice(0, 16) };
      }
      const unresolved: { field: 'pickup' | 'dropoff'; query: string }[] = [];
      if (j.pickup) unresolved.push({ field: 'pickup', query: j.pickup });
      if (j.dropoff) unresolved.push({ field: 'dropoff', query: j.dropoff });
      return { type: 'job', patch, unresolved };
    }
    case 'book':
      return { type: 'book', which: input.book?.which || 'recommended' };
    case 'command': {
      const known = new Set((body.machines ?? []).map((m) => m.id));
      const c = input.command;
      if (!c || !COMMANDS.includes(c.command)) return { type: 'unknown' };
      const ids = c.targetIds.filter((id) => known.has(id));
      if (!ids.length) return { type: 'unknown' };
      return { type: 'command', command: c.command, targetIds: ids, targetLabel: c.targetLabel || ids.join(', ') };
    }
    case 'question':
      return { type: 'question', topic: input.question?.topic ?? 'help' };
    case 'reset':
      return { type: 'reset' };
    default:
      return { type: 'unknown' };
  }
}

/** Builds an alternating user/assistant history that starts with a user turn. */
function historyMessages(body: Body): Anthropic.MessageParam[] {
  const h = [...(body.history ?? [])];
  if (h.length && h[h.length - 1].role === 'user' && h[h.length - 1].text === body.message) h.pop();
  const out: Anthropic.MessageParam[] = [];
  for (const m of h) {
    const text = m.text.slice(0, 2000);
    if (!text) continue;
    const last = out[out.length - 1];
    if (last && last.role === m.role) last.content = `${last.content as string}\n${text}`;
    else out.push({ role: m.role, content: text });
  }
  while (out.length && out[0].role !== 'user') out.shift();
  if (out.length && out[out.length - 1].role === 'user') out.push({ role: 'assistant', content: 'Noted.' });
  return out;
}

export async function assistantHandler(req: Request, res: Response) {
  const body = req.body as Body;
  if (!body?.message || typeof body.message !== 'string') return res.status(400).json({ error: 'message is required' });
  if (!aiConfigured()) return res.status(503).json({ error: 'ANTHROPIC_API_KEY is not set — the app falls back to the offline parser.' });

  const context = [
    `Now: ${body.now ?? new Date().toISOString()}`,
    `Current draft: ${JSON.stringify({ pickup: body.draft?.pickup?.name, dropoff: body.draft?.dropoff?.name, cargo: body.draft?.cargo, timing: body.draft?.timing, priority: body.draft?.priority })}`,
    `Sites: ${(body.sites ?? []).map((s) => `${s.id}=${s.name} (${s.kind})`).join('; ')}`,
    `Machines: ${(body.machines ?? []).map((m) => `${m.id}:${m.kind}${m.siteId ? `@${m.siteId}` : ''}`).join(', ')}`,
  ].join('\n');

  try {
    const msg = await getClient().messages.create({
      model: aiModel(),
      max_tokens: 1024,
      system: [
        { type: 'text', text: SYSTEM },
        { type: 'text', text: context },
      ],
      tools: [TOOL],
      tool_choice: { type: 'tool', name: TOOL.name },
      messages: [...historyMessages(body), { role: 'user', content: body.message.slice(0, 4000) }],
    });
    const block = msg.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
    if (!block) return res.status(502).json({ error: 'No structured answer from the model' });
    const input = block.input as ToolInput;
    return res.json({ intent: toIntent(input, body), reply: input.reply, model: msg.model });
  } catch (err) {
    const status = err instanceof Anthropic.APIError ? err.status ?? 502 : 502;
    console.error('[assistant]', err instanceof Error ? err.message : err);
    return res.status(status >= 400 && status < 600 ? status : 502).json({ error: err instanceof Error ? err.message : 'Assistant error' });
  }
}
