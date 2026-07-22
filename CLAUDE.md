# FireWatch
Mobile app: React Native (Expo SDK 54) client + FastAPI backend.
Correlates lifestyle + HealthKit biometric data to inflammation levels.

## Structure
- `client/` — Expo/React Native app (see client/CLAUDE.md)
- `backend/` — FastAPI server (see backend/CLAUDE.md)

## Workflow
- Backend and frontend are developed independently; check the relevant
  package's CLAUDE.md before making changes there.
- Currently using mock data (see backend/app/data/mock_users.py) —
  no live HealthKit integration yet.