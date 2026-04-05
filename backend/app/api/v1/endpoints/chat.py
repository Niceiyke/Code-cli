from fastapi import APIRouter, Depends, HTTPException, Request, Response, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from app.db.session import get_db
from app.models.chat import ChatSession, ChatMessage, CLI, Attachment
from app.schemas.chat import MessageCreate, Session, SessionWithMessages, SessionCreate, Message
import httpx
import os
import base64
from uuid import UUID
from datetime import datetime
from typing import List

router = APIRouter()

N8N_WEBHOOK_URL = os.getenv("N8N_WEBHOOK_URL")
N8N_CALLBACK_BASE_URL = os.getenv("N8N_CALLBACK_BASE_URL", "").strip().rstrip("/")


def get_public_base_url(request: Request) -> str:
    configured_base_url = os.getenv("PUBLIC_API_BASE_URL", "").strip().rstrip("/")
    if configured_base_url:
        return configured_base_url

    forwarded_proto = request.headers.get("x-forwarded-proto", "").split(",")[0].strip()
    forwarded_host = request.headers.get("x-forwarded-host", "").split(",")[0].strip()

    if forwarded_proto and forwarded_host:
        return f"{forwarded_proto}://{forwarded_host}"

    return str(request.base_url).rstrip("/")


def get_n8n_callback_base_url(request: Request) -> str:
    if N8N_CALLBACK_BASE_URL:
        return N8N_CALLBACK_BASE_URL

    return get_public_base_url(request)

@router.post("/sessions", response_model=Session)
async def create_session(session_in: SessionCreate, db: AsyncSession = Depends(get_db)):
    session = ChatSession(
        title=session_in.title, 
        cli_id=session_in.cli_id,
        model_id=session_in.model_id,
        path=session_in.path,
        model=session_in.model
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)
    return session

from sqlalchemy import func, desc, nullslast

@router.get("/sessions", response_model=List[Session])
async def get_sessions(db: AsyncSession = Depends(get_db)):
    # Sort by is_pinned first, then updated_at
    result = await db.execute(
        select(ChatSession).order_by(
            nullslast(desc(ChatSession.is_pinned)), 
            desc(ChatSession.updated_at)
        )
    )
    return result.scalars().all()

@router.patch("/sessions/{session_id}/pin", response_model=Session)
async def pin_session(session_id: UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ChatSession).filter(ChatSession.id == session_id))
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    # Toggle pinning: if pinned, unpin (None); if unpinned, pin (current time)
    if session.is_pinned:
        session.is_pinned = None
    else:
        session.is_pinned = datetime.utcnow()
        
    await db.commit()
    await db.refresh(session)
    return session

@router.get("/sessions/{session_id}", response_model=SessionWithMessages)
async def get_session(session_id: UUID, db: AsyncSession = Depends(get_db)):
    # Fetch session
    session_result = await db.execute(select(ChatSession).filter(ChatSession.id == session_id))
    session = session_result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    # Fetch messages separately with attachments
    messages_result = await db.execute(
        select(ChatMessage)
        .options(selectinload(ChatMessage.attachments))
        .filter(ChatMessage.session_id == session_id)
        .order_by(ChatMessage.created_at.asc())
    )
    messages = messages_result.scalars().all()
    
    # Manually construct the response data
    return {
        "id": session.id,
        "title": session.title,
        "cli_id": session.cli_id,
        "model_id": session.model_id,
        "path": session.path,
        "model": session.model,
        "created_at": session.created_at,
        "updated_at": session.updated_at,
        "messages": [
            {
                "id": m.id,
                "role": m.role,
                "content": m.content,
                "created_at": m.created_at,
                "attachments": [
                    {
                        "id": a.id,
                        "file_name": a.file_name,
                        "mime_type": a.mime_type,
                        "created_at": a.created_at
                    } for a in m.attachments
                ]
            } for m in messages
        ]
    }

from sqlalchemy import func

