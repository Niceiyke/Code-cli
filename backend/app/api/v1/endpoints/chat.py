from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from app.db.session import get_db
from app.models.chat import ChatSession, ChatMessage, CLI
from app.schemas.chat import MessageCreate, Session, SessionWithMessages, SessionCreate, Message
import httpx
import os
from uuid import UUID
from datetime import datetime
from typing import List

router = APIRouter()

N8N_WEBHOOK_URL = os.getenv("N8N_WEBHOOK_URL")

@router.post("/sessions", response_model=Session)
async def create_session(session_in: SessionCreate, db: AsyncSession = Depends(get_db)):
    session = ChatSession(
        title=session_in.title, 
        cli_id=session_in.cli_id,
        path=session_in.path
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)
    return session

@router.get("/sessions", response_model=List[Session])
async def get_sessions(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ChatSession).order_by(ChatSession.created_at.desc()))
    return result.scalars().all()

@router.get("/sessions/{session_id}", response_model=SessionWithMessages)
async def get_session(session_id: UUID, db: AsyncSession = Depends(get_db)):
    # Fetch session
    session_result = await db.execute(select(ChatSession).filter(ChatSession.id == session_id))
    session = session_result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    # Fetch messages separately
    messages_result = await db.execute(
        select(ChatMessage)
        .filter(ChatMessage.session_id == session_id)
        .order_by(ChatMessage.created_at.asc())
    )
    messages = messages_result.scalars().all()
    
    # Manually construct the response data
    return {
        "id": session.id,
        "title": session.title,
        "cli_id": session.cli_id,
        "path": session.path,
        "created_at": session.created_at,
        "messages": [
            {
                "id": m.id,
                "role": m.role,
                "content": m.content,
                "created_at": m.created_at
            } for m in messages
        ]
    }

from sqlalchemy import func

@router.post("/sessions/{session_id}/messages", response_model=Message)
async def send_message(session_id: UUID, message_in: MessageCreate, db: AsyncSession = Depends(get_db)):
    # Fetch session to get CLI info
    result = await db.execute(select(ChatSession).filter(ChatSession.id == session_id))
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Determine if we should resume
    count_result = await db.execute(
        select(func.count(ChatMessage.id))
        .filter(ChatMessage.session_id == session_id, ChatMessage.role == "ai")
    )
    ai_msg_count = count_result.scalar()
    is_resume = ai_msg_count > 0

    cli_name = "default"
    if session.cli_id:
        cli_result = await db.execute(select(CLI).filter(CLI.id == session.cli_id))
        cli = cli_result.scalar_one_or_none()
        if cli:
            cli_name = cli.name

    # 1. Save user message
    user_msg = ChatMessage(session_id=session_id, role="user", content=message_in.content)
    db.add(user_msg)
    
    # 2. Create placeholder AI message
    ai_msg = ChatMessage(session_id=session_id, role="ai", content="Thinking...")
    db.add(ai_msg)
    
    await db.commit()
    await db.refresh(ai_msg)

    # 3. Fire-and-forget to n8n (with a short timeout for the trigger itself)
    if N8N_WEBHOOK_URL:
        async def trigger_n8n():
            async with httpx.AsyncClient(timeout=5.0) as client:
                try:
                    payload = {
                        "clitype": cli_name,
                        "session_id": str(session_id),
                        "prompt": message_in.content,
                        "is_resume": is_resume,
                        "path": session.path,
                        "callback_url": f"https://api-code-cli.wordlyte.com/api/v1/chat/callback/{ai_msg.id}"
                    }
                    # Send back the external session ID using the key n8n expects/provides
                    if session.external_session_id:
                        payload["session-id"] = session.external_session_id
                        payload["external_session_id"] = session.external_session_id
                    
                    print(f"Triggering n8n with payload: {payload}")
                    await client.post(N8N_WEBHOOK_URL, json=payload)
                except Exception as e:
                    print(f"Error triggering n8n: {e}")

        import asyncio
        asyncio.create_task(trigger_n8n())

    return ai_msg

from fastapi import APIRouter, Depends, HTTPException, Request

@router.post("/callback/{message_id}")
async def n8n_callback(message_id: UUID, request: Request, db: AsyncSession = Depends(get_db)):
    try:
        data = await request.json()
    except Exception:
        # Fallback if it's not valid JSON
        body = await request.body()
        data = {"output": body.decode()}

    print(f"Received callback for {message_id}: {data}")
    
    # Handle n8n often sending a list [ { ... } ]
    if isinstance(data, list) and len(data) > 0:
        data = data[0]
    elif isinstance(data, list):
        data = {}

    result = await db.execute(select(ChatMessage).filter(ChatMessage.id == message_id))
    message = result.scalar_one_or_none()
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")
    
    # Try multiple common keys for the output content
    output_content = data.get("output") or data.get("text") or data.get("response") or data.get("content") or data.get("message")
    
    # Save external session ID if provided
    external_session_id = data.get("session-id")
    if external_session_id:
        # Get the session associated with this message
        session_result = await db.execute(
            select(ChatSession).filter(ChatSession.id == message.session_id)
        )
        session = session_result.scalar_one_or_none()
        if session:
            session.external_session_id = str(external_session_id)

    if output_content:
        import json
        import re
        content_str = str(output_content).strip()
        
        # Try to find a JSON block in the response (common for agentic outputs)
        json_match = re.search(r'\{.*\}', content_str, re.DOTALL)
        extracted_json = None
        if json_match:
            try:
                extracted_json = json.loads(json_match.group())
            except Exception:
                pass

        if extracted_json and isinstance(extracted_json, dict) and "response" in extracted_json:
            # If we found a valid JSON with a "response" key, use that
            message.content = extracted_json["response"]
        else:
            # Fallback to filtering out "Thinking" lines
            lines = content_str.split('\n')
            filtered_lines = [line for line in lines if not (line.strip().startswith("I will") or line.strip().startswith("I'll"))]
            final_content = "\n".join(filtered_lines).strip()
            message.content = final_content if final_content else content_str
    else:
        # If no common key found, but data exists, use the whole dict as string or a fallback
        message.content = str(data) if data else "No response from AI"

    await db.commit()
    return {"status": "success"}

@router.patch("/sessions/{session_id}", response_model=Session)
async def update_session(session_id: UUID, session_in: SessionCreate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ChatSession).filter(ChatSession.id == session_id))
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    if session_in.title:
        session.title = session_in.title
    if session_in.cli_id:
        session.cli_id = session_in.cli_id
    if session_in.path:
        session.path = session_in.path
        
    await db.commit()
    await db.refresh(session)
    return session

@router.delete("/sessions/{session_id}")
async def delete_session(session_id: UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ChatSession).filter(ChatSession.id == session_id))
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    await db.delete(session)
    await db.commit()
    return {"status": "success"}
