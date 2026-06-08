from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from backend.db.database import create_db
from backend.routers.prd_router import router as prd_router
from backend.routers.tests_router import router as tests_router

app = FastAPI(
    title="QA Pipeline API",
    description="Automated QA test case generation pipeline",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup():
    create_db()


app.include_router(prd_router)
app.include_router(tests_router)


@app.get("/health")
def health():
    return {"status": "ok", "service": "qa-pipeline"}


@app.get("/api/providers")
def list_providers():
    return {
        "providers": [
            {
                "id": "openai",
                "name": "OpenAI",
                "requires_key": True,
                "requires_base_url": False,
                "default_model": "gpt-4o",
                "models": ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo"],
            },
            {
                "id": "gemini",
                "name": "Google Gemini",
                "requires_key": True,
                "requires_base_url": False,
                "default_model": "gemini-2.0-flash",
                "models": ["gemini-2.0-flash", "gemini-1.5-pro", "gemini-1.5-flash"],
            },
            {
                "id": "openrouter",
                "name": "OpenRouter",
                "requires_key": True,
                "requires_base_url": False,
                "default_model": "meta-llama/llama-3.1-70b-instruct",
                "models": [
                    "meta-llama/llama-3.1-70b-instruct",
                    "anthropic/claude-sonnet-4-5",
                    "mistralai/mistral-large",
                    "google/gemma-2-27b-it",
                ],
            },
            {
                "id": "ollama",
                "name": "Ollama (local)",
                "requires_key": False,
                "requires_base_url": False,
                "default_model": "llama3.1",
                "models": ["llama3.1", "mistral", "codellama", "gemma2"],
            },
            {
                "id": "custom",
                "name": "Custom Server (Q-Solutions)",
                "requires_key": True,
                "requires_base_url": True,
                "default_model": "Qwen3-VL:latest",
                "default_base_url": "",
                "models": ["Qwen3-VL:latest", "gemma4:e4b"],
            },
        ]
    }