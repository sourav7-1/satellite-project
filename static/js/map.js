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


    exportButton.disabled = true;

    resultDetails.innerHTML = "";

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


        const data = await response.json();


        if (!response.ok || !data.success) {
            throw new Error(
                data.message ||
                "Processing failed."
            );
        }


        updateStatus(
            `Export task started: ${data.status}`,
            "processing"
        );


        showResultDetails(data);

        startTaskMonitoring(data.task_id);

    } catch (error) {
        console.error(error);

        updateStatus(
            error.message,
            "error"
        );

        exportButton.disabled = false;
    }
}


function showResultDetails(data) {
    resultDetails.innerHTML = `
        <div class="result-row">
            <span>Images found</span>
            <strong>${data.image_count}</strong>
        </div>

        <div class="result-row">
            <span>Selected product</span>
            <strong>${data.product_id}</strong>
        </div>

        <div class="result-row">
            <span>Cloud percentage</span>
            <strong>
                ${Number(data.cloud_percentage).toFixed(4)}%
            </strong>
        </div>

        <div class="result-row">
            <span>Drive folder</span>
            <strong>${data.drive_folder}</strong>
        </div>

        <div class="result-row">
            <span>File name</span>
            <strong>${data.file_name}</strong>
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
                    `/task-status/${taskId}`
                );

                const data = await response.json();


                if (!response.ok || !data.success) {
                    throw new Error(
                        data.message ||
                        "Unable to read task status."
                    );
                }


                const state = data.status;


                if (state === "READY") {
                    updateStatus(
                        "Export task is waiting...",
                        "processing"
                    );
                }


                if (state === "RUNNING") {
                    updateStatus(
                        "Exporting image to Google Drive...",
                        "processing"
                    );
                }


                if (state === "COMPLETED") {
                    clearInterval(statusInterval);

                    updateStatus(
                        "Export completed successfully!",
                        "success"
                    );

                    exportButton.disabled = false;
                }


                if (
                    state === "FAILED" ||
                    state === "CANCELLED"
                ) {
                    clearInterval(statusInterval);

                    updateStatus(
                        data.error ||
                        `Export ${state.toLowerCase()}.`,
                        "error"
                    );

                    exportButton.disabled = false;
                }

            } catch (error) {
                clearInterval(statusInterval);

                console.error(error);

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