from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from app.core.config import settings
from app.routes import verification, health, profile
from app.middleware.timer import TimingMiddleware


@asynccontextmanager
async def lifespan(app: FastAPI):
    print(f"🚀 ServiceHub Verification Service starting on port {settings.PORT}")
    print(f"📋 Environment: {settings.ENV}")
    yield
    print("🛑 Verification Service shutting down")


app = FastAPI(
    title="ServiceHub Verification Service",
    description="AI-powered ID verification, face matching, and NSOPW check",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# Custom Timing Middleware
app.add_middleware(TimingMiddleware)

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Standardized Routes
# Health check is usually kept at root for convenience, but versioned is also fine.
app.include_router(health.router, prefix="/health", tags=["Health"])
app.include_router(verification.router, prefix="/api/v1/verify", tags=["Verification"])
app.include_router(profile.router, prefix="/api/v1/profile", tags=["Profile"])


@app.get("/")
async def root():
    return {
        "service": "ServiceHub Verification Service",
        "version": "1.0.0",
        "status": "online",
        "api_v1_docs": "/docs"
    }
