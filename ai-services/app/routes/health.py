from fastapi import APIRouter
from datetime import datetime

router = APIRouter()


@router.get(
    "/",
    summary="Liveness probe",
    description="Returns the current status and timestamp of the service. Used for health checks.",
)
async def health_check():
    """Liveness probe — pinged by Express backend and Docker healthcheck."""
    return {
        "status":    "ok",
        "service":   "verification",
        "timestamp": datetime.utcnow().isoformat() + "Z",
    }
