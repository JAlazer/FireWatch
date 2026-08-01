// Persistence for the onboarding answers. Storage-backend-AGNOSTIC: the functions
// take a KeyValueStore adapter, so the app passes AsyncStorage (see ./asyncStorage)
// while tests pass an in-memory stub. That keeps the eventual move to server-side
// storage contained to one adapter, and lets the flow be verified in Node.
//
// Stores the OnboardingProfile the mapping layer already consumes, plus:
//   - `seed`: a STABLE per-user seed generated ONCE at completion. Without it every
//     launch would regenerate a different synthetic person, defeating determinism.
//   - `startDate`: when this user's data history begins (normally = completion time;
//     a dev preset can backdate it to reach steady/elevated dashboard states).

import type { OnboardingProfile } from "../mock/mapping";

export interface KeyValueStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

const KEY = "firewatch.onboarding.v1";

export interface StoredOnboarding extends OnboardingProfile {
  seed: string; // stable, generated once
  completedAt: string; // ISO
  startDate: string; // ISO — history begins here (defaults to completedAt)
}

/** A stable per-user seed. Generated once at completion, then persisted forever. */
export function newSeed(): string {
  return `u-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

export async function saveOnboarding(store: KeyValueStore, profile: OnboardingProfile, opts?: { startDate?: string }): Promise<StoredOnboarding> {
  const nowIso = new Date().toISOString();
  const stored: StoredOnboarding = {
    ...profile,
    seed: profile.seed || newSeed(),
    completedAt: nowIso,
    startDate: opts?.startDate ?? nowIso,
  };
  await store.setItem(KEY, JSON.stringify(stored));
  return stored;
}

export async function loadOnboarding(store: KeyValueStore): Promise<StoredOnboarding | null> {
  const raw = await store.getItem(KEY);
  return raw ? (JSON.parse(raw) as StoredOnboarding) : null;
}

export async function isOnboardingComplete(store: KeyValueStore): Promise<boolean> {
  return (await store.getItem(KEY)) != null;
}

/** Dev-only: clear the persisted profile and return to onboarding. */
export async function clearOnboarding(store: KeyValueStore): Promise<void> {
  await store.removeItem(KEY);
}
