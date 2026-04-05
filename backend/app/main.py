from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import func, select
from app.api.v1.endpoints import chat_router, cli_router
from app.db.base import Base
from app.db.session import engine, AsyncSessionLocal

app = FastAPI(title="Code-CLI API")

@app.on_event("startup")
async def startup():
    async with engine.begin() as conn:
        # Import models to ensure they are registered with Base
        from app.models.chat import ChatSession, ChatMessage, CLI, Attachment, AIModel
        await conn.run_sync(Base.metadata.create_all)

    # Seed required built-in CLIs without duplicating existing records.
    async with AsyncSessionLocal() as session:
        codex_result = await session.execute(
            select(CLI).where(func.lower(CLI.name) == "codex")
        )
        codex_cli = codex_result.scalar_one_or_none()
        if codex_cli is None:
            codex_cli = CLI(name="codex", description="OpenAI Codex CLI")
            session.add(codex_cli)
            await session.flush()

        codex_models = [
            ("gpt-5.4", "gpt-5.4"),
            ("gpt-5.4-mini", "gpt-5.4-mini"),
            ("gpt-5.3-codex", "gpt-5.3-codex"),
            ("gpt-5.3-codex-spark", "gpt-5.3-codex-spark"),
        ]

        for model_name, display_name in codex_models:
            model_result = await session.execute(
                select(AIModel).where(
                    AIModel.cli_id == codex_cli.id,
                    func.lower(AIModel.name) == model_name.lower(),
                )
            )
            if model_result.scalar_one_or_none() is None:
                session.add(
                    AIModel(
                        name=model_name,
                        display_name=display_name,
                        cli_id=codex_cli.id,
                    )
                )

        await session.commit()

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
