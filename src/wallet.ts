/* ============================================================
   LIGHT BENDER — GOLD WALLET (Phase 2)
   One permanent economy. Saved in localStorage under "lb-gold*".

   Rules enforced here:
   - Balance can never go negative (spendCoins refuses).
   - A level never pays twice for the same star count
     (upgrade pays only the difference, e.g. 2★ then 3★).
   ============================================================ */

const KEY_BALANCE = "lb-gold";
const KEY_EARNED = "lb-gold-earned";
const KEY_SPENT = "lb-gold-spent";
const KEY_HISTORY = "lb-gold-history";
const KEY_PAID = "lb-coins-paid";

const HISTORY_LIMIT = 20;

export type HistoryEntry = { t: number; amount: number; reason: string };

/** Reward table: level complete pays 50, each extra star adds 25. */
export function coinsForStars(stars: number): number {
  if (stars <= 0) return 0;
  return 50 + (stars - 1) * 25;
}

/** One-time bonus for finishing a world (levels 20, 40, 60, 80, 100). */
export const MILESTONE_BONUS = 200;

function readNumber(key: string): number {
  const raw = localStorage.getItem(key);
  const value = Number(raw ?? 0);
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}

function readJSON<T>(key: string, fallback: T): T {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "");
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

export function walletBalance(): number {
  return readNumber(KEY_BALANCE);
}

export function walletEarned(): number {
  return readNumber(KEY_EARNED);
}

export function walletSpent(): number {
  return readNumber(KEY_SPENT);
}

export function walletHistory(): HistoryEntry[] {
  const list = readJSON<HistoryEntry[]>(KEY_HISTORY, []);
  return Array.isArray(list) ? list : [];
}

function saveHistory(list: HistoryEntry[]) {
  localStorage.setItem(KEY_HISTORY, JSON.stringify(list.slice(0, HISTORY_LIMIT)));
}

/** Adds coins. Rejects zero/negative amounts so balance stays clean. */
export function addCoins(amount: number, reason: string): void {
  const value = Math.floor(amount);
  if (!Number.isFinite(value) || value <= 0) return;

  localStorage.setItem(KEY_BALANCE, String(walletBalance() + value));
  localStorage.setItem(KEY_EARNED, String(walletEarned() + value));

  const history = walletHistory();
  history.unshift({ t: Date.now(), amount: value, reason });
  saveHistory(history);
}

/**
 * Spends coins. Returns false (and changes nothing) when the balance
 * is too low — callers must treat false as "purchase declined".
 */
export function spendCoins(amount: number, reason: string): boolean {
  const value = Math.floor(amount);
  if (!Number.isFinite(value) || value <= 0) return false;

  const balance = walletBalance();
  if (balance < value) return false;

  localStorage.setItem(KEY_BALANCE, String(balance - value));
  localStorage.setItem(KEY_SPENT, String(walletSpent() + value));

  const history = walletHistory();
  history.unshift({ t: Date.now(), amount: -value, reason });
  saveHistory(history);

  return true;
}

/**
 * Pays the reward for completing a level.
 * Safe to call every time a level is solved: it only pays the
 * difference between the best stars already paid and the new stars.
 * Returns the coins granted (0 when nothing new was earned).
 */
export function awardLevelReward(level: number, stars: number): number {
  if (stars <= 0 || level < 1 || level > 100) return 0;

  const paid = readJSON<Record<number, number>>(KEY_PAID, {});
  const paidMap = typeof paid === "object" && paid !== null ? paid : {};

  const alreadyPaidStars = Math.max(0, Math.floor(Number(paidMap[level] || 0)));
  if (stars <= alreadyPaidStars) return 0;

  let reward = coinsForStars(stars) - coinsForStars(alreadyPaidStars);

  // Milestone bonus only on the very first completion of a world end.
  if (alreadyPaidStars === 0 && level % 20 === 0) {
    reward += MILESTONE_BONUS;
  }

  paidMap[level] = stars;
  localStorage.setItem(KEY_PAID, JSON.stringify(paidMap));

  addCoins(reward, `Level ${level} · ${stars}★`);
  return reward;
}
