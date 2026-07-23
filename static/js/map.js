const DEFAULT_MAP_CENTER = [23.8103, 90.4125];
const DEFAULT_MAP_ZOOM = 12;
const NOMINATIM_SEARCH_ENDPOINT =
    "https://nominatim.openstreetmap.org/search";
const BASE_TILE_OPTIONS = {
    maxZoom: 19,
    updateWhenIdle: false,
    updateWhenZooming: true,
    keepBuffer: 4
};

const map = L.map(
    "map",
    {
        zoomControl: true,
        zoomAnimation: true
    }
).setView(
    DEFAULT_MAP_CENTER,
    DEFAULT_MAP_ZOOM
);

const streetMap = L.tileLayer(
    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    {
        ...BASE_TILE_OPTIONS,
        attribution: "&copy; OpenStreetMap contributors"
    }
);

const satelliteMap = L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/" +
    "World_Imagery/MapServer/tile/{z}/{y}/{x}",
    {
        ...BASE_TILE_OPTIONS,
        attribution: "Tiles &copy; Esri"
    }
);

const labelledSatelliteMap = L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/" +
    "World_Imagery/MapServer/tile/{z}/{y}/{x}",
    {
        ...BASE_TILE_OPTIONS,
        attribution: "Tiles &copy; Esri"
    }
);

const placeLabels = L.tileLayer(
    "https://services.arcgisonline.com/ArcGIS/rest/services/" +
    "Reference/World_Boundaries_and_Places/" +
    "MapServer/tile/{z}/{y}/{x}",
    {
        ...BASE_TILE_OPTIONS,
        attribution: "Labels &copy; Esri"
    }
);

const satelliteWithLabels = L.layerGroup([
    labelledSatelliteMap,
    placeLabels
]);

satelliteWithLabels.addTo(map);

const baseMaps = {
    "Street": streetMap,
    "Satellite": satelliteMap,
    "Satellite + Labels": satelliteWithLabels
};

L.control.layers(
    baseMaps,
    {},
    {
        position: "topright",
        collapsed: true
    }
).addTo(map);

L.control.scale({
    position: "bottomleft",
    imperial: false
}).addTo(map);

const mouseCoordinateControl = L.control({
    position: "bottomright"
});

mouseCoordinateControl.onAdd = function () {
    const coordinateDisplay = L.DomUtil.create(
        "div",
        "mouse-coordinate-control"
    );

    coordinateDisplay.textContent = "Lat —  Lng —";

    map.on(
        "mousemove",
        function (event) {
            coordinateDisplay.textContent =
                `Lat ${event.latlng.lat.toFixed(5)}  ` +
                `Lng ${event.latlng.lng.toFixed(5)}`;
        }
    );

    map.on(
        "mouseout",
        function () {
            coordinateDisplay.textContent =
                "Lat —  Lng —";
        }
    );

    return coordinateDisplay;
};

mouseCoordinateControl.addTo(map);


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


let mapResizeTimer = null;
let mapResizeObserver = null;


function refreshMapLayout({
    fitSelectedArea = false
} = {}) {
    if (!map) {
        return;
    }

    requestAnimationFrame(
        function () {
            map.invalidateSize({
                pan: false,
                debounceMoveend: true
            });

            setTimeout(
                function () {
                    map.invalidateSize({
                        pan: false,
                        debounceMoveend: true
                    });

                    if (!fitSelectedArea) {
                        return;
                    }

                    const selectedLayer =
                        drawnItems.getLayers()[0];

                    if (
                        !selectedLayer ||
                        typeof selectedLayer.getBounds !==
                            "function"
                    ) {
                        return;
                    }

                    const bounds =
                        selectedLayer.getBounds();

                    if (bounds && bounds.isValid()) {
                        map.fitBounds(
                            bounds,
                            {
                                padding: [40, 40],
                                maxZoom: 17,
                                animate: true
                            }
                        );
                    }
                },
                250
            );
        }
    );
}


let selectedCoordinates = null;
let statusInterval = null;
let layerPreviewMap = null;
let currentPreviewLayer = null;
let availableLayerPreviews = {};
let localGeoTiffDownloadUrl = null;
let searchMarker = null;
let lastGeocoderRequestTime = 0;

const geocoderCache = new Map();


const exportButton =
    document.getElementById("export-button");

const exportDestinationSelect =
    document.getElementById("exportDestination");

const localDownloadButton =
    document.getElementById("localDownloadButton");

