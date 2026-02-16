# Code-CLI

Code-CLI is a modern, AI-powered web interface designed to interact with various Command Line Interfaces (CLIs) through a seamless, chat-like experience. It leverages a FastAPI backend, a React frontend, and integrates with n8n and Gemini to provide intelligent CLI assistance.

## 🚀 Features

- **Multi-CLI Support:** Easily switch between different CLI configurations.
- **Session Management:** Persist chat history and organize conversations.
- **Intelligent Assistance:** Powered by n8n and Gemini for context-aware CLI help and command generation.
- **Working Directory Tracking:** Maintain context of your current filesystem path across messages.
- **Asynchronous Processing:** Utilizes webhooks and callbacks for non-blocking AI responses.
- **Modern UI/UX:** Built with React, Tailwind CSS, and Framer Motion for a sleek, responsive experience.

## 🛠️ Tech Stack

### Backend
- **Framework:** FastAPI
- **Database:** PostgreSQL (with SQLAlchemy Async)
- **Validation:** Pydantic
- **Integration:** n8n Webhooks via `httpx`
- **Containerization:** Docker & Docker Compose

### Frontend
- **Framework:** React 18 (Vite)
- **Styling:** Tailwind CSS
- **Icons:** Lucide React
- **Animations:** Framer Motion
- **API Client:** Axios

## 📋 Prerequisites

- Docker and Docker Compose
- Node.js (for local frontend development)
- Python 3.10+ (for local backend development)
- n8n instance (for AI integration)

## ⚙️ Setup & Installation

### 1. Environment Configuration
Create a `.env` file in the root directory and add the following:
```env
N8N_WEBHOOK_URL=your_n8n_webhook_url
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DB=code_cli
DATABASE_URL=postgresql+asyncpg://postgres:postgres@db:5432/code_cli
```

### 2. Running with Docker
The easiest way to get started is using Docker Compose:
```bash
docker-compose up --build
```

This will spin up:
- **Backend:** Accessible at `http://localhost:8000`
- **Frontend:** Accessible at `http://localhost:5173`
- **Database:** PostgreSQL on port `5432`

### 3. Local Development

#### Backend
```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

#### Frontend
```bash
cd frontend
npm install
npm run dev
```

## 🔌 API Documentation

Once the backend is running, you can access the interactive Swagger documentation at:
- `http://localhost:8000/docs`

## 🤖 n8n Integration

The application expects an n8n webhook that accepts a JSON payload with:
- `clitype`: The selected CLI name
- `session_id`: Unique ID for the conversation
- `prompt`: The user's message
- `path`: Current working directory
- `callback_url`: The URL n8n should POST the response back to

## 📄 License

This project is licensed under the MIT License.
