from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from app.services import incidents_store

router = APIRouter(prefix="/incidents", tags=["incidents"])


@router.get("/summary")
def incidents_summary() -> dict[str, Any]:
    return incidents_store.incident_summary()


class IncidentCreate(BaseModel):
    title: str = Field(..., min_length=2)
    building_id: str | None = None
    severity: str = Field("medium", pattern="^(low|medium|high|critical)$")
    status: str = Field("open", pattern="^(open|in_progress|resolved|closed)$")
    detail: str | None = None


class IncidentPatch(BaseModel):
    title: str | None = None
    severity: str | None = Field(None, pattern="^(low|medium|high|critical)$")
    status: str | None = Field(None, pattern="^(open|in_progress|resolved|closed)$")
    detail: str | None = None


@router.get("")
def list_incidents(
    status: str | None = Query(None, pattern="^(open|in_progress|resolved|closed)$"),
    limit: int = Query(100, ge=1, le=500),
) -> dict[str, Any]:
    items = incidents_store.list_incidents(status=status, limit=limit)
    return {"count": len(items), "items": items}


@router.post("")
def create_incident(body: IncidentCreate) -> dict[str, Any]:
    item = incidents_store.create_incident(
        title=body.title,
        building_id=body.building_id,
        severity=body.severity,
        status=body.status,
        detail=body.detail,
    )
    return {"item": item}


@router.patch("/{incident_id}")
def patch_incident(incident_id: int, body: IncidentPatch) -> dict[str, Any]:
    item = incidents_store.update_incident(
        incident_id=incident_id,
        title=body.title,
        severity=body.severity,
        status=body.status,
        detail=body.detail,
    )
    if not item:
        raise HTTPException(status_code=404, detail="Incident not found")
    return {"item": item}

