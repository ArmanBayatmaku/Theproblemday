// Offline natural-language understanding for the job assistant and command bar.
// Used whenever no LLM key is configured, and as a safety net when the LLM call fails.
import type { AssetKind, CargoSize, CommandName, JobDraft, LngLat, Place, Priority, Recurrence, Site, Timing, Weekday } from './types';
import { LONDON_PLACES } from './data/london';
import { nextOccurrence } from './schedule';

export interface ParseAsset {
  id: string;
  name: string;
  kind: AssetKind;
  siteId?: string;
  ownership: string;
}

export interface ParseContext {
  now: number;
  sites: Site[];
  assets: ParseAsset[];
  draft: JobDraft;
}

export type AssistantIntent =
  | { type: 'job'; patch: Partial<JobDraft>; unresolved: { field: 'pickup' | 'dropoff'; query: string }[] }
  | { type: 'book'; which: string }
  | { type: 'command'; command: CommandName; targetIds: string[]; targetLabel: string }
  | { type: 'question'; topic: 'weather' | 'fleet' | 'jobs' | 'help' | 'airspace' }
  | { type: 'reset' }
  | { type: 'unknown' };

const WEEKDAY_NAMES = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const WEEKDAY_SHORT = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const NUM_WORDS: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12, twenty: 20 };

const STOP = String.raw`(?=$|[,.;!?]|\s(?:at|on|by|tomorrow|today|tonight|every|in\s\d|now|asap|before|after|around|weighing|weight|which|that|it'?s|its|please|for|with|and\s(?:it|they|make)|then|\d+(?:\.\d+)?\s?kg))`;

// ---------- places ----------
interface Candidate {
  label: string;
  keys: string[];
  place: Place;
  isSite: boolean;
}

const KIND_SYNONYMS: Record<Site['kind'], string[]> = {
  warehouse: ['warehouse', 'dc', 'distribution centre', 'distribution center'],
  store: ['store', 'shop', 'branch'],
  drone_port: ['port', 'drone port', 'hive port', 'droneport'],
  depot: ['depot', 'yard'],
  charging_hub: ['hub', 'ev hub', 'charging hub', 'chargers'],
  customer: [],
};

/** Name variants an operator might use for a site: "Park Royal warehouse", "Nine Elms port", "S-KEN"… */
export function siteKeys(s: Site): { keys: string[]; core: string } {
  const short = s.name.replace(/^(FreshCo|Hive)\s+/i, '').toLowerCase();
  const core = short.replace(/\b(port|dc|depot|ev hub|hub|store|warehouse)\b/g, ' ').replace(/\s+/g, ' ').trim() || short;
  const keys = new Set([s.name.toLowerCase(), short, core, s.id.toLowerCase()]);
  for (const syn of KIND_SYNONYMS[s.kind] ?? []) keys.add(`${core} ${syn}`);
  return { keys: [...keys], core };
}

function candidates(sites: Site[]): Candidate[] {
  const out: Candidate[] = sites.map((s) => ({ label: s.name, keys: siteKeys(s).keys, place: { name: s.name, position: s.position, siteId: s.id, address: s.address }, isSite: true }));
  for (const p of LONDON_PLACES) {
    out.push({ label: p.name, keys: [p.name.toLowerCase(), ...(p.aliases ?? [])], place: { name: p.name, position: p.position }, isSite: false });
  }
  return out;
}

const POSTCODE = /\b([a-z]{1,2}\d[a-z\d]?)\s*(\d[a-z]{2})?\b/i;

export function resolvePlace(fragment: string, sites: Site[]): Place | undefined {
  const f = ` ${fragment.toLowerCase().replace(/[^a-z0-9&' -]/g, ' ').replace(/\s+/g, ' ').trim()} `;
  if (f.trim().length < 2) return undefined;
  const wantsSite = /\b(store|shop|warehouse|depot|hub|port|dc|distribution|our)\b/.test(f);
  let best: { c: Candidate; score: number } | undefined;
  for (const c of candidates(sites)) {
    for (const k of c.keys) {
      const key = k.toLowerCase();
      let score = 0;
      if (f.includes(` ${key} `)) score = key.length * 2;
      else if (key.includes(f.trim()) && f.trim().length >= 4) score = f.trim().length * 1.5;
      if (score && c.isSite && wantsSite) score += 30;
      if (score && c.isSite && !wantsSite) score -= 2;
      if (score > (best?.score ?? 0)) best = { c, score };
    }
  }
  return best?.c.place;
}

