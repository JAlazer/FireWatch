@AGENTS.md

 # FireWatch Client
Expo SDK 54, React Native, TypeScript.

## Commands
- `npx expo start` — run in Expo Go (current phase, mock data only)
- `npx expo run:ios --device` — dev client build (once real HealthKit added)

## Conventions
- Read the exact versioned Expo docs (see AGENTS.md — https://docs.expo.dev/versions/v54.0.0/)
  before writing Expo/React Native code; APIs change across SDKs
- All health data access goes through the HealthDataProvider interface
  (see src/providers/) — never call HealthKit or mock data directly from components
- Currently using the mock provider — do not add real HealthKit calls yet
- Use functional components + hooks only, no class components

## Provider / mock split
- `src/providers/HealthDataProvider.ts` — the interface (matches the real
  @kingstinct/react-native-healthkit binding shape). Components depend only on this.
- `src/mock/` — deterministic, seeded generator (calibrated offline in data-parsing/);
  `MockHealthDataProvider` implements the interface over a `generate()` sample stream.
- `src/providers/buildProvider.ts` — the chain: persisted onboarding → mapping layer
  → generate() → a provider. Generation is range-independent, so it runs on demand.
- Scoring is a pure on-device module (`src/mock/score.ts`), not a server call.

## Which path is LIVE vs DORMANT (hybrid, mock phase)
- LIVE: onboarding persists the profile LOCALLY (source of truth, per-user key) and
  builds the mock provider from it; scoring is local. Onboarding completion is in
  `app/onboarding/markers.tsx` — `providers/OnboardingContext.tsx` is currently
  UNMOUNTED (Clerk-login groundwork; leave it alone).
- DORMANT: the server POSTs. `createUser`/`createLifestyle` run fire-and-forget on
  completion (never block); `saveBiometrics`/`getInflammation` (services/api.ts) have
  no live caller — the 6-field BiometricsCreate is superseded by the narrow BIOMETRICS
  table (FastAPI schema lagging the DB). These move back on-line when the server can
  hold a real time series.
- A LOGIN stage lands ahead of onboarding: the launch gate (app/index.tsx) is
  two-stage with a marked auth pass-through; the local store is already per-user.