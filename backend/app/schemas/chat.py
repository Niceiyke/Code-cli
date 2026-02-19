from pydantic import BaseModel
from uuid import UUID
from datetime import datetime
from typing import List, Optional

class MessageBase(BaseModel):
    role: str
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

class CLIBase(BaseModel):
    name: str
    description: Optional[str] = None

class CLICreate(CLIBase):
    pass

class CLI(CLIBase):
    id: UUID
    created_at: datetime

    class Config:
        from_attributes = True

class SessionBase(BaseModel):
    title: Optional[str] = None
    cli_id: Optional[UUID] = None
    path: str = "/home/niceiyke"
    external_session_id: Optional[str] = None

class SessionCreate(SessionBase):
    pass

class Session(SessionBase):
    id: UUID
    created_at: datetime
    cli_id: Optional[UUID] = None
    
    class Config:
        from_attributes = True

class SessionWithMessages(Session):
    messages: List[Message]
