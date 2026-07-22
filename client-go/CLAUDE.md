@AGENTS.md

 # FireWatch Client
Expo SDK 54, React Native, TypeScript.

## Commands
- `npx expo start` — run in Expo Go (current phase, mock data only)
- `npx expo run:ios --device` — dev client build (once real HealthKit added)

## Conventions
- All health data access goes through the HealthDataProvider interface
  (see src/providers/) — never call HealthKit or mock data directly from components
- Currently using MockHealthDataProvider — do not add real HealthKit calls yet
- Use functional components + hooks only, no class components