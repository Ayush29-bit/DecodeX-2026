const API_BASE = "http://127.0.0.1:8000/api";
const POLL_MS = 2500;
const STATUS_ORDER = ["REPORTED", "DISPATCHED", "RESPONDING", "RESOLVED"];
const TEAMS = ["Security Team", "Medical Team", "Fire Response Team"];
const TYPE_ICONS = {
    Fire: "🔥",
    Medical: "🏥",
    Earthquake: "🌎",
    Other: "⚠️"
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
    detailDescription: document.getElementById("detailDescription"),
    detailCoords: document.getElementById("detailCoords"),
    detailTime: document.getElementById("detailTime"),
    detailTeam: document.getElementById("detailTeam"),
    teamSelect: document.getElementById("teamSelect"),
    dispatchBtn: document.getElementById("dispatchBtn"),
    respondingBtn: document.getElementById("respondingBtn"),
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
    mapSignature: ""
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

function formatCoords(incident) {
    if (incident.latitude === null || incident.longitude === null ||
        incident.latitude === undefined || incident.longitude === undefined) {
        return "Not available";
    }
    return `${Number(incident.latitude).toFixed(6)}, ${Number(incident.longitude).toFixed(6)}`;
}

function isValidCoords(incident) {
    return typeof incident.latitude === "number" &&
        typeof incident.longitude === "number" &&
        !Number.isNaN(incident.latitude) &&
        !Number.isNaN(incident.longitude);
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
            "Cannot reach the backend at " + API_BASE +
            ". Start it with: python -m uvicorn main:app --port 8000"
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

    el.dispatchBtn.disabled = incident.status === "RESOLVED";
    el.respondingBtn.disabled = incident.status !== "DISPATCHED";
    el.resolvedBtn.disabled = incident.status !== "RESPONDING";
    el.teamSelect.disabled = incident.status === "RESOLVED";

    renderProgress(incident.status);
    renderHistory(incident.history || []);
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

function mapSignature() {
    return state.incidents
        .filter(isValidCoords)
        .map((i) => `${i.incident_id}:${i.status}:${i.severity}:${i.latitude},${i.longitude}`)
        .sort()
        .join("|");
}

function renderMap(force) {
    if (typeof L === "undefined") {
        el.mapMeta.textContent = "Map unavailable (offline or CDN blocked)";
        return;
    }

    initMap();

    const signature = mapSignature();
    if (!force && signature === state.mapSignature) {
        focusSelectedMarker();
        return;
    }
    state.mapSignature = signature;

    const valid = state.incidents.filter(isValidCoords);
    Object.keys(state.markers).forEach((id) => {
        state.map.removeLayer(state.markers[id]);
        delete state.markers[id];
    });

    if (valid.length === 0) {
        el.mapMeta.textContent = "No incidents with valid GPS coordinates yet";
        return;
    }

    const bounds = [];

    valid.forEach((incident) => {
        const isCritical = incident.severity === "Critical";
        const marker = L.circleMarker([incident.latitude, incident.longitude], {
            radius: isCritical ? 12 : 9,
            color: isCritical ? "#d7263d" : "#0b3d91",
            weight: 2,
            fillColor: isCritical ? "#d7263d" : "#3b82f6",
            fillOpacity: 0.55
        }).addTo(state.map);

        marker.bindPopup(`
            <div class="cc-popup-title">${incident.incident_id}</div>
            <div class="cc-popup-row">${iconFor(incident.emergency_type)} ${escapeHtml(incident.emergency_type || "Unknown")}</div>
            <div class="cc-popup-row">Severity: ${escapeHtml(incident.severity || "Normal")}</div>
            <div class="cc-popup-row">Status: ${incident.status}</div>
            <div class="cc-popup-row">Team: ${incident.assigned_team ? escapeHtml(incident.assigned_team) : "Not assigned"}</div>
        `);

        marker.on("click", () => selectIncident(incident.incident_id, false));

        state.markers[incident.incident_id] = marker;
        bounds.push([incident.latitude, incident.longitude]);
    });

    el.mapMeta.textContent = `${valid.length} marker${valid.length === 1 ? "" : "s"} · OpenStreetMap · Leaflet CDN`;

    if (bounds.length > 1) {
        state.map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
    }

    focusSelectedMarker();
}

function focusSelectedMarker() {
    const marker = state.markers[state.selectedId];
    if (!marker) {
        return;
    }
    const target = marker.getLatLng();
    if (!state.map.getBounds().pad(-0.15).contains(target)) {
        state.map.setView(target, Math.max(state.map.getZoom(), 16));
    }
}

/* ---------- Actions ---------- */

function selectIncident(incidentId, focusMap) {
    state.selectedId = incidentId;
    renderList();
    renderDetails();
    renderMap(focusMap === true);
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
    el.resolvedBtn.disabled = busy || !selectedIncident() || selectedIncident().status !== "RESPONDING";
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
el.dispatchBtn.addEventListener("click", () => handleDispatch(state.selectedId));
el.respondingBtn.addEventListener("click", () => handleStatus("RESPONDING"));
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