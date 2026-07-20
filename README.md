# Map and Sentinel Automation

Python ও Google Earth Engine ব্যবহার করে Sentinel-2 satellite image খোঁজা, cloud percentage অনুযায়ী image নির্বাচন করা এবং Google Drive-এ GeoTIFF export করার project।

## বর্তমান অবস্থা

- Earth Engine connection verified
- সক্রিয় Google Cloud project: `optical-metric-497209-p0`
- Earth Engine registration: Noncommercial Community Tier
- Sentinel-2 collection: `COPERNICUS/S2_SR_HARMONIZED`
- Export destination: Google Drive-এর `Sentinel_Images` folder

পুরোনো `map-sentinel-automation` project-এ `roles/serviceusage.serviceUsageConsumer` permission না থাকায় initialization ব্যর্থ হচ্ছিল। Application এখন verified project `optical-metric-497209-p0` ব্যবহার করে।

## Requirements

- Python 3.11 বা compatible version
- `earthengine-api`
- একটি authenticated Google account
- Google Earth Engine access

Package install:

```powershell
python -m pip install earthengine-api
```

## Authentication

প্রথমবার চালানোর সময় browser authentication প্রয়োজন হতে পারে:

```powershell
earthengine authenticate --force --auth_mode=localhost
```

Browser-এ সঠিক Google account নির্বাচন করে permission approve করুন। Earth Engine credential সাধারণত নিচের স্থানে সংরক্ষিত হয়:

```text
%USERPROFILE%\.config\earthengine\credentials
```

Credential বা project পরিবর্তন করতে হলে আবার forced authentication চালান।

## Run

Project directory থেকে:

```powershell
python app.py
```

Successful initialization হলে শুরুতে দেখা যাবে:

```text
Earth Engine Connected Successfully!
```

এরপর script:

1. Daffodil International University-এর আশেপাশের test polygon ব্যবহার করে।
2. `2026-01-01` থেকে `2026-07-20` পর্যন্ত Sentinel-2 image filter করে।
3. 20%-এর কম cloud থাকা image রাখে।
4. সবচেয়ে কম cloud থাকা image নির্বাচন করে।
5. RGB bands `B4`, `B3`, `B2` নির্বাচন করে area অনুযায়ী clip করে।
6. 10-meter resolution-এ GeoTIFF export শুরু করে।
7. Export শেষ হওয়া পর্যন্ত task status দেখায়।

## Export output

- Drive folder: `Sentinel_Images`
- Filename prefix: `diu_sentinel_test`
- Format: GeoTIFF
- Scale: 10 meters

Export task সফল হলে Google Drive-এর `Sentinel_Images` folder পরীক্ষা করুন।

## Connection test

শুধু Earth Engine connection পরীক্ষা করতে:

```powershell
python -c "import ee; ee.Initialize(project='optical-metric-497209-p0'); print(ee.Number(40).add(2).getInfo())"
```

Expected output:

```text
42
```

## Troubleshooting

### `Caller does not have required permission to use project`

Application-এর project ID `optical-metric-497209-p0` আছে কি না পরীক্ষা করুন। অন্য project ব্যবহার করলে authenticated principal-কে অন্তত এই IAM roles দিতে হবে:

- Service Usage Consumer: `roles/serviceusage.serviceUsageConsumer`
- Earth Engine Resource Viewer: `roles/earthengine.viewer`
- Export বা asset write করার জন্য Earth Engine Resource Writer: `roles/earthengine.writer`

### Earth Engine API disabled

Google Cloud Console-এ সঠিক project নির্বাচন করে `earthengine.googleapis.com` API enable করুন।

### Wrong Google account

Credential reset করে পুনরায় authenticate করুন:

```powershell
earthengine authenticate --force --auth_mode=localhost
```

### Export task failed

Terminal-এর final task status এবং `error_message` দেখুন। Common কারণ হলো Drive permission, pixel limit, invalid region অথবা source imagery না পাওয়া।

## Main file

- `app.py` — Earth Engine initialization, Sentinel-2 selection এবং Google Drive export workflow