const coordinatesOutput =
    document.getElementById("coordinates");

const selectedAreaState =
    document.getElementById("selected-area-state");

const selectedAreaFields = {
    squareMeters: document.getElementById(
        "selected-area-square-meters"
    ),
    hectares: document.getElementById(
        "selected-area-hectares"
    ),
    squareKilometers: document.getElementById(
        "selected-area-square-kilometers"
    ),
    perimeter: document.getElementById(
        "selected-area-perimeter"
    ),
    vertices: document.getElementById(
        "selected-area-vertices"
    ),
    roiType: document.getElementById(
        "selected-area-type"
    )
};

const locationSearchForm =
    document.getElementById("location-search-form");

const locationSearchInput =
    document.getElementById("location-search-input");

const locationSearchButton =
    document.getElementById("location-search-button");

const locationSearchStatus =
    document.getElementById("location-search-status");

const quickLocationButtons =
    document.querySelectorAll(".location-chip");

const locateMeButton =
    document.getElementById("locate-me-button");

const resetViewButton =
    document.getElementById("reset-view-button");

const fullscreenMapButton =
    document.getElementById("fullscreen-map-button");

const mapFrame =
    document.querySelector(".map-frame");

const cloudPercentageInput =
    document.getElementById("cloud-percentage");

const cloudPercentageValue =
    document.getElementById("cloud-percentage-value");

const statusBox =
    document.getElementById("status-box");

const resultDetails =
    document.getElementById("result-details");

const acquisitionSummarySection =
    document.getElementById(
        "acquisition-summary-section"
    );

const acquisitionSummaryFields = {
    compositePeriod: document.getElementById(
        "summary-composite-period"
    ),
    daysCovered: document.getElementById(
        "summary-days-covered"
    ),
    processingMethod: document.getElementById(
        "summary-processing-method"
    ),
    compositeType: document.getElementById(
        "summary-composite-type"
    ),
    cloudThreshold: document.getElementById(
        "summary-cloud-threshold"
    ),
    sentinel1Count: document.getElementById(
        "summary-sentinel1-count"
    ),
    sentinel2Count: document.getElementById(
        "summary-sentinel2-count"
    ),
    totalImages: document.getElementById(
        "summary-total-images"
    ),
    resolution: document.getElementById(
        "summary-resolution"
    ),
    coordinateSystem: document.getElementById(
        "summary-coordinate-system"
    ),
    outputFormat: document.getElementById(
        "summary-output-format"
    ),
    bandCount: document.getElementById(
        "summary-band-count"
    ),
    exportedBands: document.getElementById(
        "summary-exported-bands"
    )
};

const sentinel1AcquisitionDates =
    document.getElementById(
        "sentinel1-acquisition-dates"
    );

const sentinel2AcquisitionDates =
    document.getElementById(
        "sentinel2-acquisition-dates"
    );

const sentinel1DateCount =
    document.getElementById(
        "summary-sentinel1-date-count"
    );

const sentinel2DateCount =
    document.getElementById(
        "summary-sentinel2-date-count"
    );

const sceneAnalyticsFields = {
    averageCloud: document.getElementById(
        "average-scene-cloud"
    ),
    bestCloud: document.getElementById(
        "best-scene-cloud"
    ),
    worstCloud: document.getElementById(
        "worst-scene-cloud"
    ),
    imagesPassed: document.getElementById(
        "images-passed-filter"
    ),
    imagesRejected: document.getElementById(
        "images-rejected"
    )
};

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


function formatCompactNumber(value, maximumDecimals = 2) {
    const numericValue = Number(value);

    if (!Number.isFinite(numericValue)) {
        return "—";
    }

    return numericValue.toLocaleString(
        undefined,
        {
            maximumFractionDigits: maximumDecimals
        }
    );
}


function resetSelectedAreaMetrics() {
    Object.values(selectedAreaFields).forEach(
        function (field) {
            field.textContent = "—";
        }
    );

    selectedAreaState.textContent = "No ROI";
    selectedAreaState.className =
        "state-badge idle";
}


