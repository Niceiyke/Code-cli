from pydantic import BaseModel
from uuid import UUID
from datetime import datetime
from typing import List, Optional

class MessageBase(BaseModel):
    role: str = "user"
    content: str

class AttachmentBase(BaseModel):
    file_name: str
    mime_type: str
    data: str  # Base64 string

class AttachmentCreate(AttachmentBase):
    pass

class Attachment(AttachmentBase):
    id: UUID
    message_id: UUID
    created_at: datetime

    class Config:
        from_attributes = True

class AttachmentMinimal(BaseModel):
    id: UUID
    file_name: str
    mime_type: str
    created_at: datetime

    class Config:
        from_attributes = True

class MessageCreate(MessageBase):
    attachments: Optional[List[AttachmentCreate]] = None

class Message(MessageBase):
    id: UUID
    created_at: datetime
    attachments: Optional[List[AttachmentMinimal]] = []

    class Config:
        from_attributes = True

class AIModelBase(BaseModel):
    name: str
    display_name: str
    cli_id: UUID

class AIModelCreate(AIModelBase):
    pass

class AIModelUpdate(BaseModel):
    name: Optional[str] = None
    display_name: Optional[str] = None

class AIModel(AIModelBase):
    id: UUID
    created_at: datetime

    class Config:
        from_attributes = True

class CLIBase(BaseModel):
    name: str
    description: Optional[str] = None

class CLICreate(CLIBase):
    pass

class CLI(CLIBase):
    id: UUID
    created_at: datetime
    models: List[AIModel] = []

    class Config:
        from_attributes = True

class SessionBase(BaseModel):
    title: Optional[str] = None
    cli_id: Optional[UUID] = None
    model_id: Optional[UUID] = None
    path: str = "/home/niceiyke"
    model: str = "gemini-2.0-flash-exp"
    external_session_id: Optional[str] = None
    is_pinned: Optional[datetime] = None

class SessionCreate(SessionBase):
    pass

class SessionUpdate(BaseModel):
    title: Optional[str] = None
    cli_id: Optional[UUID] = None
    model_id: Optional[UUID] = None
    path: Optional[str] = None
    model: Optional[str] = None
    is_pinned: Optional[datetime] = None

class Session(SessionBase):
    id: UUID
    created_at: datetime
    updated_at: datetime
    cli_id: Optional[UUID] = None
    model_id: Optional[UUID] = None
    is_pinned: Optional[datetime] = None
    model: str = "gemini-2.0-flash-exp"
    
    class Config:
        from_attributes = True

class SessionWithMessages(Session):
    messages: List[Message]
