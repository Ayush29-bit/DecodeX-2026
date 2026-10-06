import math
import time

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

app = FastAPI()

# Prototype runs from a static file server (127.0.0.1:5500 or localhost:5500).
# No cookies / credentials are used, so any origin is safe to allow here.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

ALLOWED_STATUSES = ["REPORTED", "DISPATCHED", "RESPONDING", "ON_SCENE", "RESOLVED"]
RESPONSE_TEAMS = ["Security Team", "Medical Team", "Fire Response Team"]

TEAM_SECURITY = "Security Team"
TEAM_MEDICAL = "Medical Team"
TEAM_FIRE = "Fire Response Team"

# Deterministic keyword routing rules, checked in order.
# Each entry is (label, keywords, recommended teams).
ROUTING_RULES = [
    (
        "accident",
        ["accident", "crash", "collision", "injured", "injury"],
        [TEAM_MEDICAL, TEAM_SECURITY],
    ),
    (
        "gas leak",
        ["gas leak", "gas", "chemical leak"],
        [TEAM_FIRE, TEAM_SECURITY],
    ),
    (
        "security threat",
        ["threat", "weapon", "fight", "assault", "suspicious"],
        [TEAM_SECURITY],
    ),
    (
        "fire",
        ["fire", "smoke", "burning"],
        [TEAM_FIRE],
    ),
    (
        "structural collapse",
        ["collapse", "building collapse", "structural damage"],
        [TEAM_SECURITY, TEAM_MEDICAL],
    ),
]

DEFAULT_ROUTING_TEAMS = [TEAM_SECURITY]

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


def _to_float(value):
    """Coerce a submitted coordinate to a finite float, else None."""
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, str):
        value = value.strip()
        if value == "":
            return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(number):
        return None
    return number


def normalize_coords(latitude, longitude):
    """Return (lat, lng) floats, or (None, None) when no trustworthy fix exists.

    Never invents a location: invalid / out-of-range / missing values are stored
    as None so the UI shows "Not available" instead of a fake exact point.
    (0, 0) is the classic "no GPS fix" placeholder and is treated as missing.
    """
    lat = _to_float(latitude)
    lng = _to_float(longitude)

    if lat is None or lng is None:
        return None, None
    if not (-90.0 <= lat <= 90.0) or not (-180.0 <= lng <= 180.0):
        return None, None
    if lat == 0.0 and lng == 0.0:
        return None, None

    return lat, lng


def recommend_response_team(emergency_type, incident_text):
    """Deterministic rule-based routing (no AI / no ML).

    Returns (teams, reason). Same input always gives the same output,
    which keeps the demo easy to explain to judges.
    """
    kind = (emergency_type or "").strip().lower()

    if kind == "fire":
        return [TEAM_FIRE], "Recommended based on emergency type: Fire"

    if kind == "medical":
        return [TEAM_MEDICAL], "Recommended based on emergency type: Medical"

    if kind == "earthquake":
        return [TEAM_SECURITY, TEAM_MEDICAL], "Recommended based on emergency type: Earthquake"

    text = (incident_text or "").lower()

    for label, keywords, teams in ROUTING_RULES:
        for keyword in keywords:
            if keyword in text:
                return list(teams), f"Detected incident: {label}"

    return list(DEFAULT_ROUTING_TEAMS), "No specific rule matched: defaulting to Security Team"


@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "message": "CampusResQ backend is running"
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


@app.delete("/api/incidents")
def clear_incidents():
    cleared = len(INCIDENTS)
    INCIDENTS.clear()
    return {"success": True, "cleared": cleared, "message": "All incident history cleared."}


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

        incident_text = (data.get("incident_text") or "").strip()
        latitude, longitude = normalize_coords(
            data.get("latitude"), data.get("longitude")
        )
        recommended_teams, routing_reason = recommend_response_team(
            data.get("emergency_type"), incident_text
        )

        incident = {
            "incident_id": incident_id,
            "emergency_type": data.get("emergency_type"),
            "severity": data.get("severity"),
            "description": data.get("description"),
            "incident_text": incident_text,
            "latitude": latitude,
            "longitude": longitude,
            "created_at": time.time(),
            "status": "REPORTED",
            "assigned_team": None,
            "recommended_teams": recommended_teams,
            "routing_reason": routing_reason,
            "routing_source": "rules",
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
            "incident_text": incident["incident_text"],
            "latitude": incident["latitude"],
            "longitude": incident["longitude"],
            "recommended_teams": incident["recommended_teams"],
            "routing_reason": incident["routing_reason"],
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