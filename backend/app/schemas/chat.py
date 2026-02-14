from pydantic import BaseModel
from uuid import UUID
from datetime import datetime
from typing import List, Optional

class MessageBase(BaseModel):
    role: str
    content: str

class MessageCreate(MessageBase):
    pass

class Message(MessageBase):
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

    class Config:
        from_attributes = True

class SessionBase(BaseModel):
    title: Optional[str] = None
    cli_id: Optional[UUID] = None

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
