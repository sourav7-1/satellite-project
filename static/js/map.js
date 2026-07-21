const map = L.map("map").setView(
    [23.8103, 90.4125],
    12
);

L.tileLayer(
    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap contributors"
    }
).addTo(map);


const drawnItems = new L.FeatureGroup();
map.addLayer(drawnItems);


const drawControl = new L.Control.Draw({
    draw: {
        polygon: {
            allowIntersection: false,
            showArea: true
        },

        rectangle: true,
        polyline: false,
        circle: false,
        circlemarker: false,
        marker: false
    },

    edit: {
        featureGroup: drawnItems,
        remove: true
    }
});


map.addControl(drawControl);


let selectedCoordinates = null;
let statusInterval = null;


const exportButton =
    document.getElementById("export-button");

const coordinatesOutput =
    document.getElementById("coordinates");

const statusBox =
    document.getElementById("status-box");

const resultDetails =
    document.getElementById("result-details");

const previewSection =
    document.getElementById("preview-section");

const sentinelPreview =
    document.getElementById("sentinel-preview");

const previewLoading =
    document.getElementById("preview-loading");

const previewInformation =
    document.getElementById("preview-information");

const openPreviewButton =
    document.getElementById("open-preview-button");


function resetPreview() {
    previewSection.hidden = true;

    sentinelPreview.src = "";

    sentinelPreview.style.display = "none";

    previewLoading.textContent =
        "Loading satellite preview...";

    previewLoading.style.display = "flex";

    previewInformation.textContent =
        "Selected satellite image";

    delete openPreviewButton.dataset.previewUrl;
}


function showSentinelPreview(data) {
    if (!data.preview_url) {
        resetPreview();
        return;
    }

    previewSection.hidden = false;

    sentinelPreview.style.display = "none";

    previewLoading.textContent =
        "Loading satellite preview...";

    previewLoading.style.display = "flex";

    previewInformation.textContent =
        `Captured on ${data.acquisition_date || "unknown date"} · ` +
        `${Number(data.cloud_percentage).toFixed(2)}% cloud`;

    sentinelPreview.onload = function () {
        previewLoading.style.display = "none";
        sentinelPreview.style.display = "block";

        setTimeout(function () {
            map.invalidateSize();
        }, 100);
    };

    sentinelPreview.onerror = function () {
        previewLoading.textContent =
            "Preview image could not be loaded.";

        previewLoading.style.display = "flex";

        sentinelPreview.style.display = "none";
    };

    sentinelPreview.src = data.preview_url;

    openPreviewButton.dataset.previewUrl =
        data.preview_url;
}


function updateSelectedCoordinates(layer) {
    const geoJson = layer.toGeoJSON();

    selectedCoordinates =
        geoJson.geometry.coordinates[0];

    coordinatesOutput.textContent =
        JSON.stringify(
            selectedCoordinates,
            null,
            2
        );

    exportButton.disabled = false;

    updateStatus(
        "Area selected. Ready to export.",
        "ready"
    );

    resultDetails.innerHTML = "";

    console.log(
        "Selected coordinates:",
        selectedCoordinates
    );
}




map.on(
    L.Draw.Event.CREATED,
    function (event) {
        drawnItems.clearLayers();

        const layer = event.layer;

        drawnItems.addLayer(layer);

        updateSelectedCoordinates(layer);
    }
);


map.on(
    L.Draw.Event.EDITED,
    function (event) {
        event.layers.eachLayer(
            function (layer) {
                updateSelectedCoordinates(layer);
            }
        );
    }
);


map.on(
    L.Draw.Event.DELETED,
    function () {
        selectedCoordinates = null;

        coordinatesOutput.textContent =
            "No area selected";

        exportButton.disabled = true;

        resultDetails.innerHTML = "";

        resetPreview();

        if (statusInterval) {
            clearInterval(statusInterval);
            statusInterval = null;
        }

        updateStatus(
            "Draw a polygon to begin.",
            "idle"
        );
    }
);


function updateStatus(message, type) {
    statusBox.textContent = message;

    statusBox.className =
        `status-box ${type}`;
}


async function getJsonResponse(response) {
    const contentType =
        response.headers.get("content-type") || "";

    if (!contentType.includes("application/json")) {
        const responseText = await response.text();

        console.error(
            "Non-JSON server response:",
            responseText
        );

        throw new Error(
            `Server returned invalid response. HTTP ${response.status}`
        );
    }

    return response.json();
}