function updateSelectedAreaMetrics(layer, roiType) {
    const polygonLatLngs = layer.getLatLngs()[0] || [];

    if (polygonLatLngs.length < 3) {
        resetSelectedAreaMetrics();
        return;
    }

    const areaSquareMeters =
        L.GeometryUtil.geodesicArea(polygonLatLngs);

    let perimeterMeters = 0;

    polygonLatLngs.forEach(
        function (latLng, index) {
            const nextLatLng = polygonLatLngs[
                (index + 1) % polygonLatLngs.length
            ];

            perimeterMeters += map.distance(
                latLng,
                nextLatLng
            );
        }
    );

    selectedAreaFields.squareMeters.textContent =
        formatCompactNumber(areaSquareMeters, 0);
    selectedAreaFields.hectares.textContent =
        formatCompactNumber(areaSquareMeters / 10000, 3);
    selectedAreaFields.squareKilometers.textContent =
        formatCompactNumber(areaSquareMeters / 1000000, 4);
    selectedAreaFields.perimeter.textContent =
        formatCompactNumber(perimeterMeters / 1000, 3);
    selectedAreaFields.vertices.textContent =
        String(polygonLatLngs.length);
    selectedAreaFields.roiType.textContent =
        roiType === "rectangle"
            ? "Rectangle"
            : "Polygon";

    selectedAreaState.textContent = "ROI Ready";
    selectedAreaState.className =
        "state-badge ready";
}


function setLocationSearchStatus(message, type = "") {
    locationSearchStatus.textContent = message;
    locationSearchStatus.className =
        `location-search-status ${type}`.trim();
}


function normalizeLocationQuery(query) {
    const normalizedQuery = query.trim();

    if (normalizedQuery.toLowerCase() === "diu") {
        return (
            "Daffodil International University, " +
            "Savar, Bangladesh"
        );
    }

    return normalizedQuery;
}


function showLocationOnMap(result) {
    const latitude = Number(result.lat);
    const longitude = Number(result.lon);

    if (
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude)
    ) {
        throw new Error(
            "The geocoder returned invalid coordinates."
        );
    }

    if (searchMarker) {
        map.removeLayer(searchMarker);
    }

    searchMarker = L.marker(
        [latitude, longitude],
        {
            title: result.display_name || "Search result"
        }
    ).addTo(map);

    const popupContent = document.createElement("span");

    popupContent.textContent =
        result.display_name || "Search result";

    searchMarker.bindPopup(
        popupContent
    ).openPopup();

    map.once(
        "moveend",
        function () {
            refreshMapLayout();
        }
    );

    map.flyTo(
        [latitude, longitude],
        15,
        {
            animate: true,
            duration: 1.2
        }
    );
}


async function searchLocation(query) {
    const normalizedQuery =
        normalizeLocationQuery(query);

    if (!normalizedQuery) {
        setLocationSearchStatus(
            "Enter a location to search.",
            "error"
        );
        return;
    }

    locationSearchButton.disabled = true;
    locationSearchButton.textContent = "Searching...";
    setLocationSearchStatus(
        `Searching for ${normalizedQuery}...`,
        "loading"
    );

    try {
        const cacheKey =
            normalizedQuery.toLowerCase();
        let result = geocoderCache.get(cacheKey);

        if (!result) {
            const elapsedTime =
                Date.now() - lastGeocoderRequestTime;

            if (elapsedTime < 1100) {
                await new Promise(
                    function (resolve) {
                        setTimeout(
                            resolve,
                            1100 - elapsedTime
                        );
                    }
                );
            }

            const searchParameters = new URLSearchParams({
                q: normalizedQuery,
                format: "jsonv2",
                limit: "1",
                addressdetails: "0"
            });

            lastGeocoderRequestTime = Date.now();

            const response = await fetch(
                `${NOMINATIM_SEARCH_ENDPOINT}?` +
                searchParameters.toString(),
                {
                    headers: {
                        "Accept": "application/json"
                    }
                }
            );

            if (!response.ok) {
                throw new Error(
                    "Location search is temporarily unavailable."
                );
            }

            const results = await response.json();

            if (!Array.isArray(results) || !results[0]) {
                throw new Error(
                    "No matching location was found."
                );
            }

            result = results[0];
            geocoderCache.set(cacheKey, result);
        }

        showLocationOnMap(result);
        locationSearchInput.value = normalizedQuery;

        setLocationSearchStatus(
            result.display_name || "Location found.",
            "success"
        );

    } catch (error) {
        console.error("Location search error:", error);

        setLocationSearchStatus(
            error.message,
            "error"
        );

    } finally {
        locationSearchButton.disabled = false;
        locationSearchButton.textContent = "Search";
    }
}


