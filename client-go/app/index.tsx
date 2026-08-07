import { Redirect } from "expo-router";
import { useEffect, useState } from "react";
import { asyncStorageAdapter } from "@/src/storage/asyncStorage";
import { isOnboardingComplete } from "@/src/storage/onboardingStore";

// The app's launch gate. It is TWO-STAGE by design: a LOGIN check is coming (Clerk)
// and must slot in AHEAD of the onboarding check without a rewrite. Order:
//
//   authenticated?  -> no  -> login        (NOT BUILT — pass-through for now)
//   onboarded?      -> no  -> onboarding
//   else                   -> tabs
//
// Only the onboarding stage is built here; the auth stage is a clearly-marked
// pass-through so adding it later is purely additive.
export default function Index() {
  // STAGE 1 — AUTH (NOT BUILT). Hard-coded authenticated until login lands. When it
  // does: replace with the real check, redirect to "/login" when not authed, and
  // pass the real user id into isOnboardingComplete (the store is already per-user).
  const authenticated = true; // TODO(login): real auth check + <Redirect href="/login" />

  // STAGE 2 — ONBOARDING. null = still reading storage.
  const [onboarded, setOnboarded] = useState<boolean | null>(null);
  useEffect(() => {
    isOnboardingComplete(asyncStorageAdapter).then(setOnboarded);
  }, []);

  // When auth exists, this becomes: if (!authenticated) return <Redirect href="/login" />
  if (!authenticated) return <Redirect href="/onboarding" />; // placeholder target
  if (onboarded === null) return null; // brief blank while reading storage
  if (!onboarded) return <Redirect href="/onboarding" />;
  return <Redirect href="/(tabs)/dashboard" />;
}
