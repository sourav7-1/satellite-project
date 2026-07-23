const map = L.map("map").setView(
    [23.8103, 90.4125],
    12
);

const streetMap = L.tileLayer(
    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    {
        maxZoom: 20,
        attribution: "&copy; OpenStreetMap contributors"
    }
);

const satelliteMap = L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/" +
    "World_Imagery/MapServer/tile/{z}/{y}/{x}",
    {
        maxZoom: 20,
        attribution: "Tiles &copy; Esri"
    }
);

const placeLabels = L.tileLayer(
    "https://services.arcgisonline.com/ArcGIS/rest/services/" +
    "Reference/World_Boundaries_and_Places/" +
    "MapServer/tile/{z}/{y}/{x}",
    {
        maxZoom: 20,
        attribution: "Labels &copy; Esri"
    }
);

satelliteMap.addTo(map);
placeLabels.addTo(map);

const baseMaps = {
    "Satellite": satelliteMap,
    "Street Map": streetMap
};

const overlayMaps = {
    "Place Labels": placeLabels
};

L.control.layers(
    baseMaps,
    overlayMaps,
    {
        position: "topright",
        collapsed: false
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
let layerPreviewMap = null;
let currentPreviewLayer = null;
let availableLayerPreviews = {};
let localGeoTiffDownloadUrl = null;


const exportButton =
    document.getElementById("export-button");

const exportDestinationSelect =
    document.getElementById("exportDestination");

const localDownloadButton =
    document.getElementById("localDownloadButton");

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

const layerPreviewSection =
    document.getElementById("layer-preview-section");

const layerSelector =
    document.getElementById("layerSelector");

const selectedLayerType =
    document.getElementById("selectedLayerType");

const selectedLayerName =
    document.getElementById("selectedLayerName");

const selectedLayerDescription =
    document.getElementById("selectedLayerDescription");


function resetLocalDownloadButton() {
    const button = document.getElementById(
        "localDownloadButton"
    );

    localGeoTiffDownloadUrl = null;

    if (button) {
        button.hidden = true;
        button.disabled = true;
    }
}


function triggerLocalGeoTiffDownload() {
    if (!localGeoTiffDownloadUrl) {
        return;
    }

    const temporaryLink = document.createElement("a");

    temporaryLink.href = localGeoTiffDownloadUrl;
    temporaryLink.target = "_blank";
    temporaryLink.rel = "noopener noreferrer";

    document.body.appendChild(temporaryLink);
    temporaryLink.click();
    temporaryLink.remove();
}


function escapeHtml(value) {
    const temporaryElement =
        document.createElement("div");

    temporaryElement.textContent = String(value);

    return temporaryElement.innerHTML;
}


function initializeLayerPreviewMap() {
    if (layerPreviewMap) {
        return;
    }

    layerPreviewMap = L.map(
        "layerPreviewMap",
        {
            zoomControl: true
        }
    ).setView(
        [23.8103, 90.4125],
        12
    );

    L.tileLayer(
        "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        {
            maxZoom: 19,
            attribution: "&copy; OpenStreetMap contributors"
        }
    ).addTo(layerPreviewMap);
}


function populateLayerSelector() {
    layerSelector.replaceChildren();

    const previewEntries = Object.entries(
        availableLayerPreviews
    );

    if (previewEntries.length === 0) {
        const emptyOption = document.createElement("option");

        emptyOption.value = "";
        emptyOption.textContent = "No preview layers available";

        layerSelector.appendChild(emptyOption);
        layerSelector.disabled = true;
        return;
    }

    previewEntries.forEach(
        function ([layerKey, layerData]) {
            const option = document.createElement("option");

            option.value = layerKey;
            option.textContent = layerData.name || layerKey;

            layerSelector.appendChild(option);
        }
    );

    layerSelector.disabled = false;
}


function getLayerDescription(layerKey) {
    const descriptions = {
        RGB: (
            "Natural-color Sentinel-2 composite using " +
            "B4, B3 and B2."
        ),
        B4: "Sentinel-2 red band.",
        B3: "Sentinel-2 green band.",
        B2: "Sentinel-2 blue band.",
        NDVI: "Normalized Difference Vegetation Index.",
        EVI: "Enhanced Vegetation Index.",
        NBR: "Normalized Burn Ratio.",
        VV: "Sentinel-1 VV radar backscatter.",
        VH: "Sentinel-1 VH radar backscatter.",
        VV_VH_ratio: (
            "Feature calculated from VV divided by VH."
        ),
        VV_minus_VH: (
            "Feature calculated from VV minus VH."
        )
    };

    return descriptions[layerKey] ||
        "Earth Engine preview of the selected layer.";
}


function updateLayerInformation(layerKey) {
    const layerData = availableLayerPreviews[layerKey];

    if (!layerData) {
        selectedLayerType.textContent = "No layer selected";
        selectedLayerName.textContent =
            "Layer preview unavailable";
        selectedLayerDescription.textContent =
            "Select an available layer to view its description.";
        return;
    }

    selectedLayerType.textContent =
        layerData.type || "layer";
    selectedLayerName.textContent =
        layerData.name || layerKey;
    selectedLayerDescription.textContent =
        getLayerDescription(layerKey);
}


function showPreviewLayer(layerKey) {
    const layerData = availableLayerPreviews[layerKey];

    if (
        !layerData ||
        typeof layerData.tile_url !== "string" ||
        !layerData.tile_url
    ) {
        updateLayerInformation("");
        return;
    }

    initializeLayerPreviewMap();

    if (currentPreviewLayer) {
        layerPreviewMap.removeLayer(currentPreviewLayer);
        currentPreviewLayer = null;
    }

    currentPreviewLayer = L.tileLayer(
        layerData.tile_url,
        {
            maxZoom: 20,
            attribution: "Google Earth Engine"
        }
    );

    currentPreviewLayer.on(
        "tileerror",
        function () {
            if (layerSelector.value === layerKey) {
                selectedLayerDescription.textContent =
                    "This Earth Engine layer could not be loaded. " +
                    "Try processing the area again to refresh its tiles.";
            }
        }
    );

    currentPreviewLayer.addTo(layerPreviewMap);

    layerSelector.value = layerKey;
    updateLayerInformation(layerKey);
}


function resetLayerPreview() {
    availableLayerPreviews = {};

    if (currentPreviewLayer && layerPreviewMap) {
        layerPreviewMap.removeLayer(currentPreviewLayer);
        currentPreviewLayer = null;
    }

    const placeholderOption = document.createElement("option");

    placeholderOption.value = "";
    placeholderOption.textContent =
        "Process an area to load layers";

    layerSelector.replaceChildren(placeholderOption);
    layerSelector.disabled = true;

    selectedLayerType.textContent = "No layer selected";
    selectedLayerName.textContent = "Layer preview unavailable";
    selectedLayerDescription.textContent =
        "Complete processing to inspect the available image layers.";

    layerPreviewSection.hidden = true;
}


function loadLayerPreviews(layerPreviews) {
    if (
        !layerPreviews ||
        typeof layerPreviews !== "object" ||
        Array.isArray(layerPreviews)
    ) {
        resetLayerPreview();
        return;
    }

    availableLayerPreviews = Object.fromEntries(
        Object.entries(layerPreviews).filter(
            function ([, layerData]) {
                return (
                    layerData &&
                    typeof layerData.tile_url === "string" &&
                    layerData.tile_url
                );
            }
        )
    );

    if (Object.keys(availableLayerPreviews).length === 0) {
        resetLayerPreview();
        return;
    }

    layerPreviewSection.hidden = false;

    initializeLayerPreviewMap();
    populateLayerSelector();

    const defaultLayer = availableLayerPreviews.RGB
        ? "RGB"
        : Object.keys(availableLayerPreviews)[0];

    showPreviewLayer(defaultLayer);

    const polygonLatLngs = (
        Array.isArray(selectedCoordinates)
            ? selectedCoordinates.map(
                function ([longitude, latitude]) {
                    return [latitude, longitude];
                }
            )
            : []
    );

    const previewBounds = L.latLngBounds(polygonLatLngs);

    setTimeout(
        function () {
            layerPreviewMap.invalidateSize();

            if (previewBounds.isValid()) {
                layerPreviewMap.fitBounds(
                    previewBounds,
                    {
                        padding: [24, 24]
                    }
                );
            }
        },
        100
    );
}


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

    resetLayerPreview();
    resetLocalDownloadButton();

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

        resetLayerPreview();
        resetLocalDownloadButton();

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

    const exportDestination =
        exportDestinationSelect.value;


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


    if (statusInterval) {
        clearInterval(statusInterval);
        statusInterval = null;
    }

    exportButton.disabled = true;

    resultDetails.innerHTML = "";

    resetPreview();

    resetLayerPreview();
    resetLocalDownloadButton();

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
                    export_destination: exportDestination,
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


        const responseDestination =
            data.export_destination || exportDestination;

        if (data.download_url) {
            localGeoTiffDownloadUrl = data.download_url;

            localDownloadButton.hidden = false;
            localDownloadButton.disabled = false;

            if (responseDestination === "local") {
                setTimeout(
                    triggerLocalGeoTiffDownload,
                    500
                );
            }

        } else {
            resetLocalDownloadButton();
        }


        showResultDetails(data);

        showSentinelPreview(data);

        loadLayerPreviews(data.layer_previews);

        if (data.task_id) {
            updateStatus(
                `Export task started: ${data.status || "READY"}`,
                "processing"
            );

            startTaskMonitoring(data.task_id);

        } else if (responseDestination === "local") {
            updateStatus(
                data.message ||
                "Local GeoTIFF download is ready.",
                "success"
            );

            exportButton.disabled = false;

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

    const destinationLabels = {
        drive: "Google Drive",
        local: "Local Computer",
        both: "Google Drive + Local Computer"
    };

    const exportDestination =
        destinationLabels[data.export_destination] ||
        "Not available";

    const driveFolder =
        data.drive_folder ?? "Not applicable";

    const localDownloadErrorRow =
        data.local_download_error
            ? `
                <div class="result-row local-download-error">
                    <span>Local download</span>
                    <strong>
                        ${escapeHtml(data.local_download_error)}
                    </strong>
                </div>
            `
            : "";

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
            <span>Destination</span>
            <strong>${exportDestination}</strong>
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
                ${driveFolder}
            </strong>
        </div>

        <div class="result-row">
            <span>File name</span>
            <strong>${data.file_name || "Not available"}</strong>
        </div>

        ${localDownloadErrorRow}
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


layerSelector.addEventListener(
    "change",
    function () {
        showPreviewLayer(layerSelector.value);
    }
);


localDownloadButton?.addEventListener(
    "click",
    triggerLocalGeoTiffDownload
);


exportDestinationSelect.addEventListener(
    "change",
    resetLocalDownloadButton
);
