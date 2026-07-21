from datetime import datetime, timedelta

import ee


PROJECT_ID = "optical-metric-497209-p0"
DRIVE_FOLDER = "Sentinel_Images"


def initialize_earth_engine():
    try:
        ee.Initialize(project=PROJECT_ID)
        print("Earth Engine Connected Successfully!")

    except Exception as error:
        print("Earth Engine connection failed:", error)
        raise


def validate_coordinates(coordinates):
    if not coordinates:
        raise ValueError("Coordinates পাওয়া যায়নি।")

    if not isinstance(coordinates, list):
        raise ValueError("Coordinates অবশ্যই list হতে হবে।")

    if len(coordinates) < 3:
        raise ValueError(
            "Polygon তৈরির জন্য কমপক্ষে ৩টি point প্রয়োজন।"
        )

    for point in coordinates:
        if not isinstance(point, list) or len(point) != 2:
            raise ValueError(
                "প্রতিটি coordinate [longitude, latitude] format-এ হতে হবে।"
            )

        longitude, latitude = point

        if not isinstance(longitude, (int, float)):
            raise ValueError(
                "Longitude অবশ্যই number হতে হবে।"
            )

        if not isinstance(latitude, (int, float)):
            raise ValueError(
                "Latitude অবশ্যই number হতে হবে।"
            )

        if longitude < -180 or longitude > 180:
            raise ValueError(
                "Longitude -180 থেকে 180-এর মধ্যে হতে হবে।"
            )

        if latitude < -90 or latitude > 90:
            raise ValueError(
                "Latitude -90 থেকে 90-এর মধ্যে হতে হবে।"
            )


def close_polygon(coordinates):
    polygon_coordinates = [
        point.copy()
        for point in coordinates
    ]

    if polygon_coordinates[0] != polygon_coordinates[-1]:
        polygon_coordinates.append(
            polygon_coordinates[0].copy()
        )

    return polygon_coordinates


def start_sentinel_export(
    coordinates,
    start_date,
    end_date,
    cloud_percentage=20
):
    validate_coordinates(coordinates)

    if not start_date or not end_date:
        raise ValueError(
            "Start date এবং end date প্রয়োজন।"
        )

    try:
        start_date_object = datetime.strptime(
            start_date,
            "%Y-%m-%d"
        )

        end_date_object = datetime.strptime(
            end_date,
            "%Y-%m-%d"
        )

    except ValueError:
        raise ValueError(
            "Date format অবশ্যই YYYY-MM-DD হতে হবে।"
        )

    if start_date_object > end_date_object:
        raise ValueError(
            "End date অবশ্যই start date-এর সমান বা পরে হতে হবে।"
        )

    end_date_inclusive = (
        end_date_object + timedelta(days=1)
    ).strftime("%Y-%m-%d")

    try:
        cloud_percentage = float(cloud_percentage)

    except (TypeError, ValueError):
        raise ValueError(
            "Cloud percentage অবশ্যই number হতে হবে।"
        )

    if cloud_percentage < 0 or cloud_percentage > 100:
        raise ValueError(
            "Cloud percentage 0 থেকে 100-এর মধ্যে হতে হবে।"
        )

    polygon_coordinates = close_polygon(
        coordinates
    )

    selected_area = ee.Geometry.Polygon(
        [polygon_coordinates],
        proj=None,
        geodesic=False
    )

    collection = (
        ee.ImageCollection(
            "COPERNICUS/S2_SR_HARMONIZED"
        )
        .filterBounds(selected_area)
        .filterDate(
            start_date,
            end_date_inclusive
        )
        .filter(
            ee.Filter.lte(
                "CLOUDY_PIXEL_PERCENTAGE",
                cloud_percentage
            )
        )
    )

    image_count = collection.size().getInfo()

    if image_count == 0:
        raise ValueError(
            "এই area, date range এবং cloud limit-এর জন্য "
            "কোনো Sentinel-2 image পাওয়া যায়নি।"
        )

    selected_image = (
        collection
        .sort("CLOUDY_PIXEL_PERCENTAGE")
        .first()
    )

    product_id = selected_image.get(
        "PRODUCT_ID"
    ).getInfo()

    cloud = selected_image.get(
        "CLOUDY_PIXEL_PERCENTAGE"
    ).getInfo()

    rgb_image = (
        selected_image
        .select(["B4", "B3", "B2"])
        .clip(selected_area)
    )

    current_time = datetime.now().strftime(
        "%Y%m%d_%H%M%S"
    )

    file_name = (
        f"sentinel_rgb_{current_time}"
    )

    task = ee.batch.Export.image.toDrive(
        image=rgb_image,
        description=file_name,
        folder=DRIVE_FOLDER,
        fileNamePrefix=file_name,
        region=selected_area,
        scale=10,
        fileFormat="GeoTIFF",
        maxPixels=1e13
    )

    task.start()

    initial_status = task.status().get(
        "state",
        "READY"
    )

    print("\nSentinel export started!")
    print("Task ID:", task.id)
    print("Status:", initial_status)
    print("Images found:", image_count)
    print("Selected product:", product_id)
    print("Cloud percentage:", cloud)
    print("Drive folder:", DRIVE_FOLDER)
    print("File name:", f"{file_name}.tif")

    return {
        "task": task,
        "task_id": task.id,
        "status": initial_status,
        "image_count": image_count,
        "product_id": product_id,
        "cloud_percentage": cloud,
        "file_name": f"{file_name}.tif",
        "drive_folder": DRIVE_FOLDER
    }