@router.post("/sessions/{session_id}/messages", response_model=Message)
async def send_message(
    session_id: UUID,
    message_in: MessageCreate,
    request: Request,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    # Fetch session to get CLI info
    result = await db.execute(select(ChatSession).filter(ChatSession.id == session_id))
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Determine if we should resume
    # is_resume is true ONLY if there is at least one previous successful AI response
    count_result = await db.execute(
        select(func.count(ChatMessage.id))
        .filter(
            ChatMessage.session_id == session_id, 
            ChatMessage.role == "ai",
            ChatMessage.content != "Thinking..."
        )
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
    session.updated_at = datetime.utcnow()
    
    attachments_payload = []
    has_voice_note = False
    if message_in.attachments:
        for att in message_in.attachments:
            attachment = Attachment(
                file_name=att.file_name,
                mime_type=att.mime_type,
                data=att.data
            )
            user_msg.attachments.append(attachment)
            attachments_payload.append({
                "file_name": att.file_name,
                "mime_type": att.mime_type,
                "data": att.data
            })
            if att.mime_type.startswith("audio/"):
                has_voice_note = True

    db.add(user_msg)
    
    # 2. Create placeholder AI message
    ai_msg = ChatMessage(session_id=session_id, role="ai", content="Thinking...", attachments=[])
    db.add(ai_msg)
    
    await db.commit()
    await db.refresh(ai_msg, ["attachments"])

    # 3. Fire-and-forget to n8n (with a longer timeout for the trigger itself)
    if N8N_WEBHOOK_URL:
        # Pre-capture values to avoid detached session issues in background task
        session_path = session.path
        session_model = session.model
        external_session_id = session.external_session_id
        ai_msg_id = ai_msg.id
        
        callback_base_url = get_n8n_callback_base_url(request)

        async def trigger_n8n_task(
            cli_name_arg, 
            session_id_arg, 
            prompt_arg, 
            is_resume_arg, 
            has_voice_note_arg, 
            path_arg, 
            model_arg, 
            ai_msg_id_arg, 
            external_session_id_arg, 
            attachments_arg,
            callback_base_url_arg,
        ):
            payload = {
                "clitype": cli_name_arg,
                "session_id": str(session_id_arg),
                "prompt": prompt_arg,
                "is_resume": is_resume_arg,
                "has_voice_note": has_voice_note_arg,
                "path": path_arg,
                "model": model_arg,
                "callback_url": f"{callback_base_url_arg}/api/v1/chat/callback/{ai_msg_id_arg}",
                "attachments": attachments_arg
            }
            if external_session_id_arg:
                payload["session-id"] = external_session_id_arg
                payload["external_session_id"] = external_session_id_arg

            import json
            payload_size = len(json.dumps(payload))
            print(f"Triggering n8n for {ai_msg_id_arg}. Payload size: {payload_size} bytes. Keys: {list(payload.keys())}")

            try:
                trigger_timeout = httpx.Timeout(connect=10.0, read=5.0, write=30.0, pool=5.0)
                async with httpx.AsyncClient(timeout=trigger_timeout) as client:
                    response = await client.post(N8N_WEBHOOK_URL, json=payload)
                print(f"n8n response for {ai_msg_id_arg}: {response.status_code} {response.text}")

                if response.status_code >= 400:
                    # Update the message with an error if n8n rejects it
                    from app.db.session import AsyncSessionLocal
                    async with AsyncSessionLocal() as error_db:
                        err_result = await error_db.execute(select(ChatMessage).filter(ChatMessage.id == ai_msg_id_arg))
                        err_msg = err_result.scalar_one_or_none()
                        if err_msg:
                            err_msg.content = f"Error: n8n returned {response.status_code} - {response.text[:200]}"
                            await error_db.commit()
            except httpx.ReadTimeout:
                # The workflow can still complete after the trigger request times out waiting
                # for the webhook response, so leave the placeholder message in place.
                print(f"Timed out waiting for n8n trigger response for {ai_msg_id_arg}; leaving placeholder for callback.")
                return
            except Exception as e:
                print(f"Error triggering n8n for {ai_msg_id_arg}: {e}")
                # Update the message with the error immediately instead of retrying.
                last_error = e
            else:
                return

            try:
                from app.db.session import AsyncSessionLocal
                async with AsyncSessionLocal() as error_db:
                    err_result = await error_db.execute(select(ChatMessage).filter(ChatMessage.id == ai_msg_id_arg))
                    err_msg = err_result.scalar_one_or_none()
                    if err_msg and last_error is not None:
                        err_msg.content = f"Failed to trigger n8n: {str(last_error)}"
                        await error_db.commit()
            except Exception as db_err:
                print(f"Failed to update error message in DB: {db_err}")

        background_tasks.add_task(
            trigger_n8n_task,
            cli_name,
            session_id,
            message_in.content,
            is_resume,
            has_voice_note,
            session_path,
            session_model,
            ai_msg_id,
            external_session_id,
            attachments_payload,
            callback_base_url,
        )

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
    
    # Get the session associated with this message to update its timestamp
    session_result = await db.execute(
        select(ChatSession).filter(ChatSession.id == message.session_id)
    )
    session = session_result.scalar_one_or_none()
    if session:
        session.updated_at = datetime.utcnow()
        if external_session_id:
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

@router.get("/attachments/{attachment_id}")
async def get_attachment(attachment_id: UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Attachment).filter(Attachment.id == attachment_id))
    attachment = result.scalar_one_or_none()
    if not attachment:
        raise HTTPException(status_code=404, detail="Attachment not found")
    
    try:
        binary_data = base64.b64decode(attachment.data)
        return Response(content=binary_data, media_type=attachment.mime_type)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to decode attachment: {str(e)}")

from app.schemas.chat import MessageCreate, Session, SessionWithMessages, SessionCreate, Message, SessionUpdate

@router.patch("/sessions/{session_id}", response_model=Session)
async def update_session(session_id: UUID, session_in: SessionUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ChatSession).filter(ChatSession.id == session_id))
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    if session_in.title is not None:
        session.title = session_in.title
    if session_in.cli_id is not None:
        session.cli_id = session_in.cli_id
    if session_in.model_id is not None:
        session.model_id = session_in.model_id
    if session_in.path is not None:
        session.path = session_in.path
    if session_in.model is not None:
        session.model = session_in.model
        
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

@router.delete("/messages/{message_id}")
async def delete_message(message_id: UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ChatMessage).filter(ChatMessage.id == message_id))
    message = result.scalar_one_or_none()
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")
    
    await db.delete(message)
    await db.commit()
    return {"status": "success"}

@router.patch("/messages/{message_id}")
async def update_message(message_id: UUID, message_in: MessageCreate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ChatMessage).filter(ChatMessage.id == message_id))
    message = result.scalar_one_or_none()
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")
    
    if message_in.content:
        message.content = message_in.content
        
    await db.commit()
    await db.refresh(message)
    return {
        "id": message.id,
        "role": message.role,
        "content": message.content,
        "created_at": message.created_at
    }
