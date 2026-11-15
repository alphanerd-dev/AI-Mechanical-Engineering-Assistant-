#!/usr/bin/env python3
"""Independent standard-library reference calculations for G3 differential tests."""
import json
import math
import sys


def dot(a, b):
    return sum(x * y for x, y in zip(a, b))


def cross(a, b):
    return [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    ]


def norm(vector):
    return math.hypot(*vector)


def normalize(vector):
    scale = max(abs(value) for value in vector)
    if scale == 0:
        raise ValueError("zero vector")
    scaled = [value / scale for value in vector]
    magnitude = math.hypot(*scaled)
    return [value / magnitude for value in scaled]


def subtract(a, b):
    return [x - y for x, y in zip(a, b)]


def add(a, b):
    return [x + y for x, y in zip(a, b)]


def scale(vector, factor):
    return [value * factor for value in vector]


def project_line(point, line_point, direction):
    unit = normalize(direction)
    offset = subtract(point, line_point)
    return add(line_point, scale(unit, dot(offset, unit)))


def project_plane(point, plane_point, normal):
    unit = normalize(normal)
    offset = subtract(point, plane_point)
    return subtract(point, scale(unit, dot(offset, unit)))


def matrix_vector(matrix, vector):
    return [dot(row, vector) for row in matrix]


def matrix_multiply(a, b):
    return [
        [sum(a[row][k] * b[k][column] for k in range(3)) for column in range(3)]
        for row in range(3)
    ]


def transpose(matrix):
    return [[matrix[column][row] for column in range(3)] for row in range(3)]


def transform_point(transform, point):
    return add(matrix_vector(transform["rotation"], point), transform["translationMm"])


def transform_vector(transform, vector):
    return matrix_vector(transform["rotation"], vector)


def compose(a, b):
    return {
        "rotation": matrix_multiply(a["rotation"], b["rotation"]),
        "translationMm": add(matrix_vector(a["rotation"], b["translationMm"]), a["translationMm"]),
    }


def invert(transform):
    rotation = transpose(transform["rotation"])
    return {
        "rotation": rotation,
        "translationMm": scale(matrix_vector(rotation, transform["translationMm"]), -1),
    }


def main():
    payload = json.load(sys.stdin)
    vector_a = payload["vectorA"]
    vector_b = payload["vectorB"]
    small = payload["smallVector"]
    large = payload["largeVector"]
    p1 = payload["distancePoints"][0]
    p2 = payload["distancePoints"][1]
    line = payload["line"]
    plane = payload["plane"]
    bounds_points = payload["boundsPoints"]
    transform_a = payload["transformA"]
    transform_b = payload["transformB"]
    composed = compose(transform_a, transform_b)
    point = payload["transformPoint"]
    vector = payload["transformVector"]

    minima = [min(point[axis] for point in bounds_points) for axis in range(3)]
    maxima = [max(point[axis] for point in bounds_points) for axis in range(3)]
    result = {
        "vector": {
            "dot": dot(vector_a, vector_b),
            "cross": cross(vector_a, vector_b),
            "magnitudeA": norm(vector_a),
            "normalizedSmall": normalize(small),
            "normalizedLarge": normalize(large),
        },
        "distanceMm": norm(subtract(p1, p2)),
        "lineProjection": project_line(line["point"], line["origin"], line["direction"]),
        "planeProjection": project_plane(plane["point"], plane["origin"], plane["normal"]),
        "bounds": {"min": minima, "max": maxima},
        "transform": {
            "point": transform_point(transform_a, point),
            "vector": transform_vector(transform_a, vector),
            "composedPoint": transform_point(composed, point),
            "inverseRoundTrip": transform_point(invert(composed), transform_point(composed, point)),
        },
    }
    print(json.dumps(result, allow_nan=False))


if __name__ == "__main__":
    main()
