"""Simplify London borough polygons for the bundled offline basemap (run once)."""
import json, math, sys

def rdp(pts, eps):
    if len(pts) < 3:
        return pts
    (x1, y1), (x2, y2) = pts[0], pts[-1]
    dx, dy = x2 - x1, y2 - y1
    norm = math.hypot(dx, dy) or 1e-12
    dmax, idx = 0.0, 0
    for i in range(1, len(pts) - 1):
        x0, y0 = pts[i]
        d = abs(dy * x0 - dx * y0 + x2 * y1 - y2 * x1) / norm
        if d > dmax:
            dmax, idx = d, i
    if dmax > eps:
        left = rdp(pts[: idx + 1], eps)
        right = rdp(pts[idx:], eps)
        return left[:-1] + right
    return [pts[0], pts[-1]]

def simplify_ring(ring, eps):
    # Closed rings: split at the vertex farthest from the start so RDP has a real baseline.
    x0, y0 = ring[0]
    k = max(range(len(ring)), key=lambda i: (ring[i][0]-x0)**2 + (ring[i][1]-y0)**2)
    s = rdp(ring[: k + 1], eps)[:-1] + rdp(ring[k:], eps)
    if len(s) < 4:
        s = ring[:: max(1, len(ring) // 6)] + [ring[0]]
    if s[0] != s[-1]:
        s.append(s[0])
    return [[round(x, 5), round(y, 5)] for x, y in s]

src, dst, eps = sys.argv[1], sys.argv[2], float(sys.argv[3])
fc = json.load(open(src))
out = []
for f in fc["features"]:
    g = f["geometry"]
    if g["type"] == "Polygon":
        coords = [simplify_ring(r, eps) for r in g["coordinates"]]
        geom = {"type": "Polygon", "coordinates": coords}
    else:
        coords = [[simplify_ring(r, eps) for r in poly] for poly in g["coordinates"]]
        geom = {"type": "MultiPolygon", "coordinates": coords}
    out.append({"type": "Feature", "properties": {"name": f["properties"]["name"]}, "geometry": geom})
json.dump({"type": "FeatureCollection", "features": out}, open(dst, "w"), separators=(",", ":"))
print(dst, sum(len(r) for f in out for r in (f["geometry"]["coordinates"] if f["geometry"]["type"]=="Polygon" else [r for p in f["geometry"]["coordinates"] for r in p])), "points")
