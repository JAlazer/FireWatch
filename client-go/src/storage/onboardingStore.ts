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

// LOGIN IS COMING (Clerk). Keying the profile globally would hand a second account,
// after logout/login, the previous user's profile — and their synthetic body. So
// the key is PER USER from the start. Until login exists there's one placeholder
// identity; once it does, pass the real user id through and this becomes correct for
// free. Cheap now, awkward once there's stored data.
export const PLACEHOLDER_USER_ID = "__local_dev__"; // clearly-marked stand-in identity

const KEY_PREFIX = "firewatch.onboarding.v1";
const keyFor = (userId: string) => `${KEY_PREFIX}:${userId}`;

export interface StoredOnboarding extends OnboardingProfile {
  seed: string; // stable, generated once
  completedAt: string; // ISO
  startDate: string; // ISO — history begins here (defaults to completedAt)
}

/** A stable per-user seed. Generated once at completion, then persisted forever. */
export function newSeed(): string {
  return `u-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

export async function saveOnboarding(store: KeyValueStore, profile: OnboardingProfile, opts?: { startDate?: string; userId?: string }): Promise<StoredOnboarding> {
  const nowIso = new Date().toISOString();
  const stored: StoredOnboarding = {
    ...profile,
    seed: profile.seed || newSeed(),
    completedAt: nowIso,
    startDate: opts?.startDate ?? nowIso,
  };
  await store.setItem(keyFor(opts?.userId ?? PLACEHOLDER_USER_ID), JSON.stringify(stored));
  return stored;
}

export async function loadOnboarding(store: KeyValueStore, userId: string = PLACEHOLDER_USER_ID): Promise<StoredOnboarding | null> {
  const raw = await store.getItem(keyFor(userId));
  return raw ? (JSON.parse(raw) as StoredOnboarding) : null;
}

export async function isOnboardingComplete(store: KeyValueStore, userId: string = PLACEHOLDER_USER_ID): Promise<boolean> {
  return (await store.getItem(keyFor(userId))) != null;
}

/** Dev-only: clear the persisted profile and return to onboarding. */
export async function clearOnboarding(store: KeyValueStore, userId: string = PLACEHOLDER_USER_ID): Promise<void> {
  await store.removeItem(keyFor(userId));
}
