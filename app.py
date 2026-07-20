from flask import Flask, jsonify, render_template, request

from services.earth_engine_service import (
    initialize_earth_engine,
    start_sentinel_export
)


app = Flask(__name__)

active_tasks = {}


try:
    initialize_earth_engine()

except Exception as error:
    print("Application could not connect to Earth Engine.")
    print(error)


@app.route("/")
def home():
    return render_template("index.html")


@app.route("/process-area", methods=["POST"])
def process_area():
    try:
        data = request.get_json()

        if not data:
            return jsonify({
                "success": False,
                "message": "No data was received."
            }), 400

        coordinates = data.get("coordinates")
        start_date = data.get("start_date")
        end_date = data.get("end_date")
        cloud_percentage = data.get("cloud_percentage", 20)
        image_type = data.get("image_type", "rgb")
        drive_folder = data.get(
            "drive_folder",
            "Sentinel_Images"
        )

        if not coordinates:
            return jsonify({
                "success": False,
                "message": "Please select an area on the map."
            }), 400

        if not start_date or not end_date:
            return jsonify({
                "success": False,
                "message": "Start date and end date are required."
            }), 400

        try:
            cloud_percentage = float(cloud_percentage)

        except (TypeError, ValueError):
            return jsonify({
                "success": False,
                "message": "Cloud percentage must be a number."
            }), 400

        if cloud_percentage < 0 or cloud_percentage > 100:
            return jsonify({
                "success": False,
                "message": "Cloud percentage must be between 0 and 100."
            }), 400

        if image_type not in ["rgb", "ndvi"]:
            return jsonify({
                "success": False,
                "message": "Invalid image type."
            }), 400

        print("\nSelected coordinates:")
        print(coordinates)

        result = start_sentinel_export(
            coordinates=coordinates,
            start_date=start_date,
            end_date=end_date,
            cloud_percentage=cloud_percentage,
            image_type=image_type,
            drive_folder=drive_folder
        )

        task = result["task"]
        active_tasks[task.id] = task

        return jsonify({
            "success": True,
            "message": "Sentinel image export started successfully.",
            "task_id": result["task_id"],
            "status": task.status().get("state", "READY"),
            "image_count": result["image_count"],
            "product_id": result["product_id"],
            "cloud_percentage": result["cloud_percentage"],
            "file_name": result["file_name"],
            "drive_folder": result["drive_folder"]
        })

    except ValueError as error:
        return jsonify({
            "success": False,
            "message": str(error)
        }), 400

    except Exception as error:
        print("Processing error:", error)

        return jsonify({
            "success": False,
            "message": "Satellite image processing failed.",
            "error": str(error)
        }), 500


@app.route("/task-status/<task_id>", methods=["GET"])
def task_status(task_id):
    task = active_tasks.get(task_id)

    if task is None:
        return jsonify({
            "success": False,
            "message": "Task was not found in the current server session."
        }), 404

    status = task.status()
    state = status.get("state", "UNKNOWN")

    response = {
        "success": True,
        "task_id": task_id,
        "status": state
    }

    if state == "FAILED":
        response["error"] = status.get(
            "error_message",
            "Export failed."
        )

    return jsonify(response)


if __name__ == "__main__":
    app.run(
        debug=True,
        use_reloader=False
    )