async function exportSentinelImage() {
    if (!selectedCoordinates) {
        updateStatus(
            "Please select an area first.",
            "error"
        );

        return;
    }


    const startDate =
        document.getElementById("start-date").value;

    const endDate =
        document.getElementById("end-date").value;

    const cloudPercentage =
        document.getElementById(
            "cloud-percentage"
        ).value;

    const imageType =
        document.getElementById(
            "image-type"
        ).value;

    const driveFolder =
        document.getElementById(
            "drive-folder"
        ).value.trim();


    if (!startDate || !endDate) {
        updateStatus(
            "Please select both dates.",
            "error"
        );

        return;
    }


    if (startDate >= endDate) {
        updateStatus(
            "End date must be after start date.",
            "error"
        );

        return;
    }


    if (
        Number(cloudPercentage) < 0 ||
        Number(cloudPercentage) > 100
    ) {
        updateStatus(
            "Cloud percentage must be between 0 and 100.",
            "error"
        );

        return;
    }


    exportButton.disabled = true;

    resultDetails.innerHTML = "";

    resetPreview();

    updateStatus(
        "Searching Sentinel-2 images...",
        "processing"
    );


    try {
        const response = await fetch(
            "/process-area",
            {
                method: "POST",

                headers: {
                    "Content-Type": "application/json"
                },

                body: JSON.stringify({
                    coordinates: selectedCoordinates,
                    start_date: startDate,
                    end_date: endDate,
                    cloud_percentage: cloudPercentage,
                    image_type: imageType,
                    drive_folder:
                        driveFolder || "Sentinel_Images"
                })
            }
        );


        const data = await getJsonResponse(response);


        if (!response.ok || !data.success) {
            throw new Error(
                data.message ||
                data.error ||
                "Processing failed."
            );
        }


        updateStatus(
            `Export task started: ${data.status || "READY"}`,
            "processing"
        );


        showResultDetails(data);

        showSentinelPreview(data);

        if (data.task_id) {
            startTaskMonitoring(data.task_id);
        } else {
            throw new Error(
                "Task ID was not returned by the server."
            );
        }

    } catch (error) {
        console.error(
            "Export error:",
            error
        );

        updateStatus(
            error.message,
            "error"
        );

        exportButton.disabled = false;
    }
}


function showResultDetails(data) {
    const cloudValue =
        Number(data.cloud_percentage);

    const cloudText =
        Number.isFinite(cloudValue)
            ? `${cloudValue.toFixed(4)}%`
            : "Not available";

    const exportedBands =
        Array.isArray(data.exported_bands)
            ? data.exported_bands.join(", ")
            : "Not available";

    const exportType =
        data.export_type ?? "Not available";

    const bandCount =
        data.band_count ?? "Not available";

    resultDetails.innerHTML = `
        <div class="result-row">
            <span>Images found</span>
            <strong>${data.image_count ?? 0}</strong>
        </div>

        <div class="result-row">
            <span>Selected product</span>
            <strong>${data.product_id || "Not available"}</strong>
        </div>

        <div class="result-row">
            <span>Cloud percentage</span>
            <strong>${cloudText}</strong>
        </div>

        <div class="result-row">
            <span>Export type</span>
            <strong>${exportType}</strong>
        </div>

        <div class="result-row">
            <span>Band count</span>
            <strong>${bandCount}</strong>
        </div>

        <div class="result-row">
            <span>Exported bands</span>
            <strong>${exportedBands}</strong>
        </div>

        <div class="result-row">
            <span>Drive folder</span>
            <strong>
                ${data.drive_folder || "Sentinel_Images"}
            </strong>
        </div>

        <div class="result-row">
            <span>File name</span>
            <strong>${data.file_name || "Not available"}</strong>
        </div>
    `;
}


function startTaskMonitoring(taskId) {
    if (statusInterval) {
        clearInterval(statusInterval);
    }


    statusInterval = setInterval(
        async function () {
            try {
                const response = await fetch(
                    `/task-status/${encodeURIComponent(taskId)}`
                );

                const data =
                    await getJsonResponse(response);


                if (!response.ok || !data.success) {
                    throw new Error(
                        data.message ||
                        data.error ||
                        "Unable to read task status."
                    );
                }


                const state = data.status;

                console.log(
                    "Export task status:",
                    state
                );


                if (state === "READY") {
                    updateStatus(
                        "Export task is waiting...",
                        "processing"
                    );

                } else if (state === "RUNNING") {
                    updateStatus(
                        "Exporting image to Google Drive...",
                        "processing"
                    );

                } else if (state === "COMPLETED") {
                    clearInterval(statusInterval);
                    statusInterval = null;

                    updateStatus(
                        "Export completed successfully!",
                        "success"
                    );

                    exportButton.disabled = false;

                } else if (
                    state === "FAILED" ||
                    state === "CANCELLED"
                ) {
                    clearInterval(statusInterval);
                    statusInterval = null;

                    updateStatus(
                        data.error ||
                        `Export ${state.toLowerCase()}.`,
                        "error"
                    );

                    exportButton.disabled = false;

                } else {
                    updateStatus(
                        `Current task status: ${state}`,
                        "processing"
                    );
                }

            } catch (error) {
                clearInterval(statusInterval);
                statusInterval = null;

                console.error(
                    "Task monitoring error:",
                    error
                );

                updateStatus(
                    error.message,
                    "error"
                );

                exportButton.disabled = false;
            }
        },
        5000
    );
}


exportButton.addEventListener(
    "click",
    exportSentinelImage
);


openPreviewButton.addEventListener(
    "click",
    function () {
        const previewUrl =
            openPreviewButton.dataset.previewUrl;

        if (previewUrl) {
            window.open(
                previewUrl,
                "_blank",
                "noopener,noreferrer"
            );
        }
    }
);
