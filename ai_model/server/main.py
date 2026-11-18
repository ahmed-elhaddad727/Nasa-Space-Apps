from fastapi import FastAPI
from routes.base import base_router
from routes.rotations import rotations_router

app = FastAPI()


@app.get("/")
async def welcome():
    return {"running successfully"}


app.include_router(base_router)
app.include_router(rotations_router)
