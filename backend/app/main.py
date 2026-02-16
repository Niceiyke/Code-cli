from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.v1.endpoints import chat_router, cli_router
from app.db.base import Base
from app.db.session import engine

app = FastAPI(title="Code-CLI API")

@app.on_event("startup")
async def startup():
    async with engine.begin() as conn:
        # Import models to ensure they are registered with Base
        from app.models.chat import ChatSession, ChatMessage, CLI
        await conn.run_sync(Base.metadata.create_all)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(chat_router, prefix="/api/v1/chat", tags=["chat"])
app.include_router(cli_router, prefix="/api/v1/cli", tags=["cli"])

@app.get("/health")
async def health_check():
    return {"status": "healthy"}