function findPlacesInOrder(text: string, sites: Site[]): Place[] {
  const t = text.toLowerCase();
  const hits: { idx: number; len: number; place: Place }[] = [];
  for (const c of candidates(sites)) {
    for (const k of c.keys) {
      const idx = t.indexOf(k);
      if (idx >= 0 && k.length >= 4) hits.push({ idx, len: k.length, place: c.place });
    }
  }
  hits.sort((a, b) => a.idx - b.idx || b.len - a.len);
  const out: Place[] = [];
  let lastEnd = -1;
  for (const h of hits) {
    if (h.idx < lastEnd) continue;
    if (!out.find((p) => p.name === h.place.name)) out.push(h.place);
    lastEnd = h.idx + h.len;
  }
  return out;
}

// ---------- time ----------
function parseClock(t: string): { h: number; m: number } | undefined {
  if (/\bnoon\b|\bmidday\b/.test(t)) return { h: 12, m: 0 };
  if (/\bmidnight\b/.test(t)) return { h: 0, m: 0 };
  let m = t.match(/\b(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)\b/);
  if (m) {
    let h = parseInt(m[1], 10) % 12;
    if (m[3] === 'pm') h += 12;
    return { h, m: m[2] ? parseInt(m[2], 10) : 0 };
  }
  m = t.match(/\b(?:at|@|by|from)\s*(\d{1,2})[:.](\d{2})\b/) ?? t.match(/\b(\d{1,2}):(\d{2})\b/);
  if (m) return { h: parseInt(m[1], 10), m: parseInt(m[2], 10) };
  m = t.match(/\bat\s(\d{1,2})\b(?!\s?(?:kg|km|boxes|items|parcels))/);
  if (m) {
    let h = parseInt(m[1], 10);
    if (h >= 1 && h <= 7) h += 12; // "at 3" → 15:00
    return { h, m: 0 };
  }
  if (/\bthis morning\b|\bin the morning\b|\bmorning\b/.test(t)) return { h: 9, m: 0 };
  if (/\bafternoon\b/.test(t)) return { h: 14, m: 0 };
  if (/\bevening\b/.test(t)) return { h: 18, m: 0 };
  if (/\btonight\b|\bnight\b/.test(t)) return { h: 20, m: 0 };
  return undefined;
}

const pad = (n: number) => String(n).padStart(2, '0');

