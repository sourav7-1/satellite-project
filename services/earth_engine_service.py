from datetime import datetime

import ee


PROJECT_ID = "optical-metric-497209-p0"


def initialize_earth_engine():
    """
    Connect the application with Google Earth Engine.
    """

    try:
        ee.Initialize(project=PROJECT_ID)
        print("Earth Engine Connected Successfully!")

    except Exception as error:
        print("Earth Engine initialization failed:", error)
        raise


def validate_coordinates(coordinates):
    """
    Validate polygon coordinates received from Leaflet.
    """

    if not coordinates:
        raise ValueError("Coordinates are required.")

    if not isinstance(coordinates, list):
        raise ValueError("Coordinates must be a list.")

    if len(coordinates) < 4:
        raise ValueError("A polygon requires at least three points.")

    for point in coordinates:
        if not isinstance(point, list) or len(point) != 2:
            raise ValueError("Each coordinate must contain longitude and latitude.")

        longitude = point[0]
        latitude = point[1]

        if not isinstance(longitude, (int, float)):
            raise ValueError("Longitude must be a number.")

        if not isinstance(latitude, (int, float)):
            raise ValueError("Latitude must be a number.")

        if longitude < -180 or longitude > 180:
            raise ValueError("Invalid longitude value.")

        if latitude < -90 or latitude > 90:
            raise ValueError("Invalid latitude value.")


def close_polygon(coordinates):
    """
    Ensure that the first and last polygon coordinates are the same.
    """

    polygon_coordinates = coordinates.copy()

    if polygon_coordinates[0] != polygon_coordinates[-1]:
        polygon_coordinates.append(polygon_coordinates[0])

    return polygon_coordinates


def start_sentinel_export(
    coordinates,
    start_date,
    end_date,
    cloud_percentage=20,
    image_type="rgb",
    drive_folder="Sentinel_Images"
):
    """
    Search Sentinel-2 images, select the lowest-cloud image,
    crop it using the selected polygon and start Google Drive export.
    """

    validate_coordinates(coordinates)

    polygon_coordinates = close_polygon(coordinates)

    selected_area = ee.Geometry.Polygon(
        [polygon_coordinates],
        proj=None,
        geodesic=False
    )

    collection = (
        ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
        .filterBounds(selected_area)
        .filterDate(start_date, end_date)
        .filter(
            ee.Filter.lt(
                "CLOUDY_PIXEL_PERCENTAGE",
                cloud_percentage
            )
        )
    )

    image_count = collection.size().getInfo()

    if image_count == 0:
        raise ValueError(
            "No Sentinel-2 image was found for the selected area and date range."
        )

    selected_image = collection.sort(
        "CLOUDY_PIXEL_PERCENTAGE"
    ).first()

    product_id = selected_image.get("PRODUCT_ID").getInfo()

    selected_cloud_percentage = selected_image.get(
        "CLOUDY_PIXEL_PERCENTAGE"
    ).getInfo()

    if image_type == "ndvi":
        export_image = (
            selected_image
            .normalizedDifference(["B8", "B4"])
            .rename("NDVI")
            .clip(selected_area)
        )

    else:
        export_image = (
            selected_image
            .select(["B4", "B3", "B2"])
            .clip(selected_area)
        )

    current_time = datetime.now().strftime("%Y%m%d_%H%M%S")

    file_name = f"sentinel_{image_type}_{current_time}"
    task_description = f"sentinel_export_{current_time}"

    task = ee.batch.Export.image.toDrive(
        image=export_image,
        description=task_description,
        folder=drive_folder,
        fileNamePrefix=file_name,
        region=selected_area,
        scale=10,
        fileFormat="GeoTIFF",
        maxPixels=1e13
    )

    task.start()

    return {
        "task": task,
        "task_id": task.id,
        "image_count": image_count,
        "product_id": product_id,
        "cloud_percentage": selected_cloud_percentage,
        "file_name": f"{file_name}.tif",
        "drive_folder": drive_folder
    }