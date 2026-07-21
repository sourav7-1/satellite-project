import rasterio

tif_path = r"C:\Users\SOURAV\Downloads\sentinel_10band.tif"

with rasterio.open(tif_path) as dataset:
    print("Band count:", dataset.count)
    print("Width:", dataset.width)
    print("Height:", dataset.height)
    print("Data type:", dataset.dtypes)
    print("CRS:", dataset.crs)
    print("Resolution:", dataset.res)

    for band_number in range(1, dataset.count + 1):
        description = dataset.descriptions[band_number - 1]
        print(
            f"Band {band_number}: "
            f"{description or 'No description'}"
        )