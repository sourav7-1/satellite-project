import ee

ee.Authenticate()
ee.Initialize(project="optical-metric-497209-p0")

print("Earth Engine Connected Successfully!")

# Test area: Daffodil International University-এর কাছাকাছি একটি ছোট এলাকা
selected_area = ee.Geometry.Polygon([
    [
        [90.3450, 23.8770],
        [90.3550, 23.8770],
        [90.3550, 23.8680],
        [90.3450, 23.8680],
        [90.3450, 23.8770]
    ]
])

# Sentinel-2 image collection
collection = (
    ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
    .filterBounds(selected_area)
    .filterDate("2026-01-01", "2026-07-20")
    .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 20))
)

# কতগুলো image পাওয়া গেছে
image_count = collection.size().getInfo()
print("Total Sentinel images found:", image_count)

if image_count == 0:
    print("No suitable Sentinel image found.")
else:
    # সবচেয়ে কম cloud থাকা image
    image = collection.sort("CLOUDY_PIXEL_PERCENTAGE").first()

    image_id = image.get("PRODUCT_ID").getInfo()
    cloud_percentage = image.get("CLOUDY_PIXEL_PERCENTAGE").getInfo()

    print("Selected image:", image_id)
    print("Cloud percentage:", cloud_percentage)

    # RGB bands select এবং selected area অনুযায়ী crop
    rgb_image = image.select(["B4", "B3", "B2"]).clip(selected_area)

    # Google Drive export
    task = ee.batch.Export.image.toDrive(
        image=rgb_image,
        description="sentinel_test_export",
        folder="Sentinel_Images",
        fileNamePrefix="diu_sentinel_test",
        region=selected_area,
        scale=10,
        fileFormat="GeoTIFF",
        maxPixels=1e13
    )

    task.start()

    print("Google Drive export started!")
    print("Task ID:", task.id)
    print("Task status:", task.status()["state"])

    import time

while True:
    status = task.status()
    state = status["state"]

    print("Current status:", state)

    if state in ["COMPLETED", "FAILED", "CANCELLED"]:
        break

    time.sleep(10)

if state == "COMPLETED":
    print("Export completed successfully!")
else:
    print("Export did not complete.")
    print(status)