from datetime import datetime

import ee


def export_to_google_drive(
    image,
    region,
    folder_name="GEE_Exports",
):
    timestamp = datetime.now().strftime(
        "%Y%m%d_%H%M%S"
    )

    file_name = (
        f"S1_S2_ML_10Band_{timestamp}"
    )

    task = ee.batch.Export.image.toDrive(
        image=image,
        description=file_name,
        folder=folder_name,
        fileNamePrefix=file_name,
        region=region,
        scale=10,
        maxPixels=1e13,
        fileFormat="GeoTIFF",
    )

    task.start()

    return {
        "task": task,
        "task_id": task.id,
        "file_name": f"{file_name}.tif",
        "drive_folder": folder_name,
    }