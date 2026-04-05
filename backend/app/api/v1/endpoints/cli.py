from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from app.db.session import get_db
from app.models.chat import CLI, AIModel
from app.schemas.chat import CLICreate, CLI as CLISchema, AIModelCreate, AIModel as AIModelSchema, AIModelUpdate
from uuid import UUID

router = APIRouter()

@router.post("/", response_model=CLISchema)
async def create_cli(cli_in: CLICreate, db: AsyncSession = Depends(get_db)):
    cli = CLI(name=cli_in.name, description=cli_in.description)
    db.add(cli)
    await db.commit()
    await db.refresh(cli)
    # Ensure models list is initialized (empty)
    return {
        "id": cli.id,
        "name": cli.name,
        "description": cli.description,
        "created_at": cli.created_at,
        "models": []
    }

@router.get("/", response_model=list[CLISchema])
async def get_clis(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(CLI)
        .options(selectinload(CLI.models))
        .order_by(CLI.created_at.desc())
    )
    return result.scalars().all()

@router.get("/{cli_id}", response_model=CLISchema)
async def get_cli(cli_id: UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(CLI)
        .options(selectinload(CLI.models))
        .filter(CLI.id == cli_id)
    )
    cli = result.scalar_one_or_none()
    if not cli:
        raise HTTPException(status_code=404, detail="CLI not found")
    return cli

@router.delete("/{cli_id}")
async def delete_cli(cli_id: UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(CLI).filter(CLI.id == cli_id))
    cli = result.scalar_one_or_none()
    if not cli:
        raise HTTPException(status_code=404, detail="CLI not found")
    await db.delete(cli)
    await db.commit()
    return {"status": "success"}

# AI Model Endpoints

@router.post("/models", response_model=AIModelSchema)
async def create_model(model_in: AIModelCreate, db: AsyncSession = Depends(get_db)):
    model = AIModel(
        name=model_in.name,
        display_name=model_in.display_name,
        cli_id=model_in.cli_id
    )
    db.add(model)
    await db.commit()
    await db.refresh(model)
    return model

@router.get("/models/{cli_id}", response_model=list[AIModelSchema])
async def get_cli_models(cli_id: UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(AIModel).filter(AIModel.cli_id == cli_id).order_by(AIModel.created_at.desc()))
    return result.scalars().all()

@router.patch("/models/{model_id}", response_model=AIModelSchema)
async def update_model(model_id: UUID, model_in: AIModelUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(AIModel).filter(AIModel.id == model_id))
    model = result.scalar_one_or_none()
    if not model:
        raise HTTPException(status_code=404, detail="Model not found")
    
    if model_in.name is not None:
        model.name = model_in.name
    if model_in.display_name is not None:
        model.display_name = model_in.display_name
        
    await db.commit()
    await db.refresh(model)
    return model

@router.delete("/models/{model_id}")
async def delete_model(model_id: UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(AIModel).filter(AIModel.id == model_id))
    model = result.scalar_one_or_none()
    if not model:
        raise HTTPException(status_code=404, detail="Model not found")
    await db.delete(model)
    await db.commit()
    return {"status": "success"}
