from flask import Flask, render_template, request, jsonify

app = Flask(__name__)


@app.route("/")
def home():
    return render_template("index.html")


@app.route("/process-area", methods=["POST"])
def process_area():
    data = request.get_json()

    coordinates = data.get("coordinates")

    print("Selected coordinates:")
    print(coordinates)

    return jsonify({
        "success": True,
        "message": "Coordinates received successfully",
        "coordinates": coordinates
    })


if __name__ == "__main__":
    app.run(debug=True)