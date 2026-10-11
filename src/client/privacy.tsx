import { createContext, useContext } from "react";

const STORAGE_KEY = "today.privacy";
const EMAIL = /[^\s@<>()"',;:]+@[^\s@<>()"',;:]+\.[^\s@<>()"',;:]+/g;
const MONEY = /-?\$\s?\d[\d,]*(?:\.\d+)?/g;

/** Every dollar amount in privacy mode: obviously fake but normal-looking, never zero, same for all. */
export const DECOY_DOLLARS = "$67.00";
/** Every other figure (Codex credits) in privacy mode. */
export const DECOY_FIGURE = "67";

/** Account emails are numbered by display position, so shared addresses don't show: alice@, alice2@, … */
export function decoyEmail(position: number): string {
  return position === 0 ? "alice@example.com" : `alice${position + 1}@example.com`;
}

/** Plausible stand-ins per kind of personal text, with a mix of lengths. */
export const DECOYS = {
  title: [
    "Lunch with Jordan",
    "Dentist",
    "Team sync",
    "Gym",
    "Haircut",
    "Coffee with Sam",
    "Quarterly planning review",
    "Pick up parcel",
    "Call with the landlord",
    "Yoga",
    "Book club",
    "1:1 with Alex",
  ],
  location: [
    "12 Market Street",
    "Riverside Cafe",
    "Central Library",
    "45 Park Road, Unit 3",
    "The Green Room",
    "Station Square",
    "Northside Leisure Centre",
    "8 Mill Lane",
  ],
  prep: ["pack bag", "coffee", "stretch", "dishes", "shower", "breakfast", "water plants", "charge phone", "make bed", "walk"],
  issue: [
    "Update onboarding copy",
    "Fix login redirect",
    "Renew passport",
    "Order printer ink",
    "Write release notes",
    "Plan weekend trip",
    "Tidy up settings page",
    "Reply to Casey",
    "Migrate old invoices to the new folder",
    "Pay council tax",
    "Book car service",
    "Review pull request",
  ],
  label: ["Bug", "Website", "Home", "Errands", "Admin", "Feature", "Personal", "Finance", "Design"],
  identifier: ["WEB-142", "HR-7", "OPS-31", "APP-208", "ADM-12", "MOBILE-1024", "FIN-4", "DES-56"],
  date: ["Oct 3", "Nov 14", "Dec 1", "Oct 22", "Nov 7", "Jan 9"],
} as const;

export type DecoyKind = keyof typeof DECOYS;

/** FNV-1a: a small, stable string hash, so the same id always picks the same decoy. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** A stand-in for personal text, picked from the item's id or slot and never from the real value. */
export function decoy(kind: DecoyKind, seed: string | number): string {
  const pool = DECOYS[kind];
  return pool[hash(`${kind}:${seed}`) % pool.length]!;
}

/**
 * Decoys for a set shown side by side (the prep pills), kept distinct by probing past a value
 * already taken. Each pick still depends only on the ids, in order, never on the real labels.
 */
export function decoyEach(kind: DecoyKind, seeds: (string | number)[]): string[] {
  const pool = DECOYS[kind];
  const taken = new Set<number>();
  return seeds.map((seed) => {
    let i = hash(`${kind}:${seed}`) % pool.length;
    while (taken.has(i) && taken.size < pool.length) i = (i + 1) % pool.length;
    taken.add(i);
    return pool[i]!;
  });
}

/** Keeps a plan chip's name but swaps its renewal or end date ("Lite · ends Nov 14"). */
export function decoyPlanDate(chip: string, seed: string): string {
  return chip.replace(/ · (renews|ends) .*$/, (_, verb: string) => ` · ${verb} ${decoy("date", seed)}`);
}

/** Swaps emails and dollar amounts inside text that otherwise stays (notices, errors, tooltips). */
export function maskInline(text: string): string {
  return text.replace(EMAIL, decoyEmail(0)).replace(MONEY, DECOY_DOLLARS);
}

/** Also swaps every other figure, for lines that are all balance ("Credits 48,237" → "Credits 67"). */
export function maskFigures(text: string): string {
  return text
    .replace(EMAIL, decoyEmail(0))
    .replace(new RegExp(`${MONEY.source}|\\d[\\d,.]*`, "g"), (m) => (m.includes("$") ? DECOY_DOLLARS : DECOY_FIGURE));
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

export type Privacy = {
  on: boolean;
  decoy: (kind: DecoyKind, seed: string | number, real: string) => string;
  email: (position: number, real: string) => string;
  text: (s: string) => string;
  figures: (s: string) => string;
};

/**
 * While privacy mode is on, `decoy` swaps personal text for a plausible stand-in seeded by the
 * item's id, `email` numbers account emails by position, `text` swaps emails and dollar amounts
 * inside text that stays, and `figures` also swaps plain numbers. Off, all return the real value.
 */
export function privacyFor(on: boolean): Privacy {
  const same = (s: string) => s;
  return on
    ? { on, decoy: (kind, seed) => decoy(kind, seed), email: (position) => decoyEmail(position), text: maskInline, figures: maskFigures }
    : { on, decoy: (_kind, _seed, real) => real, email: (_position, real) => real, text: same, figures: same };
}

export function usePrivacy(): Privacy {
  return privacyFor(useContext(PrivacyContext));
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
