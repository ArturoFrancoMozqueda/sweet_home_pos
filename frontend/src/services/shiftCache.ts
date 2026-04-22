export interface CachedShiftState {
  user_id: number;
  shift_id: number | null;
  is_open: boolean;
  opened_at?: string | null;
  opening_cash?: number | null;
  cash_sales?: number | null;
  transfer_sales?: number | null;
  expected_cash?: number | null;
  updated_at: string;
}

const SHIFT_CACHE_KEY = "sweet_home_shift_state";

function readAll(): CachedShiftState[] {
  try {
    const raw = localStorage.getItem(SHIFT_CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(states: CachedShiftState[]) {
  try {
    localStorage.setItem(SHIFT_CACHE_KEY, JSON.stringify(states));
  } catch {
    // Non-fatal: losing cache just means stricter shift gating offline.
  }
}

export function getCachedShiftState(userId: number | undefined): CachedShiftState | null {
  if (!userId) return null;
  return readAll().find((state) => state.user_id === userId) ?? null;
}

export function setCachedShiftState(
  userId: number | undefined,
  state: Omit<CachedShiftState, "user_id" | "updated_at">
) {
  if (!userId) return;
  const existing = readAll().filter((entry) => entry.user_id !== userId);
  existing.push({
    user_id: userId,
    updated_at: new Date().toISOString(),
    ...state,
  });
  writeAll(existing);
}

export function clearCachedShiftState(userId: number | undefined) {
  if (!userId) return;
  writeAll(readAll().filter((entry) => entry.user_id !== userId));
}
