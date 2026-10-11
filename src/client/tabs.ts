export const LIMITS_TAB = "Limits";
export const DEFAULT_TAB = "To do";

/** The tab to show: the remembered one while it still exists, else To do, else the first team tab. */
export function resolveTab(stored: string | null, teamTabs: string[]): string | null {
  if (stored === LIMITS_TAB || (stored != null && teamTabs.includes(stored))) return stored;
  if (teamTabs.includes(DEFAULT_TAB)) return DEFAULT_TAB;
  return teamTabs[0] ?? null;
}
