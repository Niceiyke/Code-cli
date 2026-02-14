from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from app.db.session import get_db
from app.models.chat import CLI
from app.schemas.chat import CLICreate, CLI as CLISchema
from uuid import UUID

router = APIRouter()

@router.post("/", response_model=CLISchema)
async def create_cli(cli_in: CLICreate, db: AsyncSession = Depends(get_db)):
    cli = CLI(name=cli_in.name, description=cli_in.description)
    db.add(cli)
    await db.commit()
    await db.refresh(cli)
    return cli

@router.get("/", response_model=list[CLISchema])
async def get_clis(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(CLI).order_by(CLI.created_at.desc()))
    return result.scalars().all()

@router.get("/{cli_id}", response_model=CLISchema)
async def get_cli(cli_id: UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(CLI).filter(CLI.id == cli_id))
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