function updateCloudSlider() {
    const value = Number(cloudPercentageInput.value);
    const minimum = Number(cloudPercentageInput.min);
    const maximum = Number(cloudPercentageInput.max);
    const progress = (
        (value - minimum) /
        (maximum - minimum)
    ) * 100;

    cloudPercentageValue.textContent = `${value}%`;
    cloudPercentageInput.style.setProperty(
        "--range-progress",
        `${progress}%`
    );
}


function formatCloudMetric(value) {
    const numericValue = Number(value);

    return Number.isFinite(numericValue)
        ? `${numericValue.toFixed(2)}%`
        : "—";
}


function resetSceneAnalytics() {
    Object.values(sceneAnalyticsFields).forEach(
        function (field) {
            field.textContent = "—";
        }
    );
}


function showSceneAnalytics(data) {
    sceneAnalyticsFields.averageCloud.textContent =
        formatCloudMetric(data.average_scene_cloud);
    sceneAnalyticsFields.bestCloud.textContent =
        formatCloudMetric(data.best_scene_cloud);
    sceneAnalyticsFields.worstCloud.textContent =
        formatCloudMetric(data.worst_scene_cloud);
    sceneAnalyticsFields.imagesPassed.textContent =
        formatCompactNumber(
            data.images_passed_filter ??
            data.sentinel2_image_count ??
            data.s2_image_count,
            0
        );
    sceneAnalyticsFields.imagesRejected.textContent =
        formatCompactNumber(
            data.images_rejected,
            0
        );
}


function renderExportedBandPills(bands) {
    const container =
        acquisitionSummaryFields.exportedBands;

    container.replaceChildren();

    if (!Array.isArray(bands) || bands.length === 0) {
        const emptyState =
            document.createElement("span");

        emptyState.className = "band-empty";
        emptyState.textContent =
            "Process an area to load bands";

        container.appendChild(emptyState);
        return;
    }

    bands.forEach(
        function (band, index) {
            const pill =
                document.createElement("span");

            pill.className =
                `exported-band-pill band-color-${index % 10}`;
            pill.textContent = String(band);

            container.appendChild(pill);
        }
    );
}


function setAcquisitionSummaryValue(element, value) {
    element.textContent = (
        value === null ||
        value === undefined ||
        value === ""
    )
        ? "Not available"
        : String(value);
}


function renderAcquisitionDateBadges(
    container,
    countElement,
    dates
) {
    container.replaceChildren();

    const validDates = Array.isArray(dates)
        ? dates.filter(
            function (date) {
                return (
                    typeof date === "string" &&
                    date.trim()
                );
            }
        )
        : [];

    countElement.textContent =
        `${validDates.length} ` +
        `${validDates.length === 1 ? "image" : "images"}`;

    if (validDates.length === 0) {
        const emptyMessage =
            document.createElement("p");

        emptyMessage.className =
            "acquisition-date-empty";
        emptyMessage.textContent =
            "No acquisition dates available.";

        container.appendChild(emptyMessage);
        return;
    }

    validDates.forEach(
        function (date) {
            const badge =
                document.createElement("span");

            badge.className =
                "acquisition-date-badge";
            badge.textContent = date;

            container.appendChild(badge);
        }
    );
}


function resetAcquisitionSummary() {
    acquisitionSummarySection.hidden = false;

    Object.values(acquisitionSummaryFields).forEach(
        function (field) {
            field.textContent = "—";
        }
    );

    renderExportedBandPills([]);
    renderAcquisitionDateBadges(
        sentinel1AcquisitionDates,
        sentinel1DateCount,
        []
    );
    renderAcquisitionDateBadges(
        sentinel2AcquisitionDates,
        sentinel2DateCount,
        []
    );
    resetSceneAnalytics();
}


