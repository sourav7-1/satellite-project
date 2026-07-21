import ee


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
    "VV_minus_VH",
]


def mask_sentinel2(image):
    scl = image.select("SCL")

    mask = (
        scl.neq(3)
        .And(scl.neq(8))
        .And(scl.neq(9))
        .And(scl.neq(10))
        .And(scl.neq(11))
    )

    return (
        image.updateMask(mask)
        .select(["B2", "B3", "B4", "B8", "B12"])
    )


def create_ml_ready_stack(
    region,
    start_date,
    end_date,
    cloud_percentage=95,
):
    end_date_exclusive = ee.Date(end_date).advance(1, "day")

    s2_collection = (
        ee.ImageCollection(
            "COPERNICUS/S2_SR_HARMONIZED"
        )
        .filterBounds(region)
        .filterDate(
            start_date,
            end_date_exclusive,
        )
        .filter(
            ee.Filter.lt(
                "CLOUDY_PIXEL_PERCENTAGE",
                cloud_percentage,
            )
        )
        .map(mask_sentinel2)
    )

    s2_count = s2_collection.size().getInfo()

    if s2_count == 0:
        raise ValueError(
            "No Sentinel-2 image found for the selected date range."
        )

    s2_median = (
        s2_collection
        .median()
        .clip(region)
    )

    ndvi = s2_median.expression(
        "(NIR - RED) / (NIR + RED)",
        {
            "NIR": s2_median.select("B8"),
            "RED": s2_median.select("B4"),
        },
    ).rename("NDVI")

    evi = s2_median.expression(
        "2.5 * ((NIR - RED) / "
        "(NIR + 6 * RED - 7.5 * BLUE + 1))",
        {
            "NIR": s2_median.select("B8"),
            "RED": s2_median.select("B4"),
            "BLUE": s2_median.select("B2"),
        },
    ).rename("EVI")

    nbr = s2_median.expression(
        "(NIR - SWIR2) / (NIR + SWIR2)",
        {
            "NIR": s2_median.select("B8"),
            "SWIR2": s2_median.select("B12"),
        },
    ).rename("NBR")

    s1_collection = (
        ee.ImageCollection("COPERNICUS/S1_GRD")
        .filterBounds(region)
        .filterDate(
            start_date,
            end_date_exclusive,
        )
        .filter(
            ee.Filter.eq(
                "instrumentMode",
                "IW",
            )
        )
        .filter(
            ee.Filter.listContains(
                "transmitterReceiverPolarisation",
                "VV",
            )
        )
        .filter(
            ee.Filter.listContains(
                "transmitterReceiverPolarisation",
                "VH",
            )
        )
        .select(["VV", "VH"])
    )

    s1_count = s1_collection.size().getInfo()

    if s1_count == 0:
        raise ValueError(
            "No Sentinel-1 VV/VH image found for the selected date range."
        )

    s1_median = (
        s1_collection
        .median()
        .clip(region)
    )

    vv = s1_median.select("VV")
    vh = s1_median.select("VH")

    vv_vh_ratio = (
        vv.divide(vh)
        .rename("VV_VH_ratio")
    )

    vv_minus_vh = (
        vv.subtract(vh)
        .rename("VV_minus_VH")
    )

    stacked_image = (
        s2_median.select(["B4", "B3", "B2"])
        .addBands(ndvi)
        .addBands(evi)
        .addBands(nbr)
        .addBands(
            s1_median.select(["VV", "VH"])
        )
        .addBands(vv_vh_ratio)
        .addBands(vv_minus_vh)
        .select(FINAL_BAND_ORDER)
        .clip(region)
        .toFloat()
    )

    rgb_preview = (
        s2_median
        .select(["B4", "B3", "B2"])
        .visualize(
            min=0,
            max=3000,
            gamma=1.2,
        )
    )

    preview_url = rgb_preview.getThumbURL(
        {
            "region": region,
            "dimensions": 1000,
            "format": "png",
        }
    )

    return {
        "image": stacked_image,
        "preview_url": preview_url,
        "s1_image_count": s1_count,
        "s2_image_count": s2_count,
        "band_count": len(FINAL_BAND_ORDER),
        "band_names": FINAL_BAND_ORDER,
    }