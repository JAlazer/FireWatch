# Creates the FastAPI app, registers controllers, runs startup events

from fastapi import FastAPI

from app.controllers import (
    biometrics_controller,
    inflammation_controller,
    lifestyle_controller,
    users_controller,
)

app = FastAPI(title="FireWatch API")

app.include_router(users_controller.router)
app.include_router(biometrics_controller.router)
app.include_router(lifestyle_controller.router)
app.include_router(inflammation_controller.router)


@app.get("/")
async def root() -> dict:
    return {"message": "FireWatch API"}
