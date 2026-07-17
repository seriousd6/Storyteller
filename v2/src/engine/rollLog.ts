// Session roll log (docs/sheets/PLAN.md §16): "what did I just roll?" is
// never unanswerable. Last 50 rolls, sessionStorage-backed, newest first.

export interface RollLogEntry {
  /** what was rolled — "Attack", "2d6+3", "Rumors" */
  label: string;
  /** the outcome — a total's breakdown, or a table result's text */
  detail: string;
  total?: number;
  at: number;
}

const KEY = 'stb:rolllog:v1';
const LIMIT = 50;

/** Fired on window after every push. */
export const ROLL_LOG_EVENT = 'stb:roll-logged';

export function getRollLog(): RollLogEntry[] {
  try {
    const raw = sessionStorage.getItem(KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function pushRoll(entry: Omit<RollLogEntry, 'at'>): void {
  const list = getRollLog();
  list.unshift({ ...entry, at: Date.now() });
  list.length = Math.min(list.length, LIMIT);
  try {
    sessionStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* session log is best-effort */
  }
  window.dispatchEvent(new CustomEvent(ROLL_LOG_EVENT));
}
