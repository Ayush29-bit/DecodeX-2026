const API_BASE = "http://127.0.0.1:8000/api";
const API_URL = API_BASE + "/analyze";
const HEALTH_URL = API_BASE + "/health";
const HEALTH_POLL_MS = 4000;

const sosButton = document.getElementById("sosButton");
const sendBtn = document.getElementById("sendBtn");
const resetBtn = document.getElementById("resetBtn");
const locationBtn = document.getElementById("locationBtn");
const locationText = document.getElementById("locationText");
const description = document.getElementById("description");
const incidentTextField = document.getElementById("incidentTextField");
const incidentText = document.getElementById("incidentText");
const typeGroup = document.getElementById("typeGroup");
const severityGroup = document.getElementById("severityGroup");
const formCard = document.getElementById("sosForm");
const responseCard = document.getElementById("responseCard");
const errorCard = document.getElementById("errorCard");
const errorMessage = document.getElementById("errorMessage");
const systemStatus = document.getElementById("systemStatus");
const systemStatusText = document.getElementById("systemStatusText");

const errors = {
    type: document.getElementById("typeError"),
    severity: document.getElementById("severityError"),
    description: document.getElementById("descriptionError"),
    location: document.getElementById("locationError"),
    incidentText: document.getElementById("incidentTextError")
};

const state = {
    emergencyType: "",
    severity: "",
    latitude: null,
    longitude: null
};

/* ---------- Backend connection status ---------- */

function setSystemStatus(online) {
    systemStatus.classList.toggle("is-offline", !online);
    systemStatusText.textContent = online ? "System Online" : "Backend Offline";
}

async function checkBackend() {
    try {
        const response = await fetch(HEALTH_URL, { cache: "no-store" });
        if (!response.ok) {
            throw new Error("Health check returned " + response.status);
        }
        setSystemStatus(true);
        return true;
    } catch (error) {
        setSystemStatus(false);
        return false;
    }
}

checkBackend();
setInterval(checkBackend, HEALTH_POLL_MS);

/* ---------- Selection helpers ---------- */

function selectOption(group, button) {
    group.querySelectorAll(".option-card").forEach((card) => {
        const isActive = card === button;
        card.classList.toggle("selected", isActive);
        card.setAttribute("aria-checked", isActive ? "true" : "false");
    });
}

function clearError(key) {
    errors[key].textContent = "";
    errors[key].classList.remove("visible");
}

function showFieldError(key, message) {
    errors[key].textContent = message;
    errors[key].classList.add("visible");
}

typeGroup.querySelectorAll(".option-card").forEach((card) => {
    card.addEventListener("click", () => {
        state.emergencyType = card.dataset.type;
        selectOption(typeGroup, card);
        clearError("type");
        syncIncidentTextField();
    });
});

function syncIncidentTextField() {
    const isOther = state.emergencyType === "Other";
    incidentTextField.classList.toggle("hidden", !isOther);

    if (!isOther) {
        incidentText.classList.remove("invalid");
        clearError("incidentText");
    }
}

incidentText.addEventListener("input", () => {
    if (incidentText.value.trim() !== "") {
        incidentText.classList.remove("invalid");
        clearError("incidentText");
    }
});

severityGroup.querySelectorAll(".option-card").forEach((card) => {
    card.addEventListener("click", () => {
        state.severity = card.dataset.severity;
        selectOption(severityGroup, card);
        clearError("severity");
    });
});

description.addEventListener("input", () => {
    if (description.value.trim() !== "") {
        description.classList.remove("invalid");
        clearError("description");
    }
});

/* ---------- Geolocation ---------- */

function setLocationText(text, stateClass) {
    locationText.textContent = text;
    locationText.classList.remove("ready", "failed");
    if (stateClass) {
        locationText.classList.add(stateClass);
    }
}

