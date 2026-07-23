from datetime import datetime, timedelta

import ee


PROJECT_ID = "optical-metric-497209-p0"
DRIVE_FOLDER = "Sentinel_Images"

FINAL_BAND_ORDER = [
    "B4",
    "B3",
    "B2",
    "NDVI",
    "EVI",
    "NBR",
    "VV",
    "VH",
    "VV_VH_ratio",
    "VV_minus_VH"
]


def create_layer_tile_url(image, visualization):
    map_data = image.getMapId(visualization)

    return map_data["tile_fetcher"].url_format


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
                "প্রতিটি coordinate "
                "[longitude, latitude] format-এ হতে হবে।"
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


def mask_sentinel2(image):
    """
    SCL classification ব্যবহার করে cloud, shadow,
    cirrus এবং snow pixel বাদ দেয়।
    """

    scl = image.select("SCL")

    mask = (
        scl.neq(3)
        .And(scl.neq(8))
        .And(scl.neq(9))
        .And(scl.neq(10))
        .And(scl.neq(11))
    )

    return (
        image
        .updateMask(mask)
        .select(["B2", "B3", "B4", "B8", "B12"])
    )


def start_sentinel_export(
    coordinates,
    start_date,
    end_date,
    cloud_percentage=20,
    export_destination="both"
):
    validate_coordinates(coordinates)

    allowed_destinations = {
        "drive",
        "local",
        "both"
    }

    if (
        not isinstance(export_destination, str) or
        export_destination not in allowed_destinations
    ):
        raise ValueError(
            "Export destination must be drive, local, or both."
        )

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

    except ValueError as error:
        raise ValueError(
            "Date format অবশ্যই YYYY-MM-DD হতে হবে।"
        ) from error

    if start_date_object > end_date_object:
        raise ValueError(
            "End date অবশ্যই start date-এর "
            "সমান বা পরে হতে হবে।"
        )

    # Earth Engine filterDate-এর end date exclusive।
    # তাই user-selected end date include করার জন্য ১ দিন যোগ করা হয়েছে।
    end_date_exclusive = (
        end_date_object + timedelta(days=1)
    ).strftime("%Y-%m-%d")

    try:
        cloud_percentage = float(cloud_percentage)

    except (TypeError, ValueError) as error:
        raise ValueError(
            "Cloud percentage অবশ্যই number হতে হবে।"
        ) from error

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

    # ========================================
    # 1. SENTINEL-2 COLLECTION
    # ========================================

    s2_collection = (
        ee.ImageCollection(
            "COPERNICUS/S2_SR_HARMONIZED"
        )
        .filterBounds(selected_area)
        .filterDate(
            start_date,
            end_date_exclusive
        )
        .filter(
            ee.Filter.lte(
                "CLOUDY_PIXEL_PERCENTAGE",
                cloud_percentage
            )
        )
    )

    s2_image_count = s2_collection.size().getInfo()

    if s2_image_count == 0:
        raise ValueError(
            "এই area, date range এবং cloud limit-এর জন্য "
            "কোনো Sentinel-2 image পাওয়া যায়নি।"
        )

    # ========================================
    # 2. CLOUD MASK + MEDIAN COMPOSITE
    # ========================================

    s2_clean = s2_collection.map(
        mask_sentinel2
    )

    s2_median = (
        s2_clean
        .median()
        .clip(selected_area)
    )

    # ========================================
    # 3. SENTINEL-2 INDICES
    # ========================================

    ndvi = (
        s2_median
        .normalizedDifference(["B8", "B4"])
        .rename("NDVI")
    )

    # Manual Earth Engine code-এর formula একই রাখা হয়েছে।
    evi = (
        s2_median
        .expression(
            (
                "2.5 * ((NIR - RED) / "
                "(NIR + 6 * RED - "
                "7.5 * BLUE + 1))"
            ),
            {
                "NIR": s2_median.select("B8"),
                "RED": s2_median.select("B4"),
                "BLUE": s2_median.select("B2")
            }
        )
        .rename("EVI")
    )

    nbr = (
        s2_median
        .normalizedDifference(["B8", "B12"])
        .rename("NBR")
    )

    # ========================================
    # 4. SENTINEL-1 COLLECTION
    # ========================================

    s1_collection = (
        ee.ImageCollection("COPERNICUS/S1_GRD")
        .filterBounds(selected_area)
        .filterDate(
            start_date,
            end_date_exclusive
        )
        .filter(
            ee.Filter.eq(
                "instrumentMode",
                "IW"
            )
        )
        .filter(
            ee.Filter.listContains(
                "transmitterReceiverPolarisation",
                "VV"
            )
        )
        .filter(
            ee.Filter.listContains(
                "transmitterReceiverPolarisation",
                "VH"
            )
        )
        .select(["VV", "VH"])
    )

    s1_image_count = s1_collection.size().getInfo()

    if s1_image_count == 0:
        raise ValueError(
            "এই area এবং date range-এর জন্য "
            "Sentinel-1 VV/VH image পাওয়া যায়নি।"
        )

    # ========================================
    # 5. SENTINEL-1 MEDIAN COMPOSITE
    # ========================================

    s1_median = (
        s1_collection
        .median()
        .clip(selected_area)
    )

    # ========================================
    # 6. RADAR FEATURES
    # ========================================

    vv = s1_median.select("VV")
    vh = s1_median.select("VH")

    vv_vh_ratio = (
        vv
        .divide(vh)
        .rename("VV_VH_ratio")
    )

    vv_minus_vh = (
        vv
        .subtract(vh)
        .rename("VV_minus_VH")
    )

    # ========================================
    # 7. FINAL 10-LAYER ML STACK
    # ========================================

    stacked_image = (
        s2_median
        .select(["B4", "B3", "B2"])
        .addBands(ndvi)
        .addBands(evi)
        .addBands(nbr)
        .addBands(
            s1_median.select(["VV", "VH"])
        )
        .addBands(vv_vh_ratio)
        .addBands(vv_minus_vh)
        .select(FINAL_BAND_ORDER)
        .clip(selected_area)
        .toFloat()
    )

    # ========================================
    # 8. RGB WEBSITE PREVIEW
    # ========================================

    rgb_image = (
        s2_median
        .select(["B4", "B3", "B2"])
        .clip(selected_area)
    )

    preview_image = rgb_image.visualize(
        min=0,
        max=3000,
        gamma=1.2
    )

    preview_url = preview_image.getThumbURL({
        "region": polygon_coordinates,
        "dimensions": 1000,
        "format": "png"
    })

    grayscale_palette = [
        "000000",
        "FFFFFF"
    ]
    vegetation_palette = [
        "5B0A0A",
        "D73027",
        "FEE08B",
        "A6D96A",
        "1A9850",
        "00441B"
    ]
    burn_palette = [
        "7F0000",
        "D73027",
        "FDAE61",
        "FFFFBF",
        "A6D96A",
        "1A9850",
        "006837"
    ]
    radar_feature_palette = [
        "313695",
        "74ADD1",
        "FFFFBF",
        "F46D43",
        "A50026"
    ]

    layer_preview_definitions = {
        "RGB": {
            "name": "RGB",
            "type": "composite",
            "image": rgb_image,
            "visualization": {
                "bands": ["B4", "B3", "B2"],
                "min": 0,
                "max": 3000,
                "gamma": 1.2
            }
        },
        "B4": {
            "name": "B4",
            "type": "spectral band",
            "image": s2_median.select("B4"),
            "visualization": {
                "min": 0,
                "max": 3000,
                "palette": grayscale_palette
            }
        },
        "B3": {
            "name": "B3",
            "type": "spectral band",
            "image": s2_median.select("B3"),
            "visualization": {
                "min": 0,
                "max": 3000,
                "palette": grayscale_palette
            }
        },
        "B2": {
            "name": "B2",
            "type": "spectral band",
            "image": s2_median.select("B2"),
            "visualization": {
                "min": 0,
                "max": 3000,
                "palette": grayscale_palette
            }
        },
        "NDVI": {
            "name": "NDVI",
            "type": "index",
            "image": ndvi,
            "visualization": {
                "min": -1,
                "max": 1,
                "palette": vegetation_palette
            }
        },
        "EVI": {
            "name": "EVI",
            "type": "index",
            "image": evi,
            "visualization": {
                "min": -1,
                "max": 1,
                "palette": vegetation_palette
            }
        },
        "NBR": {
            "name": "NBR",
            "type": "index",
            "image": nbr,
            "visualization": {
                "min": -1,
                "max": 1,
                "palette": burn_palette
            }
        },
        "VV": {
            "name": "VV",
            "type": "radar band",
            "image": vv,
            "visualization": {
                "min": -25,
                "max": 5,
                "palette": grayscale_palette
            }
        },
        "VH": {
            "name": "VH",
            "type": "radar band",
            "image": vh,
            "visualization": {
                "min": -30,
                "max": 0,
                "palette": grayscale_palette
            }
        },
        "VV_VH_ratio": {
            "name": "VV_VH_ratio",
            "type": "radar feature",
            "image": vv_vh_ratio,
            "visualization": {
                "min": -2,
                "max": 4,
                "palette": radar_feature_palette
            }
        },
        "VV_minus_VH": {
            "name": "VV_minus_VH",
            "type": "radar feature",
            "image": vv_minus_vh,
            "visualization": {
                "min": -10,
                "max": 20,
                "palette": radar_feature_palette
            }
        }
    }

    # ========================================
    # 9. EXPORT FILE NAME
    # ========================================

    current_time = datetime.now().strftime(
        "%Y%m%d_%H%M%S"
    )

    file_name = (
        f"S1_S2_ML_10Band_{current_time}"
    )

    # ========================================
    # 10. EXPORT DESTINATIONS
    # ========================================

    drive_task = None
    drive_task_id = None
    drive_status = None
    download_url = None
    local_download_error = None

    if export_destination in {"drive", "both"}:
        drive_task = ee.batch.Export.image.toDrive(
            image=stacked_image,
            description=file_name,
            folder=DRIVE_FOLDER,
            fileNamePrefix=file_name,
            region=selected_area,
            scale=10,
            fileFormat="GeoTIFF",
            maxPixels=1e13,
            formatOptions={
                "cloudOptimized": True
            }
        )

        drive_task.start()

        drive_task_id = drive_task.id
        drive_status = drive_task.status().get(
            "state",
            "READY"
        )

    if export_destination in {"local", "both"}:
        try:
            download_url = stacked_image.getDownloadURL({
                "name": file_name,
                "scale": 10,
                "region": selected_area,
                "filePerBand": False,
                "format": "GEO_TIFF"
            })

            if not download_url:
                raise RuntimeError(
                    "Earth Engine did not return a download URL."
                )

        except Exception as error:
            local_download_error = (
                "The selected area is too large for direct "
                "download. Please select a smaller area or use "
                "Google Drive export."
            )

            print("Local download URL error:", error)

            if export_destination == "local":
                raise ValueError(
                    local_download_error
                ) from error

    layer_previews = {}

    for layer_key, layer_definition in (
        layer_preview_definitions.items()
    ):
        try:
            layer_previews[layer_key] = {
                "name": layer_definition["name"],
                "type": layer_definition["type"],
                "tile_url": create_layer_tile_url(
                    layer_definition["image"],
                    layer_definition["visualization"]
                )
            }

        except Exception as error:
            print(
                f"Could not create {layer_key} preview:",
                error
            )

    # ========================================
    # 11. TERMINAL OUTPUT
    # ========================================

    print("\nS1 + S2 ML-ready processing completed!")
    print("Export destination:", export_destination)
    print("Drive task ID:", drive_task_id)
    print("Drive status:", drive_status)
    print(
        "Local download URL generated:",
        bool(download_url)
    )
    if local_download_error:
        print(
            "Local download error:",
            local_download_error
        )
    print("Sentinel-2 images found:", s2_image_count)
    print("Sentinel-1 images found:", s1_image_count)
    print("Start date:", start_date)
    print("End date:", end_date)
    print("Cloud limit:", cloud_percentage)
    print("Preview URL:", preview_url)
    print("Export type: S1 + S2 ML-ready GeoTIFF")
    print("Band count:", len(FINAL_BAND_ORDER))
    print(
        "Exported bands:",
        ", ".join(FINAL_BAND_ORDER)
    )
    print("File name:", f"{file_name}.tif")

    # ========================================
    # 12. RESPONSE
    # ========================================

    return {
        "task": drive_task,
        "task_id": drive_task_id,
        "status": drive_status or "DOWNLOAD_READY",
        "export_destination": export_destination,
        "download_url": download_url,
        "local_download_error": local_download_error,

        # Existing frontend compatibility
        "image_count": s2_image_count,
        "product_id": "S1_S2_MEDIAN_COMPOSITE",
        "acquisition_date": (
            f"{start_date} to {end_date}"
        ),
        "cloud_percentage": cloud_percentage,

        # Preview
        "preview_url": preview_url,
        "layer_previews": layer_previews,

        # Dataset information
        "s1_image_count": s1_image_count,
        "s2_image_count": s2_image_count,
        "band_count": len(FINAL_BAND_ORDER),
        "exported_bands": FINAL_BAND_ORDER,
        "export_type": (
            "S1 + S2 ML-ready 10-band GeoTIFF"
        ),

        # Export information
        "file_name": f"{file_name}.tif",
        "drive_folder": (
            DRIVE_FOLDER
            if export_destination in {"drive", "both"}
            else None
        )
    }
