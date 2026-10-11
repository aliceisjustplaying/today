import { createContext, useContext } from "react";

const STORAGE_KEY = "today.privacy";
const EMAIL = /[^\s@<>()"',;:]+@[^\s@<>()"',;:]+\.[^\s@<>()"',;:]+/g;
const MONEY = /-?\$\s?\d[\d,]*(?:\.\d+)?/g;

/** Redacts email addresses and dollar amounts; percentages, times and everything else stay. */
export function redact(text: string): string {
  return text.replace(EMAIL, "•••@•••").replace(MONEY, "$•••");
}

/** Also blanks every figure, for lines that are all balance ("Credits 48,237 · 0/day"). */
export function redactFigures(text: string): string {
  return redact(text).replace(/\d[\d,.]*/g, "•••");
}

/** Keeps a plan chip's name but not its renewal or end date ("Lite · ends •••"). */
export function redactPlanDate(chip: string): string {
  return chip.replace(/ · (renews|ends) .*$/, " · $1 •••");
}

export function loadPrivacy(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function savePrivacy(on: boolean): void {
  try {
    if (on) localStorage.setItem(STORAGE_KEY, "1");
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* localStorage might be disabled */
  }
}

export const PrivacyContext = createContext(false);

export const HIDDEN = "•••";

/**
 * While privacy mode is on, `text` redacts emails and dollar amounts inside text that stays
 * readable, and `hide` blanks personal text (titles, places, prep labels) entirely.
 */
export function usePrivacy(): {
  on: boolean;
  text: (s: string) => string;
  figures: (s: string) => string;
  hide: (s: string) => string;
} {
  const on = useContext(PrivacyContext);
  const same = (s: string) => s;
  return on ? { on, text: redact, figures: redactFigures, hide: () => HIDDEN } : { on, text: same, figures: same, hide: same };
}

export function EyeIcon({ off }: { off: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
      {off && <path d="M3 3l18 18" />}
    </svg>
  );
}
