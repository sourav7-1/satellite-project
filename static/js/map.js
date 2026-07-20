const map = L.map("map").setView([23.8103, 90.4125], 12);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors"
}).addTo(map);

const drawnItems = new L.FeatureGroup();
map.addLayer(drawnItems);

const drawControl = new L.Control.Draw({
    draw: {
        polygon: true,
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


// Backend-এ coordinates পাঠানোর function
function sendCoordinatesToBackend(coordinates) {
    fetch("/process-area", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            coordinates: coordinates
        })
    })
    .then(response => {
        if (!response.ok) {
            throw new Error("Backend response was not successful");
        }

        return response.json();
    })
    .then(data => {
        console.log("Backend response:", data);
        alert(data.message);
    })
    .catch(error => {
        console.error("Error:", error);
        alert("Coordinates পাঠানো যায়নি");
    });
}


// নতুন polygon বা rectangle draw করলে
map.on(L.Draw.Event.CREATED, function (event) {
    drawnItems.clearLayers();

    const layer = event.layer;
    drawnItems.addLayer(layer);

    const geoJson = layer.toGeoJSON();
    const coordinates = geoJson.geometry.coordinates[0];

    document.getElementById("coordinates").textContent =
        JSON.stringify(coordinates, null, 2);

    console.log("Selected coordinates:", coordinates);

    sendCoordinatesToBackend(coordinates);
});


// Polygon edit করলে
map.on(L.Draw.Event.EDITED, function (event) {
    event.layers.eachLayer(function (layer) {
        const geoJson = layer.toGeoJSON();
        const coordinates = geoJson.geometry.coordinates[0];

        document.getElementById("coordinates").textContent =
            JSON.stringify(coordinates, null, 2);

        console.log("Updated coordinates:", coordinates);

        sendCoordinatesToBackend(coordinates);
    });
});


// Polygon delete করলে
map.on(L.Draw.Event.DELETED, function () {
    document.getElementById("coordinates").textContent =
        "No area selected";

    console.log("Selected area deleted");
});