from fastapi import FastAPI, APIRouter, Depends
import os
import logging

logger = logging.getLogger("uvicorn.error")

base_router = APIRouter(
    prefix="/api/v1",
    tags=["api_v1"],
)
@base_router.get("/welcome")
async def welcome(req, res):
    return {"server works"}
