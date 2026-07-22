# FireWatch — Project Vision

## What this app does
FireWatch links lifestyle and wearable physiological data to inflammation
levels. Chronic inflammation correlates with diet, sleep, and activity;
this app surfaces that connection to users managing autoimmune/inflammatory
conditions, using data they already have from an Apple Watch — not a new
sensor, just better interpretation of existing signals.

## Core user flow
1. **Onboarding**
   - Lifestyle survey: diet quality, smoking status, alcohol consumption,
     medication use (esp. anti-inflammatory/immunosuppressive — this is a
     confounder that can suppress true biometric signal), activity level,
     stress level, shift work, family history, current flare status,
     hasAutoimmuneCondition
   - Length of time managing inflammation/condition
2. **Data Display**
   - Raw data (device biometrics feeding the model)
   - Inflammation score (model output)
   - Insights (what's driving the score)

## Core technical bet
Personalized baseline > population norms. HRV (SDNN on iOS) is the primary
signal, supported by resting heart rate, skin temperature, respiratory
rate, sleep architecture, SpO2, and mobility. A composite z-score measures
deviation from *this user's own* baseline, not a generic healthy range —
inter-individual variability in these signals is too high for population
norms to be meaningful here.

## Current phase: MVP with mock data
- No real HealthKit integration yet — deliberately deferred (Apple
  Developer Program friction isn't worth solving before the product logic
  is validated)
- Client: `MockHealthDataProvider` implements the same interface a real
  `HealthKitProvider` will later — swapping providers should never require
  touching UI/screen code
- Server: `mock_user_repository.py` implements the same interface a real
  DB-backed repository will later — no DB/alembic work in this phase

## Explicitly out of scope for now
- Real HealthKit data integration
- Database setup (mock repository only)
- Android/Health Connect (was considered, deliberately shelved — Apple
  Watch's HRV/skin-temp sensing is more mature for this specific use case)
- Direct biomarker sensing hardware (separate, more speculative project
  concept — not this app)

## Key architectural decisions already made
- Client: Expo SDK 54, provider pattern (`providers/HealthDataProvider.ts`
  interface) so mock → real HealthKit is a config swap, not a rewrite
- Server: FastAPI, layered — controllers → services → repositories →
  models, so mock → real DB is the same kind of swap
- Lifestyle and biometrics are separate domains with separate
  controllers/services/repositories, not merged into one