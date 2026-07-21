# Map and Sentinel Automation

A Flask web application for selecting an area on an interactive map, finding suitable Sentinel-2 imagery with Google Earth Engine, and exporting RGB GeoTIFF files to Google Drive.

## Current configuration

| Setting | Value |
|---|---|
| Google Cloud project | `optical-metric-497209-p0` |
| Earth Engine registration | Noncommercial Community Tier |
| Image collection | `COPERNICUS/S2_SR_HARMONIZED` |
| Output format | GeoTIFF |
| Export resolution | 10 metres |
| Default Drive folder | `Sentinel_Images` |

The previous project, `map-sentinel-automation`, could not be used because the authenticated account did not have `serviceusage.services.use`. The application now uses the registered and verified project `optical-metric-497209-p0`.

## Features

- Interactive OpenStreetMap map powered by Leaflet and Leaflet Draw
- Polygon and rectangle selection
- Custom start and end dates, with the end date included in the search
- Configurable maximum cloud percentage from 0 to 100
- RGB export using Sentinel-2 bands `B4`, `B3`, and `B2`
- Automatic selection of the image with the lowest cloud percentage
- Google Drive GeoTIFF export to the configured `Sentinel_Images` folder
- Export status polling every five seconds
- Task-status recovery through the Earth Engine API after a Flask restart
- Input validation and JSON error responses

## Project structure

```text
.
|-- app.py
|-- requirements.txt
|-- services/
|   |-- __init__.py
|   `-- earth_engine_service.py
|-- static/
|   |-- css/
|   |   `-- style.css
|   `-- js/
|       `-- map.js
`-- templates/
    `-- index.html
```

The files `services/export_service.py` and `services/image_processor.py` currently exist as placeholders and are not imported by the application.

## Requirements

- Python 3.11 or a compatible version
- A Google account with Earth Engine access
- Access to the configured Google Cloud project
- Permission to export files to Google Drive

Install the Python dependencies:

```powershell
python -m pip install -r requirements.txt
```

The current `requirements.txt` contains:

```text
Flask
earthengine-api
```

## Earth Engine authentication

Authenticate once before starting the Flask application:

```powershell
earthengine authenticate --force --auth_mode=localhost
```

Choose the Google account that has access to `optical-metric-497209-p0` and approve the requested Earth Engine and Google Drive permissions.

Earth Engine normally stores the local credential at:

```text
%USERPROFILE%\.config\earthengine\credentials
```

The application calls `ee.Initialize()` but does not launch an interactive authentication flow. This keeps browser authentication out of the Flask startup process.

## Run the application

From the project directory:

```powershell
python app.py
```

Open the application at:

```text
http://127.0.0.1:5000
```

The development server runs with Flask debug mode enabled and the automatic reloader disabled.

## Using the web interface

1. Draw a polygon or rectangle on the map.
2. Select a start date and an end date.
3. Enter the maximum acceptable cloud percentage.
4. Leave the image type set to `RGB GeoTIFF`.
5. Click **Export Sentinel Image**.
6. Keep the server running while the page monitors the task.
7. After the status becomes `COMPLETED`, open the `Sentinel_Images` folder in Google Drive.

The page currently displays image-type and Drive-folder controls, but the backend exports RGB imagery only and always targets `Sentinel_Images`. Values submitted through those two controls are currently ignored.

Generated filenames use one of these patterns:

```text
sentinel_rgb_YYYYMMDD_HHMMSS.tif
```

## Processing workflow

The backend performs the following operations:

1. Validates the polygon coordinates.
2. Closes the polygon when its final point does not match its first point.
3. Filters Sentinel-2 imagery by area, date range, and cloud percentage.
4. Counts the matching images.
5. Sorts the collection by `CLOUDY_PIXEL_PERCENTAGE`.
6. Selects the least-cloudy image.
7. Selects the RGB bands `B4`, `B3`, and `B2`.
8. Clips the result to the selected area.
9. Starts an Earth Engine export task targeting Google Drive.
10. Stores the task in memory so its status can be requested by the browser.

## HTTP endpoints

### `GET /`

Renders the map interface.

### `POST /process-area`

Starts a Sentinel-2 export. Example request body:

```json
{
  "coordinates": [
    [90.345, 23.877],
    [90.355, 23.877],
    [90.355, 23.868],
    [90.345, 23.868],
    [90.345, 23.877]
  ],
  "start_date": "2026-01-01",
  "end_date": "2026-07-20",
  "cloud_percentage": 20
}
```

The end date is inclusive. The endpoint returns the task ID, initial task status, matching image count, selected product ID, selected image cloud percentage, destination folder, and output filename.

### `GET /task-status/<task_id>`

Returns the current Earth Engine task state. Possible states include:

```text
READY
RUNNING
COMPLETED
FAILED
CANCELLED
```

The application first checks its in-memory task registry. If the task is not present there, it requests the status directly from Earth Engine using the supplied task ID.

## Verify the Earth Engine connection

Run this independent connection test:

```powershell
python -c "import ee; ee.Initialize(project='optical-metric-497209-p0'); print(ee.Number(40).add(2).getInfo())"
```

Expected output:

```text
42
```

## Troubleshooting

### Project permission error

If Earth Engine reports `Caller does not have required permission to use project`, verify that the authenticated principal has these IAM roles on the selected project:

- Service Usage Consumer: `roles/serviceusage.serviceUsageConsumer`
- Earth Engine Resource Viewer: `roles/earthengine.viewer`
- Earth Engine Resource Writer: `roles/earthengine.writer` for exports and asset writes

Also verify that `PROJECT_ID` in `services/earth_engine_service.py` is correct.

### Earth Engine API disabled

Enable the service below for the selected Google Cloud project:

```text
earthengine.googleapis.com
```

### Wrong or expired Google account credential

Force a new authentication flow:

```powershell
earthengine authenticate --force --auth_mode=localhost
```

### No matching image found

Try one or more of the following:

- Increase the date range.
- Increase the maximum cloud percentage.
- Check that the selected area is valid.

### Export task not found

Confirm that the task ID is correct and still available through Earth Engine. Restarting Flask clears the local `active_tasks` registry, but the status endpoint falls back to the Earth Engine API for tasks that are not held in memory.

### Export failed

Check the error returned by `/task-status/<task_id>`. Common causes include missing Drive authorization, an invalid region, Earth Engine quota limits, or an export that exceeds processing limits.

## Development note

This project currently uses Flask's development server and an in-memory task registry. For production deployment, use a production WSGI server and persistent task storage instead of `active_tasks`.
