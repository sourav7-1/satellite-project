import time
import ee

PROJECT_ID = "optical-metric-497209-p0"


def initialize_earth_engine():
    ee.Initialize(project=PROJECT_ID)
    print("Earth Engine Connected Successfully!")


def export_test_image():
    initialize_earth_engine()

    selected_area = ee.Geometry.Polygon(
        [
            [
                [90.3450, 23.8770],
                [90.3550, 23.8770],
                [90.3550, 23.8680],
                [90.3450, 23.8680],
                [90.3450, 23.8770],
            ]
        ]
    )

    collection = (
        ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
        .filterBounds(selected_area)
        .filterDate("2026-01-01", "2026-07-20")
        .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 20))
    )

    image_count = collection.size().getInfo()
    print("Total Sentinel images found:", image_count)

    if image_count == 0:
        print("No suitable Sentinel image found.")
        return

    image = collection.sort("CLOUDY_PIXEL_PERCENTAGE").first()

    image_id = image.get("PRODUCT_ID").getInfo()
    cloud_percentage = image.get("CLOUDY_PIXEL_PERCENTAGE").getInfo()

    print("Selected image:", image_id)
    print("Cloud percentage:", cloud_percentage)

    rgb_image = image.select(["B4", "B3", "B2"]).clip(selected_area)

    task = ee.batch.Export.image.toDrive(
        image=rgb_image,
        description="sentinel_test_export",
        folder="Sentinel_Images",
        fileNamePrefix="diu_sentinel_test",
        region=selected_area,
        scale=10,
        fileFormat="GeoTIFF",
        maxPixels=1e13,
    )

    task.start()

    print("Google Drive export started!")
    print("Task ID:", task.id)

    while True:
        status = task.status()
        state = status.get("state", "UNKNOWN")

        print("Current status:", state)

        if state in ["COMPLETED", "FAILED", "CANCELLED"]:
            break

        time.sleep(10)

    if state == "COMPLETED":
        print("Export completed successfully!")
    else:
        print("Export did not complete.")
        print(status)


if __name__ == "__main__":
    export_test_image()