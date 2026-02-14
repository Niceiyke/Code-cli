from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from app.db.session import get_db
from app.models.chat import ChatSession, ChatMessage
from app.schemas.chat import MessageCreate, Session, SessionWithMessages, SessionCreate
import httpx
import os
from uuid import UUID
from datetime import datetime

router = APIRouter()

N8N_WEBHOOK_URL = os.getenv("N8N_WEBHOOK_URL")

@router.post("/sessions", response_model=Session)
async def create_session(session_in: SessionCreate, db: AsyncSession = Depends(get_db)):
    session = ChatSession(title=session_in.title, cli_id=session_in.cli_id)
    db.add(session)
    await db.commit()
    await db.refresh(session)
    return session

@router.get("/sessions", response_model=list[Session])
async def get_sessions(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ChatSession).order_by(ChatSession.created_at.desc()))
    return result.scalars().all()

@router.get("/sessions/{session_id}", response_model=SessionWithMessages)
async def get_session(session_id: UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ChatSession).filter(ChatSession.id == session_id))
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session

@router.post("/sessions/{session_id}/messages")
async def send_message(session_id: UUID, message_in: MessageCreate, db: AsyncSession = Depends(get_db)):
    # Save user message
    user_msg = ChatMessage(session_id=session_id, role="user", content=message_in.content)
    db.add(user_msg)
    await db.commit()

    # Forward to n8n
    if not N8N_WEBHOOK_URL:
        ai_content = "N8N_WEBHOOK_URL not configured. This is a mock response."
    else:
        async with httpx.AsyncClient() as client:
            try:
                response = await client.post(N8N_WEBHOOK_URL, json={
                    "session_id": str(session_id),
                    "message": message_in.content
                })
                # Assuming n8n returns {"output": "..."}
                ai_content = response.json().get("output", "No response from AI")
            except Exception as e:
                ai_content = f"Error communicating with n8n: {str(e)}"

    # Save AI message
    ai_msg = ChatMessage(session_id=session_id, role="ai", content=ai_content)
    db.add(ai_msg)
    await db.commit()
    await db.refresh(ai_msg)

    return ai_msg
