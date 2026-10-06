const API_BASE = "http://127.0.0.1:8000/api";
const POLL_MS = 2500;
const STATUS_ORDER = ["REPORTED", "DISPATCHED", "RESPONDING", "ON_SCENE", "RESOLVED"];
const TEAMS = ["Security Team", "Medical Team", "Fire Response Team"];
const TYPE_ICONS = {
    Fire: "🔥",
    Medical: "🏥",
    Earthquake: "🌎",
    Other: "⚠️"
};
const TEAM_ICONS = {
    "Medical Team": "🏥",
    "Security Team": "🛡️",
    "Fire Response Team": "🚒"
};

const el = {
    systemStatus: document.getElementById("systemStatus"),
    systemStatusText: document.getElementById("systemStatusText"),
    statActive: document.getElementById("statActive"),
    statCritical: document.getElementById("statCritical"),
    statDispatched: document.getElementById("statDispatched"),
    statResolved: document.getElementById("statResolved"),
    listMeta: document.getElementById("listMeta"),
    filterSelect: document.getElementById("filterSelect"),
    clearAllBtn: document.getElementById("clearAllBtn"),
    incidentList: document.getElementById("incidentList"),
    incidentEmpty: document.getElementById("incidentEmpty"),
    detailMeta: document.getElementById("detailMeta"),
    detailEmpty: document.getElementById("detailEmpty"),
    detailBody: document.getElementById("detailBody"),
    detailIcon: document.getElementById("detailIcon"),
    detailId: document.getElementById("detailId"),
    detailType: document.getElementById("detailType"),
    detailStatus: document.getElementById("detailStatus"),
    detailSeverity: document.getElementById("detailSeverity"),
    detailRecommend: document.getElementById("detailRecommend"),
    detailRecommendTeams: document.getElementById("detailRecommendTeams"),
    detailRecommendReason: document.getElementById("detailRecommendReason"),
    detailTextRow: document.getElementById("detailTextRow"),
    detailIncidentText: document.getElementById("detailIncidentText"),
    detailDescription: document.getElementById("detailDescription"),
    detailCoords: document.getElementById("detailCoords"),
    detailTime: document.getElementById("detailTime"),
    detailTeam: document.getElementById("detailTeam"),
    teamSelect: document.getElementById("teamSelect"),
    dispatchBtn: document.getElementById("dispatchBtn"),
    respondingBtn: document.getElementById("respondingBtn"),
    onSceneBtn: document.getElementById("onSceneBtn"),
    resolvedBtn: document.getElementById("resolvedBtn"),
    detailHistory: document.getElementById("detailHistory"),
    mapMeta: document.getElementById("mapMeta")
};

const state = {
    incidents: [],
    selectedId: null,
    online: false,
    map: null,
    markers: {},
    mapPointsKey: "",
    pendingFocus: false
};

/* ---------- Helpers ---------- */

function iconFor(type) {
    return TYPE_ICONS[type] || "⚠️";
}

function formatTime(epochSeconds) {
    if (!epochSeconds) {
        return "—";
    }
    const date = new Date(epochSeconds * 1000);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

/* Single source of truth for an incident's location.
   Returns {lat, lng} as real numbers, or null when no usable GPS fix exists
   (missing, non-numeric, out of range, or the 0,0 "no fix" placeholder). */
function coordsOf(incident) {
    if (!incident || incident.latitude === null || incident.longitude === null ||
        incident.latitude === undefined || incident.longitude === undefined) {
        return null;
    }

    const lat = Number(incident.latitude);
    const lng = Number(incident.longitude);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return null;
    }
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        return null;
    }
    if (lat === 0 && lng === 0) {
        return null;
    }

    return { lat, lng };
}

function formatCoords(incident) {
    const coords = coordsOf(incident);
    if (!coords) {
        return "Not available";
    }
    return `${coords.lat.toFixed(6)}, ${coords.lng.toFixed(6)}`;
}

function isValidCoords(incident) {
    return coordsOf(incident) !== null;
}

