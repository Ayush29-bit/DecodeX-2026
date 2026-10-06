const API_URL = "http://127.0.0.1:8000/api/analyze";

const sosButton = document.getElementById("sosButton");
const sendBtn = document.getElementById("sendBtn");
const resetBtn = document.getElementById("resetBtn");
const locationBtn = document.getElementById("locationBtn");
const locationText = document.getElementById("locationText");
const description = document.getElementById("description");
const typeGroup = document.getElementById("typeGroup");
const severityGroup = document.getElementById("severityGroup");
const formCard = document.getElementById("sosForm");
const responseCard = document.getElementById("responseCard");
const errorCard = document.getElementById("errorCard");
const errorMessage = document.getElementById("errorMessage");

const errors = {
    type: document.getElementById("typeError"),
    severity: document.getElementById("severityError"),
    description: document.getElementById("descriptionError"),
    location: document.getElementById("locationError")
};

const state = {
    emergencyType: "",
    severity: "",
    latitude: null,
    longitude: null
};

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

function showError(key, message) {
    errors[key].textContent = message;
    errors[key].classList.add("visible");
}

typeGroup.querySelectorAll(".option-card").forEach((card) => {
    card.addEventListener("click", () => {
        state.emergencyType = card.dataset.type;
        selectOption(typeGroup, card);
        clearError("type");
    });
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
        showError("location", "This browser does not support location detection.");
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
            showError("location", message);
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
        showError("type", "Please select an emergency type.");
        valid = false;
    } else {
        clearError("type");
    }

    if (!state.severity) {
        showError("severity", "Please select a severity level.");
        valid = false;
    } else {
        clearError("severity");
    }

    if (description.value.trim() === "") {
        description.classList.add("invalid");
        showError("description", "Please describe what is happening.");
        valid = false;
    } else {
        description.classList.remove("invalid");
        clearError("description");
    }

    if (state.latitude === null || state.longitude === null) {
        document.querySelector(".location-box").classList.add("invalid");
        showError("location", "Location is required. Click \"Detect My Location\" first.");
        valid = false;
    } else {
        clearError("location");
    }

    return valid;
}

/* ---------- Submit ---------- */

async function sendEmergency() {
    if (!validate()) {
        return;
    }

    sendBtn.disabled = true;
    sendBtn.textContent = "SENDING...";
    hide(errorCard);

    const payload = {
        emergency_type: state.emergencyType,
        severity: state.severity,
        description: description.value.trim(),
        latitude: state.latitude,
        longitude: state.longitude
    };

    try {
        const response = await fetch(API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error("Server responded with status " + response.status);
        }

        const data = await response.json();
        showSuccess(payload, data);

    } catch (error) {
        console.error(error);
        formCard.classList.remove("hidden");
        showError("Could not reach the emergency command center. Please check your connection and try again.");
    } finally {
        sendBtn.disabled = false;
        sendBtn.textContent = "SEND SOS";
    }
}

function showSuccess(payload, data) {
    document.getElementById("responseStatus").textContent =
        data.status || data.result || "Received by command center";
    document.getElementById("responseType").textContent = payload.emergency_type;
    document.getElementById("responseSeverity").textContent = payload.severity;
    document.getElementById("responseLocation").textContent =
        `${payload.latitude}, ${payload.longitude}`;
    document.getElementById("responseIncident").textContent =
        data.incident_id || data.id || "Assigned on receipt";

    hide(errorCard);
    responseCard.classList.remove("hidden");
    formCard.classList.add("hidden");
    responseCard.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function showError(message) {
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
    document.querySelector(".location-box").classList.remove("invalid");
    setLocationText("Location not detected yet.");
    locationBtn.textContent = "Detect My Location";
    Object.keys(errors).forEach(clearError);

    hide(responseCard);
    formCard.classList.remove("hidden");
    formCard.scrollIntoView({ behavior: "smooth", block: "nearest" });
});