locationBtn.addEventListener("click", () => {
    if (!navigator.geolocation) {
        clearError("location");
        showFieldError("location", "This browser does not support location detection.");
        setLocationText("Location unavailable on this device.", "failed");
        return;
    }

    locationBtn.disabled = true;
    clearError("location");
    setLocationText("Detecting your location...");

    navigator.geolocation.getCurrentPosition(
        (position) => {
            state.latitude = Number(position.coords.latitude.toFixed(6));
            state.longitude = Number(position.coords.longitude.toFixed(6));
            setLocationText(
                `Latitude: ${state.latitude}, Longitude: ${state.longitude}`,
                "ready"
            );
            document.querySelector(".location-box").classList.remove("invalid");
            clearError("location");
            locationBtn.disabled = false;
            locationBtn.textContent = "Refresh Location";
        },
        (error) => {
            state.latitude = null;
            state.longitude = null;
            const message =
                error.code === 1
                    ? "Location permission denied. Please allow location access and try again."
                    : "Could not detect your location. Please try again in an open area.";
            showFieldError("location", message);
            setLocationText("Location unavailable.", "failed");
            document.querySelector(".location-box").classList.add("invalid");
            locationBtn.disabled = false;
            locationBtn.textContent = "Detect My Location";
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
});

/* ---------- Validation ---------- */

function validate() {
    let valid = true;

    if (!state.emergencyType) {
        showFieldError("type", "Please select an emergency type.");
        valid = false;
    } else {
        clearError("type");
    }

    if (!state.severity) {
        showFieldError("severity", "Please select a severity level.");
        valid = false;
    } else {
        clearError("severity");
    }

    if (state.emergencyType === "Other" && incidentText.value.trim() === "") {
        incidentText.classList.add("invalid");
        showFieldError("incidentText", "Please specify what happened.");
        valid = false;
    } else if (state.emergencyType === "Other") {
        incidentText.classList.remove("invalid");
        clearError("incidentText");
    }

    if (description.value.trim() === "") {
        description.classList.add("invalid");
        showFieldError("description", "Please describe what is happening.");
        valid = false;
    } else {
        description.classList.remove("invalid");
        clearError("description");
    }

    if (state.latitude === null || state.longitude === null) {
        document.querySelector(".location-box").classList.add("invalid");
        showFieldError("location", "Location is required. Click \"Detect My Location\" first.");
        valid = false;
    } else {
        clearError("location");
    }

    return valid;
}

/* ---------- Submit ---------- */

async function sendEmergency() {
    hide(errorCard);

    if (!validate()) {
        return;
    }

    sendBtn.disabled = true;
    sendBtn.textContent = "SENDING...";

    const payload = {
        emergency_type: state.emergencyType,
        severity: state.severity,
        description: description.value.trim(),
        incident_text: state.emergencyType === "Other" ? incidentText.value.trim() : "",
        latitude: state.latitude,
        longitude: state.longitude
    };

    let failureMessage = null;

    try {
        const response = await fetch(API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            let detail = "";
            try {
                const body = await response.json();
                if (body && body.detail) {
                    detail = " Server detail: " + body.detail + ".";
                }
            } catch (parseError) {
                console.warn("Could not parse error response", parseError);
            }
            failureMessage =
                "The backend responded with an error (HTTP " + response.status + ")." +
                detail + " Your SOS was not sent.";
        } else {
            const data = await response.json().catch(() => ({}));
            setSystemStatus(true);
            showSuccess(payload, data);
        }
    } catch (error) {
        console.error(error);
        setSystemStatus(false);
        failureMessage =
            "Cannot reach the CampusResQ backend at " + API_BASE + ". " +
            "Your SOS was not sent. Start it with: " +
            "cd C:\\DecodeX-2026\\backend && python -m uvicorn main:app --reload";
    } finally {
        sendBtn.disabled = false;
        sendBtn.textContent = "SEND SOS";
    }

    if (failureMessage) {
        formCard.classList.remove("hidden");
        showErrorCard(failureMessage);
    }
}

function showSuccess(payload, data) {
    document.getElementById("responseStatus").textContent =
        data.status || data.result || "Received by Disaster Command Center";
    document.getElementById("responseType").textContent = payload.emergency_type;
    document.getElementById("responseSeverity").textContent = payload.severity;
    document.getElementById("responseLocation").textContent =
        `${payload.latitude}, ${payload.longitude}`;

    const recommendationEl = document.getElementById("responseRecommendation");
    const teams = (data && data.recommended_teams) || [];
    if (teams.length > 0) {
        recommendationEl.textContent = teams.join(" + ");
        recommendationEl.parentElement.classList.remove("hidden");
    } else {
        recommendationEl.parentElement.classList.add("hidden");
    }
    document.getElementById("responseIncident").textContent =
        data.incident_id || data.id || "Assigned on receipt";

    hide(errorCard);
    responseCard.classList.remove("hidden");
    formCard.classList.add("hidden");
    responseCard.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function showErrorCard(message) {
    errorMessage.textContent = message;
    errorCard.classList.remove("hidden");
    errorCard.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function hide(element) {
    element.classList.add("hidden");
}

sendBtn.addEventListener("click", sendEmergency);

sosButton.addEventListener("click", () => {
    responseCard.classList.add("hidden");
    errorCard.classList.add("hidden");
    formCard.classList.remove("hidden");
    formCard.scrollIntoView({ behavior: "smooth", block: "nearest" });
    description.focus();
});

resetBtn.addEventListener("click", () => {
    state.emergencyType = "";
    state.severity = "";
    state.latitude = null;
    state.longitude = null;

    typeGroup.querySelectorAll(".option-card").forEach((card) => {
        card.classList.remove("selected");
        card.setAttribute("aria-checked", "false");
    });
    severityGroup.querySelectorAll(".option-card").forEach((card) => {
        card.classList.remove("selected");
        card.setAttribute("aria-checked", "false");
    });

    description.value = "";
    description.classList.remove("invalid");
    incidentText.value = "";
    incidentText.classList.remove("invalid");
    incidentTextField.classList.add("hidden");
    document.querySelector(".location-box").classList.remove("invalid");
    setLocationText("Location not detected yet.");
    locationBtn.textContent = "Detect My Location";
    Object.keys(errors).forEach(clearError);

    hide(responseCard);
    formCard.classList.remove("hidden");
    formCard.scrollIntoView({ behavior: "smooth", block: "nearest" });
});