function parseTiming(t: string, now: number): { timing?: Timing; label?: string } {
  const clock = parseClock(t);
  const timeStr = clock ? `${pad(clock.h)}:${pad(clock.m)}` : undefined;

  // ----- recurring -----
  let rule: Recurrence | undefined;
  let m: RegExpMatchArray | null;
  if ((m = t.match(/\bevery\s(\d+)\s(hours?|hrs?)\b/))) rule = { freq: 'hourly', interval: parseInt(m[1], 10) };
  else if (/\bhourly\b|\bevery hour\b/.test(t)) rule = { freq: 'hourly', interval: 1 };
  else if (/\bevery weekday\b|\bweekdays\b|\bmonday to friday\b|\bmon-fri\b|\bmon to fri\b/.test(t)) rule = { freq: 'weekly', interval: 1, byWeekday: [0, 1, 2, 3, 4] };
  else if (/\bevery (day|morning|evening|night)\b|\bdaily\b|\beach day\b/.test(t)) rule = { freq: 'daily', interval: 1 };
  else if (/\bevery (\d+ )?(other )?week|\bweekly\b|\bfortnightly\b/.test(t)) {
    const twice = /fortnightly|other week|every 2 weeks/.test(t);
    rule = { freq: 'weekly', interval: twice ? 2 : 1 };
  } else if (/\bevery month\b|\bmonthly\b/.test(t)) rule = { freq: 'monthly', interval: 1 };
  const everyDays = t.match(/\bevery\s((?:(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*(?:\s*(?:,|and|&)\s*)?)+)/);
  if (everyDays) {
    const days = new Set<Weekday>();
    for (const tok of everyDays[1].split(/[\s,&]+/)) {
      const i = WEEKDAY_SHORT.indexOf(tok.slice(0, 3));
      if (i >= 0 && tok.length >= 3) days.add(i as Weekday);
    }
    if (days.size) rule = { freq: 'weekly', interval: 1, byWeekday: [...days].sort() };
  }
  if (rule) {
    if (rule.freq !== 'hourly') rule.time = timeStr ?? '09:00';
    const anchor = new Date(now);
    if (rule.freq === 'hourly' && timeStr) {
      anchor.setHours(clock!.h, clock!.m, 0, 0);
    }
    const startAtMs = rule.freq === 'hourly' ? (timeStr ? anchor.getTime() : now + 3600_000) : now;
    const first = nextOccurrence(rule, startAtMs, now) ?? now;
    return { timing: { mode: 'recurring', rule, startAt: new Date(first).toISOString() } };
  }

  // ----- one-off -----
  if (/\b(now|asap|immediately|right away|straight away|urgent)\b/.test(t) && !clock) return { timing: { mode: 'now' } };
  if ((m = t.match(/\bin\s(\d+|an?|half an)\s?(minutes?|mins?|hours?|hrs?)\b/))) {
    const n = m[1] === 'half an' ? 0.5 : NUM_WORDS[m[1]] ?? parseInt(m[1], 10);
    const ms = /h/.test(m[2]) ? n * 3600_000 : n * 60_000;
    return { timing: { mode: 'scheduled', at: new Date(now + ms).toISOString() } };
  }
  const d = new Date(now);
  let dayFound = false;
  if (/\btomorrow\b/.test(t)) {
    d.setDate(d.getDate() + 1);
    dayFound = true;
  } else {
    const wd = t.match(/\b(?:on |next |this )?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/);
    if (wd) {
      const target = WEEKDAY_NAMES.indexOf(wd[1]);
      const cur = (d.getDay() + 6) % 7;
      let delta = (target - cur + 7) % 7;
      if (delta === 0 || /next/.test(wd[0])) delta = delta === 0 ? 7 : delta;
      d.setDate(d.getDate() + delta);
      dayFound = true;
    } else if (/\btoday\b|\btonight\b|\bthis (morning|afternoon|evening)\b/.test(t)) dayFound = true;
  }
  if (clock || dayFound) {
    d.setHours(clock?.h ?? 9, clock?.m ?? 0, 0, 0);
    if (!dayFound && d.getTime() < now) d.setDate(d.getDate() + 1);
    return { timing: { mode: 'scheduled', at: d.toISOString() } };
  }
  return {};
}

// ---------- cargo ----------
/** Typical weight per unit, used when the operator gives a count but no weight. */
const UNIT_KG: Record<string, number> = {
  pallet: 250, crate: 15, box: 4, case: 8, tote: 10, bag: 6, parcel: 2, package: 2, envelope: 0.2, document: 0.2, letter: 0.1, meal: 0.8, order: 3, kit: 0.5, sample: 0.3, tray: 3, item: 1.5,
};
function parseCargo(t: string): Partial<JobDraft['cargo']> {
  const c: Partial<JobDraft['cargo']> = {};
  let m = t.match(/(\d+(?:\.\d+)?)\s*(kg|kgs|kilos?|kilograms?|g|grams?|lbs?)\b/);
  if (m) {
    const v = parseFloat(m[1]);
    c.weightKg = /^g|gram/.test(m[2]) ? v / 1000 : /lb/.test(m[2]) ? +(v * 0.4536).toFixed(2) : v;
  }
  const q = t.match(/\b(\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten|twelve|twenty)\s+(?:(?:small|large|big|heavy|light|fragile|chilled|frozen)\s+)?(boxes|box|parcels?|packages?|crates?|bags?|items?|pallets?|envelopes?|documents?|letters?|totes?|cases?|trays?|meals?|orders?|kits?|samples?)\b(?:\s+(?:chilled|frozen|fragile|refrigerated|heavy|light))?(?:\s+of\s+([a-z ]+?))?(?=$|[,.;]|\s(?:from|to|at|on|weighing|tomorrow|today|every|now|please|for|which|that|chilled|frozen))/);
  if (q) {
    c.quantity = NUM_WORDS[q[1]] ?? parseInt(q[1], 10);
    const noun = q[2];
    c.description = `${c.quantity} ${noun}${q[3] ? ` of ${q[3].trim()}` : ''}`;
    if (/pallet/.test(noun)) c.size = 'pallet';
    else if (/envelope|document|letter/.test(noun)) c.size = 'envelope';
    else if (/crate|box|case|tote/.test(noun)) c.size = 'medium';
    else if (/sample|kit/.test(noun)) c.size = 'small';
    if (c.weightKg === undefined) {
      const unit = Object.entries(UNIT_KG).find(([k]) => noun.startsWith(k))?.[1] ?? 2;
      c.weightKg = +(c.quantity * unit).toFixed(1);
    }
  }
  let size: CargoSize | undefined;
  if (/\bpallets?\b/.test(t)) size = 'pallet';
  else if (/\b(large|big|bulky|furniture|oversized)\b/.test(t)) size = 'large';
  else if (/\b(envelope|document|letter|keys)\b/.test(t)) size = 'envelope';
  else if (/\b(small|tiny|little)\b/.test(t)) size = 'small';
  if (size) c.size = size;
  if (/\bfragile|\bglass\b|\bhandle with care\b/.test(t)) c.fragile = true;
  if (/\bfrozen|\bfreezer|\bice cream\b/.test(t)) c.temperature = 'frozen';
  else if (/\bchilled|\bcold\b|\bfridge|\brefrigerated|\bfresh (milk|meat|fish|produce)\b|\bvaccines?\b/.test(t)) c.temperature = 'chilled';
  m = t.match(/(?:worth|valued at|value of|value)\s*£?\s*(\d+(?:,\d{3})*)/) ?? t.match(/£\s*(\d+(?:,\d{3})*)\s*(?:worth|value)/);
  if (m) c.valueGbp = parseInt(m[1].replace(/,/g, ''), 10);
  if (!c.description) {
    const what = t.match(/\b(?:send|deliver|move|ship|take|bring|courier)\s+(?:a |an |my |our |some |the )?([a-z][a-z ]{2,30}?)(?=\s(?:from|to|at|weighing|tomorrow|today|every|now)|$|[,.])/);
    if (what && !/^(it|them|this|that|stuff)$/.test(what[1].trim())) c.description = what[1].trim();
  }
  if (!c.description) {
    // "Gift box to E14 5AB", "2 kg parcel from …"
    const lead = t.match(/^\s*(?:(?:a|an|one|\d+(?:\.\d+)?\s*(?:kg|kgs|g|lbs?))\s+)?(?!from\b|to\b)([a-z][a-z ]{2,30}?)\s(?:to|from)\s/);
    if (lead && !/\b(send|deliver|move|ship|take|bring|courier|book|go|get|it|them)\b/.test(lead[1])) c.description = lead[1].trim().replace(/^of\s+/, '');
  }
  return c;
}

function sizeFromWeight(kg: number): CargoSize {
  if (kg <= 0.5) return 'envelope';
  if (kg <= 3) return 'small';
  if (kg <= 20) return 'medium';
  if (kg <= 150) return 'large';
  return 'pallet';
}

// ---------- commands ----------
const COMMAND_PATTERNS: [RegExp, CommandName][] = [
  [/\b(release|reset|clear)\s+(the\s+)?(e-?stop|emergency stop)\b/, 'release_estop'],
  [/\b(e-?stop|emergency stop|kill switch|stop everything)\b/, 'estop'],
  [/\b(resume|unpause|continue|carry on)\b/, 'resume'],
  [/\b(pause|freeze)\b/, 'pause'],
  [/\b(return|recall|rtb|come back|send\s+.+?\s+back|back to base|go home)\b/, 'return_to_base'],
  [/\b(land)\b/, 'land'],
  [/\b(charge|recharge)\b/, 'charge'],
  [/\b(hold|hover|stay put|wait)\b/, 'hold'],
  [/\b(wake|wake up)\b/, 'wake'],
  [/\b(sleep|power down)\b/, 'sleep'],
  [/\blights? on\b/, 'lights_on'],
  [/\blights? off\b/, 'lights_off'],
];

const KIND_WORDS: [RegExp, AssetKind[]][] = [
  [/\bdrones?\b/, ['drone']],
  [/\bhumanoids?\b/, ['humanoid']],
  [/\b(amrs?|warehouse robots?)\b/, ['amr']],
  [/\b(sidewalk robots?|delivery robots?)\b/, ['sidewalk_robot']],
  [/\b(robot arms?|arms?)\b/, ['robot_arm']],
  [/\brobots?\b/, ['humanoid', 'amr', 'sidewalk_robot', 'robot_arm']],
  [/\btrucks?\b/, ['truck']],
  [/\bvans?\b/, ['van']],
  [/\bvehicles?\b/, ['van', 'truck', 'car']],
];

function parseCommand(t: string, ctx: ParseContext): AssistantIntent | undefined {
  const cmd = COMMAND_PATTERNS.find(([re]) => re.test(t));
  if (!cmd) return undefined;
  const controllable = ctx.assets.filter((a) => a.ownership !== 'external');
  const ids = [...t.matchAll(/\b([a-z]{1,3})-?(\d{1,3})\b/g)]
    .map((m) => `${m[1]}-${m[2].padStart(2, '0')}`.toUpperCase())
    .filter((id) => controllable.some((a) => a.id === id));
  let targets = controllable.filter((a) => ids.includes(a.id));
  let label = ids.join(', ');
  if (!targets.length) {
    const kinds = KIND_WORDS.find(([re]) => re.test(t))?.[1];
    const site = ctx.sites.find((s) => {
      const { keys, core } = siteKeys(s);
      return keys.some((k) => k.length > 4 && t.includes(` ${k} `)) || (core.length > 4 && t.includes(core));
    });
    const everything = /\b(all|every|everything|whole fleet|fleet)\b/.test(t);
    if (kinds || site || everything) {
      targets = controllable.filter((a) => (!kinds || kinds.includes(a.kind)) && (!site || a.siteId === site.id));
      label = `${kinds ? (everything ? 'all ' : '') + t.match(KIND_WORDS.find(([re]) => re.test(t))![0])![0] : 'all machines'}${site ? ` at ${site.name}` : ''}`;
    }
  }
  if (!targets.length) return undefined;
  return { type: 'command', command: cmd[1], targetIds: targets.map((a) => a.id), targetLabel: label };
}

// ---------- main ----------
export function interpret(text: string, ctx: ParseContext): AssistantIntent {
  const t = ` ${text.toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, ' ').trim()} `;

  if (/^\s*(reset|start over|new job|clear)\s*$/.test(t)) return { type: 'reset' };
  const book = t.match(/\b(book|confirm|dispatch|go ahead|send it|yes,? (?:please )?book|use|choose|pick|select)\b(?:\s+(?:it|the|with|option))?\s*([a-z0-9 -]*)/);
  const hasRoute = /\bfrom\b.+\bto\b/.test(t);
  if (book && !hasRoute && !/\bpick\s?up\b/.test(t)) {
    return { type: 'book', which: (book[2] || 'recommended').trim() || 'recommended' };
  }
  if (/\b(no-?fly|airspace|restricted|frz|notam)\b/.test(t) && !hasRoute) return { type: 'question', topic: 'airspace' };
  if (/\b(weather|wind|can (the )?drones fly|flyable|fly today)\b/.test(t) && !hasRoute) return { type: 'question', topic: 'weather' };
  if (/\b(fleet status|how many (drones|robots|vehicles)|what'?s available|who'?s available)\b/.test(t)) return { type: 'question', topic: 'fleet' };
  if (/\b(my jobs|upcoming|what'?s scheduled|scheduled jobs|active jobs)\b/.test(t)) return { type: 'question', topic: 'jobs' };
  if (/^\s*(help|what can you do\??|hi|hello|hey)\s*$/.test(t)) return { type: 'question', topic: 'help' };

  const looksLikeDelivery = hasRoute || /\b(deliver|delivery|send|ship|courier|pick\s?up|drop\s?off|collect|parcel|package|box|crate|pallet)\b/.test(t);
  if (!looksLikeDelivery) {
    const c = parseCommand(t, ctx);
    if (c) return c;
  }

  const patch: Partial<JobDraft> = {};
  const unresolved: { field: 'pickup' | 'dropoff'; query: string }[] = [];
  const setPlace = (field: 'pickup' | 'dropoff', frag: string) => {
    const p = resolvePlace(frag, ctx.sites);
    if (p) patch[field] = p;
    else {
      const pc = frag.match(POSTCODE);
      unresolved.push({ field, query: pc ? pc[0].toUpperCase() : frag.trim() });
    }
  };

  const fromTo = t.match(new RegExp(String.raw`\bfrom\s(.+?)\s(?:to|into|towards)\s(.+?)${STOP}`));
  if (fromTo) {
    setPlace('pickup', fromTo[1]);
    setPlace('dropoff', fromTo[2]);
  } else {
    const pu = t.match(new RegExp(String.raw`\b(?:pick\s?up|collect)\s(?:it\s|them\s)?(?:from\s|at\s)?(.+?)(?=\s(?:and|then|to|deliver|drop)\b|${STOP.slice(3)}`));
    if (pu) setPlace('pickup', pu[1]);
    const fr = !pu && t.match(new RegExp(String.raw`\bfrom\s(.+?)${STOP}`));
    if (fr) setPlace('pickup', fr[1]);
    const dr = t.match(new RegExp(String.raw`\b(?:deliver(?:ed)?(?:\sit|\sthem)?\sto|drop\s?off\s(?:at|to)?|to)\s(.+?)${STOP}`));
    if (dr) setPlace('dropoff', dr[1]);
  }
  if (!patch.pickup && !patch.dropoff && !unresolved.length) {
    const found = findPlacesInOrder(t, ctx.sites);
    if (found.length >= 2) {
      patch.pickup = found[0];
      patch.dropoff = found[1];
    } else if (found.length === 1) {
      if (ctx.draft.pickup && !ctx.draft.dropoff) patch.dropoff = found[0];
      else patch.pickup = found[0];
    }
  }

  const cargo = parseCargo(t);
  if (Object.keys(cargo).length) {
    const base = fromTo ? { description: '', weightKg: 2, quantity: 1, size: 'small' as CargoSize } : ctx.draft.cargo;
    const merged = { ...base, ...cargo };
    if (cargo.weightKg !== undefined && !cargo.size) merged.size = sizeFromWeight(cargo.weightKg);
    patch.cargo = merged;
  }

  const { timing } = parseTiming(t, ctx.now);
  if (timing) patch.timing = timing;

  let priority: Priority | undefined;
  if (/\b(fastest|urgent|express|quickest|as fast as)\b/.test(t)) priority = 'fastest';
  else if (/\b(cheap|cheapest|budget|lowest price|cost-effective|economical)\b/.test(t)) priority = 'cheapest';
  else if (/\b(green|greenest|eco|low carbon|sustainable|zero emission)\b/.test(t)) priority = 'greenest';
  if (priority) patch.priority = priority;

  if (!Object.keys(patch).length && !unresolved.length) {
    const c = parseCommand(t, ctx);
    if (c) return c;
    return { type: 'unknown' };
  }
  return { type: 'job', patch, unresolved };
}

export function missingFields(d: JobDraft): string[] {
  const m: string[] = [];
  if (!d.pickup) m.push('pickup');
  if (!d.dropoff) m.push('dropoff');
  return m;
}

export function isPositionInLondon(p: LngLat) {
  return p[0] > -0.6 && p[0] < 0.4 && p[1] > 51.25 && p[1] < 51.75;
}
