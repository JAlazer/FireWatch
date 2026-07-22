# FireWatch Backend
FastAPI, layered architecture: controllers → services → repositories → models.

## Commands
- `uvicorn app.main:app --reload` — run dev server
- `pytest` — run tests
- `alembic upgrade head` — apply migrations

## Conventions
- Controllers only handle routing/validation — no business logic
- Services never touch the DB directly — always go through repositories
- New repository classes must implement base_repository.py's interface
- Currently using mock_user_repository.py, not the real DB — see data/mock_users.py

## Code style
- Type hints on all function signatures
- Pydantic schemas in schemas/, never return ORM models directly from controllers

## MVP phase — current scope
- Do NOT set up alembic migrations or wire up a real DB connection yet
- All repositories should use mock_user_repository.py pattern (see data/mock_users.py)
- If a task seems to require real DB work, flag it and ask before proceeding