function setOnline(online) {
    state.online = online;
    el.systemStatusText.textContent = online ? "System Online" : "Backend Offline";
    el.systemStatus.classList.toggle("is-offline", !online);
}

function showMessage(text) {
    el.incidentEmpty.textContent = text;
    el.incidentEmpty.classList.remove("hidden");
}

/* ---------- Data ---------- */

async function apiRequest(path, options) {
    const response = await fetch(API_BASE + path, options);

    if (!response.ok) {
        let detail = "Request failed with status " + response.status;
        try {
            const body = await response.json();
            if (body.detail) {
                detail = body.detail;
            }
        } catch (parseError) {
            console.warn("Could not parse error response", parseError);
        }
        throw new Error(detail);
    }

    return response.json();
}

async function loadIncidents() {
    try {
        const data = await apiRequest("/incidents");
        setOnline(true);
        state.incidents = data.incidents || [];
        renderAll();
    } catch (error) {
        console.error(error);
        setOnline(false);
        showMessage(
            "Cannot reach the CampusResQ backend at " + API_BASE +
            ". Start it with: cd C:\\DecodeX-2026\\backend && " +
            "python -m uvicorn main:app --reload"
        );
    }
}

async function postIncident(incidentId, action, payload) {
    return apiRequest(`/incidents/${encodeURIComponent(incidentId)}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    });
}

/* ---------- Rendering ---------- */

function renderAll() {
    renderSummary();
    renderList();
    renderDetails();
    renderMap();
}

function renderSummary() {
    const active = state.incidents.filter((i) => i.status !== "RESOLVED");
    el.statActive.textContent = active.length;
    el.statCritical.textContent = active.filter((i) => i.severity === "Critical").length;
    el.statDispatched.textContent = active.filter((i) => i.status === "DISPATCHED").length;
    el.statResolved.textContent = state.incidents.filter((i) => i.status === "RESOLVED").length;
}

function visibleIncidents() {
    const filter = el.filterSelect.value;

    const sorted = [...state.incidents].sort((a, b) => {
        const severityRank = { Critical: 0, High: 1, Normal: 2 };
        const s = (severityRank[a.severity] ?? 3) - (severityRank[b.severity] ?? 3);
        if (s !== 0) {
            return s;
        }
        return (b.created_at || 0) - (a.created_at || 0);
    });

    if (filter === "all") {
        return sorted;
    }
    if (filter === "active") {
        return sorted.filter((i) => i.status !== "RESOLVED");
    }
    return sorted.filter((i) => i.status === filter);
}

function renderList() {
    const items = visibleIncidents();

    el.listMeta.textContent = `${items.length} shown · ${state.incidents.length} total`;

    if (items.length === 0) {
        el.incidentList.innerHTML = "";
        showMessage(
            state.incidents.length === 0
                ? "No incidents yet. Send an SOS from the Report Emergency page to see it appear here."
                : "No incidents match the selected filter."
        );
        return;
    }

    el.incidentEmpty.classList.add("hidden");
    el.incidentList.innerHTML = items.map((incident) => `
        <div class="cc-incident${incident.severity === "Critical" ? " is-critical" : ""}${
            incident.incident_id === state.selectedId ? " selected" : ""
        }" data-id="${incident.incident_id}" role="button" tabindex="0">
            <div class="cc-incident-top">
                <span class="cc-incident-id">${incident.incident_id}</span>
                <span class="cc-pill cc-pill-${incident.status}">${incident.status}</span>
            </div>
            <div class="cc-incident-title">
                <span class="cc-incident-type">${iconFor(incident.emergency_type)} ${incident.emergency_type || "Unknown"}</span>
                <span class="cc-sev cc-sev-${incident.severity || "Normal"}">${incident.severity || "Normal"}</span>
            </div>
            <p class="cc-incident-desc">${escapeHtml(incident.description || "No description provided.")}</p>
            <div class="cc-incident-meta">
                <div class="cc-meta-row">
                    <span>📍 Location</span>
                    <span>${formatCoords(incident)}</span>
                </div>
                <div class="cc-meta-row">
                    <span>🕒 Reported</span>
                    <span>${formatTime(incident.created_at)}</span>
                </div>
                <div class="cc-meta-row">
                    <span>👥 Assigned</span>
                    <span>${incident.assigned_team ? escapeHtml(incident.assigned_team) : "Not assigned"}</span>
                </div>
                ${incident.recommended_teams && incident.recommended_teams.length > 0 ? `
                <div class="cc-meta-row">
                    <span>💡 Recommended</span>
                    <span>${incident.recommended_teams.map((t) => escapeHtml(t)).join(" + ")}</span>
                </div>` : ""}
            </div>
            <button type="button" class="cc-locate${incident.assigned_team ? " team-set" : ""}"
                    data-dispatch="${incident.incident_id}">
                ${incident.assigned_team ? "Change Team" : "DISPATCH TEAM"}
            </button>
        </div>
    `).join("");
}

function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = String(text);
    return div.innerHTML;
}

function selectedIncident() {
    return state.incidents.find((i) => i.incident_id === state.selectedId) || null;
}

function renderDetails() {
    const incident = selectedIncident();

    if (!incident) {
        el.detailBody.classList.add("hidden");
        el.detailEmpty.classList.remove("hidden");
        el.detailMeta.textContent = "No incident selected";
        return;
    }

    el.detailEmpty.classList.add("hidden");
    el.detailBody.classList.remove("hidden");
    el.detailMeta.textContent = incident.status;

    el.detailIcon.textContent = iconFor(incident.emergency_type);
    el.detailId.textContent = incident.incident_id;
    el.detailType.textContent = incident.emergency_type || "Unknown";
    el.detailStatus.textContent = incident.status;
    el.detailStatus.className = "cc-pill cc-pill-" + incident.status;
    el.detailSeverity.textContent = incident.severity || "Normal";
    el.detailDescription.textContent = incident.description || "No description provided.";
    el.detailCoords.textContent = formatCoords(incident);
    el.detailTime.textContent = formatTime(incident.created_at);
    el.detailTeam.textContent = incident.assigned_team || "Not assigned";

    renderRecommendation(incident);

    el.dispatchBtn.disabled = incident.status === "RESOLVED";
    el.respondingBtn.disabled = incident.status !== "DISPATCHED";
    el.onSceneBtn.disabled = incident.status !== "RESPONDING";
    el.resolvedBtn.disabled = incident.status !== "ON_SCENE";
    el.teamSelect.disabled = incident.status === "RESOLVED";

    renderProgress(incident.status);
    renderHistory(incident.history || []);
}

function renderRecommendation(incident) {
    const incidentText = incident.incident_text || "";
    el.detailTextRow.classList.toggle("hidden", incidentText === "");
    el.detailIncidentText.textContent = incidentText || "—";

    const teams = incident.recommended_teams || [];

    if (teams.length === 0) {
        el.detailRecommend.classList.add("hidden");
        return;
    }

    el.detailRecommend.classList.remove("hidden");
    el.detailRecommendTeams.innerHTML = teams.map((team) => `
        <span class="cc-team-chip">
            <span class="cc-team-chip-icon">${TEAM_ICONS[team] || "🚨"}</span>
            ${escapeHtml(team)}
            ${team === incident.assigned_team
                ? '<span class="cc-team-chip-assigned">Assigned</span>'
                : ""}
        </span>
    `).join("");

    el.detailRecommendReason.textContent = incident.routing_reason || "";
}

function renderProgress(status) {
    const index = STATUS_ORDER.indexOf(status);
    document.querySelectorAll(".cc-progress-step").forEach((step) => {
        const stepIndex = STATUS_ORDER.indexOf(step.dataset.step);
        step.classList.toggle("done", stepIndex < index);
        step.classList.toggle("current", stepIndex === index);
    });
}

function renderHistory(history) {
    if (history.length === 0) {
        el.detailHistory.innerHTML = "<li><span>No activity yet</span><span>—</span></li>";
        return;
    }

    el.detailHistory.innerHTML = history.map((entry) => `
        <li>
            <span>${entry.status}${entry.team ? " · " + escapeHtml(entry.team) : ""}</span>
            <span>${formatTime(entry.at)}</span>
        </li>
    `).join("");
}

/* ---------- Map ---------- */

function initMap() {
    if (state.map || typeof L === "undefined") {
        return;
    }

    state.map = L.map("map").setView([20.5937, 78.9629], 5);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap contributors"
    }).addTo(state.map);

    el.mapMeta.textContent = "OpenStreetMap · Leaflet CDN";
}

function popupHtml(incident) {
    return `
        <div class="cc-popup-title">${incident.incident_id}</div>
        <div class="cc-popup-row">${iconFor(incident.emergency_type)} ${escapeHtml(incident.emergency_type || "Unknown")}</div>
        <div class="cc-popup-row">Severity: ${escapeHtml(incident.severity || "Normal")}</div>
        <div class="cc-popup-row">Status: ${incident.status}</div>
        <div class="cc-popup-row">Team: ${incident.assigned_team ? escapeHtml(incident.assigned_team) : "Not assigned"}</div>
        <div class="cc-popup-row">GPS: ${formatCoords(incident)}</div>
    `;
}

function renderMap() {
    if (typeof L === "undefined") {
        el.mapMeta.textContent = "Map unavailable (offline or CDN blocked)";
        return;
    }

    initMap();

    const valid = state.incidents.filter(isValidCoords);

    if (valid.length === 0) {
        Object.keys(state.markers).forEach((id) => {
            state.map.removeLayer(state.markers[id].marker);
            delete state.markers[id];
        });
        state.mapPointsKey = "";
        el.mapMeta.textContent = "No incidents with valid GPS coordinates yet";
        return;
    }

    const desired = {};

    valid.forEach((incident) => {
        const coords = coordsOf(incident);
        desired[incident.incident_id] = `${coords.lat},${coords.lng}`;

        let entry = state.markers[incident.incident_id];

        if (entry && (entry.lat !== coords.lat || entry.lng !== coords.lng)) {
            state.map.removeLayer(entry.marker);
            entry = null;
            delete state.markers[incident.incident_id];
        }

        if (!entry) {
            const marker = L.circleMarker([coords.lat, coords.lng], {
                radius: incident.severity === "Critical" ? 12 : 9,
                color: incident.severity === "Critical" ? "#d7263d" : "#0b3d91",
                weight: 2,
                fillColor: incident.severity === "Critical" ? "#d7263d" : "#3b82f6",
                fillOpacity: 0.55
            }).addTo(state.map);

            marker.bindPopup(popupHtml(incident));
            marker.on("click", () => selectIncident(incident.incident_id));

            entry = state.markers[incident.incident_id] = {
                marker,
                lat: coords.lat,
                lng: coords.lng
            };
        }

        const popup = entry.marker.getPopup();
        if (popup) {
            popup.setContent(popupHtml(incident));
        }
    });

    Object.keys(state.markers).forEach((id) => {
        if (!Object.prototype.hasOwnProperty.call(desired, id)) {
            state.map.removeLayer(state.markers[id].marker);
            delete state.markers[id];
        }
    });

    const pointsKey = Object.keys(desired).sort()
        .map((id) => `${id}:${desired[id]}`)
        .join("|");
    const pointsChanged = pointsKey !== state.mapPointsKey;
    state.mapPointsKey = pointsKey;

    el.mapMeta.textContent = `${valid.length} marker${valid.length === 1 ? "" : "s"} · OpenStreetMap · Leaflet CDN`;

    if (pointsChanged) {
        const bounds = valid.map((incident) => {
            const coords = coordsOf(incident);
            return [coords.lat, coords.lng];
        });

        if (bounds.length > 1) {
            state.map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
        } else {
            state.map.setView(bounds[0], Math.max(state.map.getZoom(), 15));
        }
    }

    focusSelectedMarker();
}

function focusSelectedMarker() {
    if (!state.pendingFocus) {
        return;
    }
    state.pendingFocus = false;

    const entry = state.markers[state.selectedId];
    if (!entry || !entry.marker) {
        return;
    }
    const target = entry.marker.getLatLng();
    if (!state.map.getBounds().pad(-0.15).contains(target)) {
        state.map.setView(target, Math.max(state.map.getZoom(), 16));
    }
}

/* ---------- Actions ---------- */

function selectIncident(incidentId) {
    state.selectedId = incidentId;
    state.pendingFocus = true;
    renderList();
    renderDetails();
    renderMap();
}

async function handleDispatch(incidentId) {
    const team = el.teamSelect.value;
    if (!team) {
        return;
    }

    setBusy(true);
    try {
        await postIncident(incidentId, "dispatch", { team });
        state.selectedId = incidentId;
        await loadIncidents();
    } catch (error) {
        console.error(error);
        alert("Dispatch failed: " + error.message);
    } finally {
        setBusy(false);
    }
}

async function handleStatus(status) {
    const incident = selectedIncident();
    if (!incident) {
        return;
    }

    setBusy(true);
    try {
        await postIncident(incident.incident_id, "status", { status });
        await loadIncidents();
    } catch (error) {
        console.error(error);
        alert("Status update failed: " + error.message);
    } finally {
        setBusy(false);
    }
}

function setBusy(busy) {
    el.dispatchBtn.disabled = busy || (selectedIncident() && selectedIncident().status === "RESOLVED");
    el.respondingBtn.disabled = busy || !selectedIncident() || selectedIncident().status !== "DISPATCHED";
    el.onSceneBtn.disabled = busy || !selectedIncident() || selectedIncident().status !== "RESPONDING";
    el.resolvedBtn.disabled = busy || !selectedIncident() || selectedIncident().status !== "ON_SCENE";
}

async function clearAllHistory() {
    if (!window.confirm("Are you sure you want to clear all incident history?")) {
        return;
    }

    el.clearAllBtn.disabled = true;
    try {
        await apiRequest("/incidents", { method: "DELETE" });
        state.selectedId = null;
        state.pendingFocus = false;
        await loadIncidents();
        showMessage("All incident history cleared.");
    } catch (error) {
        console.error(error);
        alert("Clear failed: " + error.message);
    } finally {
        el.clearAllBtn.disabled = false;
    }
}

/* ---------- Events ---------- */

el.incidentList.addEventListener("click", (event) => {
    const dispatchTarget = event.target.closest("[data-dispatch]");
    if (dispatchTarget) {
        event.stopPropagation();
        selectIncident(dispatchTarget.dataset.dispatch);
        handleDispatch(dispatchTarget.dataset.dispatch);
        return;
    }

    const card = event.target.closest(".cc-incident");
    if (card) {
        selectIncident(card.dataset.id);
    }
});

el.incidentList.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") {
        return;
    }
    const card = event.target.closest(".cc-incident");
    if (card) {
        event.preventDefault();
        selectIncident(card.dataset.id);
    }
});

el.filterSelect.addEventListener("change", renderList);
el.clearAllBtn.addEventListener("click", clearAllHistory);
el.dispatchBtn.addEventListener("click", () => handleDispatch(state.selectedId));
el.respondingBtn.addEventListener("click", () => handleStatus("RESPONDING"));
el.onSceneBtn.addEventListener("click", () => handleStatus("ON_SCENE"));
el.resolvedBtn.addEventListener("click", () => handleStatus("RESOLVED"));

/* ---------- Init ---------- */

TEAMS.forEach((team) => {
    const option = document.createElement("option");
    option.value = team;
    option.textContent = team;
    el.teamSelect.appendChild(option);
});

loadIncidents();
setInterval(loadIncidents, POLL_MS);