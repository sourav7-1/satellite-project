from flask import Flask, render_template, request, jsonify
import ee

from services.earth_engine_service import (
    initialize_earth_engine,
    start_sentinel_export
)


app = Flask(__name__)

active_tasks = {}


initialize_earth_engine()


@app.route("/")
def home():
    return render_template("index.html")


@app.route("/process-area", methods=["POST"])
def process_area():
    try:
        data = request.get_json(silent=True)

        if not data:
            return jsonify({
                "success": False,
                "message": "No data received."
            }), 400

        coordinates = data.get("coordinates")
        start_date = data.get("start_date")
        end_date = data.get("end_date")
        cloud_percentage = data.get("cloud_percentage", 20)

        if not coordinates:
            return jsonify({
                "success": False,
                "message": "Please select an area."
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

        result = start_sentinel_export(
            coordinates=coordinates,
            start_date=start_date,
            end_date=end_date,
            cloud_percentage=cloud_percentage
        )

        task = result.pop("task", None)

        if task is not None:
            active_tasks[task.id] = task

        return jsonify({
            "success": True,
            "message": (
                "S1 + S2 ML-ready 10-band export "
                "started successfully."
            ),
            **result
        })

    except ValueError as error:
        print("Validation error:", error)

        return jsonify({
            "success": False,
            "message": str(error)
        }), 400

    except Exception as error:
        print("Processing error:", error)

        return jsonify({
            "success": False,
            "message": "Sentinel processing failed.",
            "error": str(error)
        }), 500


@app.route("/task-status/<task_id>", methods=["GET"])
def task_status(task_id):
    try:
        task = active_tasks.get(task_id)

        if task is not None:
            status = task.status()
        else:
            task_status_list = ee.data.getTaskStatus(task_id)

            if not task_status_list:
                return jsonify({
                    "success": False,
                    "message": "Task not found."
                }), 404

            status = task_status_list[0]

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

    except Exception as error:
        print("Task status error:", error)

        return jsonify({
            "success": False,
            "message": "Could not retrieve task status.",
            "error": str(error)
        }), 500


@app.errorhandler(404)
def handle_not_found(error):
    return jsonify({
        "success": False,
        "message": "Requested route was not found."
    }), 404


@app.errorhandler(500)
def handle_server_error(error):
    return jsonify({
        "success": False,
        "message": "Internal server error."
    }), 500


if __name__ == "__main__":
    app.run(
        debug=True,
        use_reloader=False
    )