function showAcquisitionSummary(data) {
    const cloudThreshold =
        Number(data.cloud_threshold);

    const cloudThresholdText =
        Number.isFinite(cloudThreshold)
            ? `${cloudThreshold.toFixed(2)}%`
            : "Not available";

    const sentinel1Count =
        data.sentinel1_image_count ??
        data.s1_image_count;

    const sentinel2Count =
        data.sentinel2_image_count ??
        data.s2_image_count;

    const exportedBands = Array.isArray(data.bands)
        ? data.bands
        : data.exported_bands;

    setAcquisitionSummaryValue(
        acquisitionSummaryFields.compositePeriod,
        data.acquisition_date
    );
    setAcquisitionSummaryValue(
        acquisitionSummaryFields.daysCovered,
        data.days_covered
    );
    setAcquisitionSummaryValue(
        acquisitionSummaryFields.processingMethod,
        data.processing_method
    );
    setAcquisitionSummaryValue(
        acquisitionSummaryFields.compositeType,
        data.composite_type
    );
    setAcquisitionSummaryValue(
        acquisitionSummaryFields.cloudThreshold,
        cloudThresholdText
    );
    setAcquisitionSummaryValue(
        acquisitionSummaryFields.sentinel1Count,
        sentinel1Count
    );
    setAcquisitionSummaryValue(
        acquisitionSummaryFields.sentinel2Count,
        sentinel2Count
    );
    setAcquisitionSummaryValue(
        acquisitionSummaryFields.totalImages,
        data.total_images_used
    );
    setAcquisitionSummaryValue(
        acquisitionSummaryFields.resolution,
        data.resolution
    );
    setAcquisitionSummaryValue(
        acquisitionSummaryFields.coordinateSystem,
        data.coordinate_system
    );
    setAcquisitionSummaryValue(
        acquisitionSummaryFields.outputFormat,
        data.output_format
    );
    setAcquisitionSummaryValue(
        acquisitionSummaryFields.bandCount,
        data.band_count
    );
    renderExportedBandPills(exportedBands);

    renderAcquisitionDateBadges(
        sentinel1AcquisitionDates,
        sentinel1DateCount,
        data.sentinel1_dates
    );
    renderAcquisitionDateBadges(
        sentinel2AcquisitionDates,
        sentinel2DateCount,
        data.sentinel2_dates
    );

    showSceneAnalytics(data);

    acquisitionSummarySection.hidden = false;
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

        setTimeout(
            refreshMapLayout,
            100
        );
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


function updateSelectedCoordinates(
    layer,
    roiType = layer._roiType || "polygon"
) {
    const geoJson = layer.toGeoJSON();

    layer._roiType = roiType;

    selectedCoordinates =
        geoJson.geometry.coordinates[0];

    coordinatesOutput.textContent =
        JSON.stringify(
            selectedCoordinates,
            null,
            2
        );

    exportButton.disabled = false;

    updateSelectedAreaMetrics(layer, roiType);

    updateStatus(
        "Area selected. Ready to process.",
        "ready"
    );

    resultDetails.innerHTML = "";

    resetAcquisitionSummary();
    resetLayerPreview();
    resetLocalDownloadButton();

    console.log(
        "Selected coordinates:",
        selectedCoordinates
    );

    refreshMapLayout({
        fitSelectedArea: true
    });
}




map.on(
    L.Draw.Event.CREATED,
    function (event) {
        drawnItems.clearLayers();

        const layer = event.layer;

        layer._roiType = event.layerType;

        drawnItems.addLayer(layer);

        updateSelectedCoordinates(
            layer,
            event.layerType
        );
    }
);


map.on(
    L.Draw.Event.EDITED,
    function (event) {
        event.layers.eachLayer(
            function (layer) {
                updateSelectedCoordinates(
                    layer,
                    layer._roiType || "polygon"
                );
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

        resetSelectedAreaMetrics();

        exportButton.disabled = true;

        resultDetails.innerHTML = "";

        resetPreview();

        resetAcquisitionSummary();
        resetLayerPreview();
        resetLocalDownloadButton();

        if (statusInterval) {
            clearInterval(statusInterval);
            statusInterval = null;
        }

        updateStatus(
            "Draw a polygon or rectangle to begin.",
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

    resetAcquisitionSummary();
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

        showAcquisitionSummary(data);

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


locationSearchForm.addEventListener(
    "submit",
    function (event) {
        event.preventDefault();
        searchLocation(locationSearchInput.value);
    }
);


quickLocationButtons.forEach(
    function (button) {
        button.addEventListener(
            "click",
            function () {
                const query =
                    button.dataset.locationQuery || "";

                locationSearchInput.value = query;
                searchLocation(query);
            }
        );
    }
);


locateMeButton.addEventListener(
    "click",
    function () {
        setLocationSearchStatus(
            "Requesting your current location...",
            "loading"
        );

        function handleLocationFound(event) {
            map.off(
                "locationerror",
                handleLocationError
            );

            if (searchMarker) {
                map.removeLayer(searchMarker);
            }

            searchMarker = L.marker(
                event.latlng,
                {
                    title: "Current location"
                }
            ).addTo(map);

            const popupContent =
                document.createElement("span");

            popupContent.textContent =
                "Your current location";

            searchMarker.bindPopup(
                popupContent
            ).openPopup();

            map.once(
                "moveend",
                function () {
                    refreshMapLayout();
                }
            );

            map.flyTo(
                event.latlng,
                16,
                {
                    animate: true,
                    duration: 1.2
                }
            );

            setLocationSearchStatus(
                "Current location found.",
                "success"
            );
        }

        function handleLocationError() {
            map.off(
                "locationfound",
                handleLocationFound
            );

            setLocationSearchStatus(
                "Location access was unavailable or denied.",
                "error"
            );
        }

        map.once(
            "locationfound",
            handleLocationFound
        );
        map.once(
            "locationerror",
            handleLocationError
        );
        map.locate({
            enableHighAccuracy: true,
            timeout: 10000
        });
    }
);


resetViewButton.addEventListener(
    "click",
    function () {
        map.once(
            "moveend",
            function () {
                refreshMapLayout();
            }
        );

        map.flyTo(
            DEFAULT_MAP_CENTER,
            DEFAULT_MAP_ZOOM,
            {
                animate: true,
                duration: 1.2
            }
        );

        setLocationSearchStatus(
            "Map view reset to Dhaka.",
            "success"
        );
    }
);


function isMapFullscreenActive() {
    if (
        document.fullscreenElement ||
        document.webkitFullscreenElement
    ) {
        return true;
    }

    try {
        return (
            mapFrame.matches(":fullscreen") ||
            mapFrame.matches(":-webkit-full-screen")
        );

    } catch (error) {
        return mapFrame.matches(":fullscreen");
    }
}


fullscreenMapButton.addEventListener(
    "click",
    async function () {
        try {
            if (!isMapFullscreenActive()) {
                if (mapFrame.requestFullscreen) {
                    await mapFrame.requestFullscreen();
                } else if (
                    mapFrame.webkitRequestFullscreen
                ) {
                    mapFrame.webkitRequestFullscreen();
                }

            } else {
                if (document.exitFullscreen) {
                    await document.exitFullscreen();
                } else if (
                    document.webkitExitFullscreen
                ) {
                    document.webkitExitFullscreen();
                }
            }

        } catch (error) {
            console.error("Fullscreen error:", error);

            setLocationSearchStatus(
                "Fullscreen mode is not available.",
                "error"
            );
        }
    }
);


function handleFullscreenChange() {
    const fullscreenActive =
        isMapFullscreenActive();

    fullscreenMapButton.textContent =
        fullscreenActive ? "×" : "⛶";
    fullscreenMapButton.setAttribute(
        "aria-label",
        fullscreenActive
            ? "Exit fullscreen map"
            : "Toggle fullscreen map"
    );

    setTimeout(
        refreshMapLayout,
        150
    );
}


document.addEventListener(
    "fullscreenchange",
    handleFullscreenChange
);

document.addEventListener(
    "webkitfullscreenchange",
    handleFullscreenChange
);


cloudPercentageInput.addEventListener(
    "input",
    updateCloudSlider
);


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


window.addEventListener(
    "resize",
    function () {
        clearTimeout(mapResizeTimer);

        mapResizeTimer = setTimeout(
            function () {
                refreshMapLayout();
            },
            150
        );
    }
);


document.addEventListener(
    "DOMContentLoaded",
    function () {
        refreshMapLayout();
    }
);


window.addEventListener(
    "load",
    function () {
        setTimeout(
            refreshMapLayout,
            200
        );
    }
);


document.addEventListener(
    "visibilitychange",
    function () {
        if (!document.hidden) {
            refreshMapLayout();
        }
    }
);


document.addEventListener(
    "toggle",
    function () {
        setTimeout(
            refreshMapLayout,
            300
        );
    },
    true
);


const workspaceLayout =
    document.querySelector(".workspace-layout");

if (workspaceLayout) {
    workspaceLayout.addEventListener(
        "transitionend",
        function () {
            setTimeout(
                refreshMapLayout,
                300
            );
        }
    );
}


if (mapFrame && "ResizeObserver" in window) {
    mapResizeObserver = new ResizeObserver(
        function () {
            refreshMapLayout();
        }
    );

    mapResizeObserver.observe(mapFrame);
}


map.on(
    "baselayerchange",
    function () {
        refreshMapLayout();
    }
);


updateCloudSlider();
resetSelectedAreaMetrics();
resetAcquisitionSummary();

requestAnimationFrame(
    function () {
        refreshMapLayout();
    }
);
