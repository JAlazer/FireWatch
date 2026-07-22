# Creates the FastAPI app, registers controllers, runs startup events

from fastapi import FastAPI

app = FastAPI()

@app.get("/")
async def root():
    return {"message": "Hello world!"}
