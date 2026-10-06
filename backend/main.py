import time

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:5500"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

ALLOWED_STATUSES = ["REPORTED", "DISPATCHED", "RESPONDING", "RESOLVED"]
RESPONSE_TEAMS = ["Security Team", "Medical Team", "Fire Response Team"]

# In-memory store: cleared whenever the server restarts (prototype only).
INCIDENTS = {}


class DispatchRequest(BaseModel):
    team: str = Field(..., description="Response team to dispatch")


class StatusRequest(BaseModel):
    status: str = Field(..., description="New incident status")


def _find(incident_id):
    incident = INCIDENTS.get(incident_id)
    if incident is None:
        raise HTTPException(status_code=404, detail=f"Incident {incident_id} not found")
    return incident


@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "message": "DecodeX backend is running"
    }


@app.get("/api/teams")
def teams():
    return {"teams": RESPONSE_TEAMS, "statuses": ALLOWED_STATUSES}


@app.get("/api/incidents")
def list_incidents():
    return {
        "success": True,
        "count": len(INCIDENTS),
        "incidents": list(INCIDENTS.values())
    }


@app.get("/api/incidents/{incident_id}")
def get_incident(incident_id):
    return {"success": True, "incident": _find(incident_id)}


@app.post("/api/analyze")
def analyze(data: dict):
    response = {
        "success": True,
        "result": "Demo analysis",
        "score": 85
    }

    if "emergency_type" in data:
        incident_id = f"INC-{len(INCIDENTS) + 1:03d}"

        while incident_id in INCIDENTS:
            incident_id = f"INC-{len(INCIDENTS) + 1:03d}-{int(time.time()) % 1000:03d}"

        incident = {
            "incident_id": incident_id,
            "emergency_type": data.get("emergency_type"),
            "severity": data.get("severity"),
            "description": data.get("description"),
            "latitude": data.get("latitude"),
            "longitude": data.get("longitude"),
            "created_at": time.time(),
            "status": "REPORTED",
            "assigned_team": None,
            "history": [{"status": "REPORTED", "at": time.time(), "team": None}]
        }

        INCIDENTS[incident_id] = incident

        response.update({
            "incident_id": incident_id,
            "status": "REPORTED",
            "dispatch_status": "PENDING",
            "received_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
            "emergency_type": incident["emergency_type"],
            "severity": incident["severity"],
            "description": incident["description"],
            "latitude": incident["latitude"],
            "longitude": incident["longitude"],
            "incident": incident
        })

    return response


@app.post("/api/incidents/{incident_id}/dispatch")
def dispatch_incident(incident_id: str, payload: DispatchRequest):
    incident = _find(incident_id)

    team = payload.team
    if team not in RESPONSE_TEAMS:
        raise HTTPException(status_code=400, detail=f"Unknown team '{team}'")

    now = time.time()
    incident["assigned_team"] = team
    incident["status"] = "DISPATCHED"
    incident["history"].append({"status": "DISPATCHED", "at": now, "team": team})

    return {"success": True, "incident": incident}


@app.post("/api/incidents/{incident_id}/status")
def update_incident_status(incident_id: str, payload: StatusRequest):
    incident = _find(incident_id)

    new_status = payload.status.upper()
    if new_status not in ALLOWED_STATUSES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid status '{payload.status}'. Allowed: {', '.join(ALLOWED_STATUSES)}"
        )

    now = time.time()
    incident["status"] = new_status
    incident["history"].append({
        "status": new_status,
        "at": now,
        "team": incident["assigned_team"]
    })

    return {"success": True, "incident": incident}