"""
Mumbai portfolio world - 03 DETAIL PASS
---------------------------------------
Run AFTER 01_mumbai_world_blockout_v3.py, in the same file (02 is optional).
Scripting tab > New > paste > Run Script. Then export world.glb as before
(File > Export > glTF 2.0, +Y up, "Custom Properties" ticked, and
Data > Compression ticked: Draco shrinks world.glb from ~6 MB to ~1 MB; the site decodes it).

Turns the blockout boxes into a stylised low-poly Mumbai street, keeping the
layout. Nothing the website depends on moves:
  - every display frame  slot_<zone>__<id>  stays exactly where it is
  - the scroll route  route_00, route_01 ...  stays exactly where it is
Buildings keep their footprint and height (so collisions and the map match).

What it adds:
  buildings   floor bands, windows, balconies, AC units, shutters, parapets, Sintex tanks
  trees       neem, gulmohar and coconut palms (replacing the blockout trees) + street trees
  street      lamp posts, overhead wires with crows, zebra crossings, lane markings,
              chai stall, handcart, bench, bus stop, dustbins
  vehicles    kaali-peeli taxis, autorickshaws, a BEST bus, scooters (parked)
  animals     sleeping dogs, a cow, pigeons at the chowk
  seafront    faceted sea, tetrapods, promenade railing and benches, fishing boats, sea link
  sky         low-poly clouds (cloud_*, the website drifts them) and a distant skyline
  markers     cam_intro / cam_intro_target  (opening aerial shot)
              life_<kind>__<id>             (spots for animated animals, see 04_street_life.py)
              lifepath_<name>_00, _01 ...   (loops for moving taxis, autos, dogs, birds)

Re-running the script on the same file first removes what it made before.
"""

import bpy
import bmesh
import math
import random
from mathutils import Matrix, Vector

random.seed(11)
DETAIL_COL = "detail"

# ------------------------------------------------------------------ palette (extends the blockout's)
PALETTE = {
    "ground": (0.78, 0.72, 0.60), "road": (0.36, 0.35, 0.37), "plaza": (0.86, 0.80, 0.70),
    "sea": (0.22, 0.58, 0.60), "grass": (0.45, 0.62, 0.38),
    "bld_blue": (0.62, 0.74, 0.82), "bld_salmon": (0.90, 0.62, 0.55), "bld_mint": (0.66, 0.82, 0.70),
    "bld_cream": (0.93, 0.88, 0.76), "studio": (0.95, 0.80, 0.55), "roof": (0.55, 0.45, 0.42),
    "tank": (0.08, 0.08, 0.09), "tree": (0.32, 0.52, 0.30), "trunk": (0.42, 0.30, 0.22),
    "frame": (0.15, 0.15, 0.16), "awning_a": (0.85, 0.30, 0.28), "awning_b": (0.95, 0.85, 0.55),
    "taxi_y": (0.95, 0.78, 0.15), "taxi_k": (0.06, 0.06, 0.06), "plane": (0.95, 0.95, 0.96),
    "white": (0.95, 0.95, 0.95),
    # new
    "trim": (0.97, 0.93, 0.86), "glass": (0.16, 0.20, 0.24), "glass_lit": (0.98, 0.78, 0.45),
    "shutter": (0.52, 0.53, 0.55), "rail": (0.22, 0.22, 0.23), "ac": (0.90, 0.90, 0.88),
    "leaf_a": (0.25, 0.46, 0.22), "leaf_b": (0.36, 0.56, 0.26), "leaf_c": (0.46, 0.60, 0.25),
    "gulmohar": (0.93, 0.30, 0.12), "palm_leaf": (0.33, 0.55, 0.20), "palm_trunk": (0.55, 0.43, 0.30),
    "coconut": (0.42, 0.30, 0.12), "lamp": (1.0, 0.86, 0.55), "pole": (0.30, 0.31, 0.33),
    "marking": (0.96, 0.95, 0.90), "kerb": (0.78, 0.72, 0.62),
    "bus_red": (0.78, 0.12, 0.10), "bus_cream": (0.95, 0.90, 0.78), "tyre": (0.05, 0.05, 0.05),
    "chrome": (0.75, 0.76, 0.78), "wood": (0.55, 0.36, 0.22), "tarp_blue": (0.18, 0.40, 0.72),
    "dog": (0.72, 0.52, 0.32), "dog_dark": (0.30, 0.22, 0.16), "cow": (0.92, 0.90, 0.86), "horn": (0.40, 0.34, 0.28),
    "pigeon": (0.55, 0.57, 0.62), "crow": (0.10, 0.10, 0.12), "fruit_a": (0.95, 0.60, 0.10),
    "fruit_b": (0.30, 0.65, 0.20), "fruit_c": (0.85, 0.15, 0.15), "tetrapod": (0.72, 0.70, 0.66),
    "sea_deep": (0.16, 0.48, 0.56), "boat_a": (0.20, 0.45, 0.75), "boat_b": (0.90, 0.35, 0.20),
    "cloud": (1.0, 0.94, 0.88), "skyline": (0.72, 0.62, 0.62), "skyline_b": (0.64, 0.56, 0.60),
    "sealink": (0.86, 0.84, 0.82), "flag": (0.95, 0.55, 0.10), "chai": (0.60, 0.30, 0.20),
}
EMISSIVE = {"lamp": 2.5, "glass_lit": 1.2}

_mats = {}


def mat(key):
    if key in _mats:
        return _mats[key]
    m = bpy.data.materials.get("M_" + key)
    if m is None:
        m = bpy.data.materials.new("M_" + key)
        rgba = (*PALETTE[key], 1.0)
        m.diffuse_color = rgba
        try:
            m.use_nodes = True
        except Exception:
            pass
        if m.node_tree:
            bsdf = m.node_tree.nodes.get("Principled BSDF")
            if bsdf:
                bsdf.inputs["Base Color"].default_value = rgba
                bsdf.inputs["Roughness"].default_value = 0.9
                if key in EMISSIVE:
                    bsdf.inputs["Emission Color"].default_value = rgba
                    bsdf.inputs["Emission Strength"].default_value = EMISSIVE[key]
    _mats[key] = m
    return m


# ------------------------------------------------------------------ clean up a previous run
old = bpy.data.collections.get(DETAIL_COL)
if old:
    for o in list(old.all_objects):
        bpy.data.objects.remove(o, do_unlink=True)
    bpy.data.collections.remove(old)
detail_col = bpy.data.collections.new(DETAIL_COL)
bpy.context.scene.collection.children.link(detail_col)


# ------------------------------------------------------------------ geometry builder
class Builder:
    """Collects many small shapes into one mesh object per material (keeps draw calls low)."""

    def __init__(self, name):
        self.name = name
        self.bms = {}

    def _bm(self, key):
        if key not in self.bms:
            self.bms[key] = bmesh.new()
        return self.bms[key]

    def box(self, key, center, size, rot_z=0.0, rot=None):
        m = Matrix.Translation(Vector(center)) @ (rot if rot is not None else Matrix.Rotation(rot_z, 4, 'Z')) @ Matrix.Diagonal((*size, 1))
        bmesh.ops.create_cube(self._bm(key), size=1.0, matrix=m)

    def cyl(self, key, base, r, h, seg=8, r2=None, rot=None):
        rot = rot if rot is not None else Matrix.Identity(4)
        m = Matrix.Translation(Vector(base)) @ rot @ Matrix.Translation((0, 0, h / 2))
        bmesh.ops.create_cone(self._bm(key), cap_ends=True, cap_tris=False, segments=seg,
                              radius1=r, radius2=r if r2 is None else r2, depth=h, matrix=m)

    def ico(self, key, center, r, scale=(1, 1, 1), jitter=0.0, subdiv=1):
        bm = self._bm(key)
        before = set(bm.verts)
        m = Matrix.Translation(Vector(center)) @ Matrix.Diagonal((*scale, 1))
        bmesh.ops.create_icosphere(bm, subdivisions=subdiv, radius=r, matrix=m)
        if jitter:
            for v in set(bm.verts) - before:
                v.co += Vector((random.uniform(-1, 1), random.uniform(-1, 1), random.uniform(-1, 1))) * jitter * r

    def build(self, collection=None):
        out = []
        for key, bm in self.bms.items():
            me = bpy.data.meshes.new(f"{self.name}_{key}")
            bm.to_mesh(me)
            bm.free()
            me.materials.append(mat(key))
            o = bpy.data.objects.new(f"{self.name}_{key}", me)
            (collection or detail_col).objects.link(o)
            out.append(o)
        self.bms = {}
        return out


def empty(name, loc, props=None, size=0.6):
    e = bpy.data.objects.new(name, None)
    e.location = loc
    e.empty_display_size = size
    for k, v in (props or {}).items():
        e[k] = v
    detail_col.objects.link(e)
    return e


# ------------------------------------------------------------------ what must stay clear
SLOT_BOXES = []
for o in bpy.data.objects:
    if o.name.startswith("slot_") and o.type == 'MESH':
        cs = [o.matrix_world @ Vector(c) for c in o.bound_box]
        SLOT_BOXES.append((Vector((min(c.x for c in cs), min(c.y for c in cs), min(c.z for c in cs))),
                           Vector((max(c.x for c in cs), max(c.y for c in cs), max(c.z for c in cs)))))
ROUTE = [o.location.copy() for o in sorted((o for o in bpy.data.objects if o.name.startswith("route_") and o.type == 'EMPTY'),
                                           key=lambda o: o.name)]


def near_slot(center, half, margin=0.35):
    for lo, hi in SLOT_BOXES:
        if all(center[i] + half[i] + margin > lo[i] and center[i] - half[i] - margin < hi[i] for i in range(3)):
            return True
    return False


def seg_dist(p, a, b):
    ab = Vector((b.x - a.x, b.y - a.y))
    ap = Vector((p[0] - a.x, p[1] - a.y))
    t = max(0.0, min(1.0, ap.dot(ab) / max(ab.length_squared, 1e-9)))
    return (ap - ab * t).length


def route_dist(p):
    return min(seg_dist(p, a, b) for a, b in zip(ROUTE, ROUTE[1:]))


FOOTPRINTS = []  # (min_x, min_y, max_x, max_y) of every building / large prop


def in_footprint(p, margin=0.0):
    return any(a - margin < p[0] < c + margin and b - margin < p[1] < d + margin for a, b, c, d in FOOTPRINTS)


def free_spot(p, route_clear=3.0, margin=1.0):
    return route_dist(p) > route_clear and not in_footprint(p, margin) and not near_slot((p[0], p[1], 1.5), (margin, margin, 1.5), 1.0)


def remove(name):
    o = bpy.data.objects.get(name)
    if o:
        bpy.data.objects.remove(o, do_unlink=True)


# ================================================================== 1. BUILDINGS
BUILDING_PATTERNS = ("bazaar_shop_", "filler_", "north_row_", "east_row_", "studio_building", "terminal", "gallery")


def body_material(o):
    return o.material_slots[0].material.name.replace("M_", "").split(".")[0] if o.material_slots else "bld_cream"


def detail_building(o, lane_side=None):
    """lane_side: local direction (+1/-1 on x) of the street-facing facade for bazaar shops."""
    loc, rot = o.location.copy(), o.rotation_euler[2]
    sx, sy, sz = o.dimensions
    key = body_material(o)
    name = o.name
    for suffix in ("_roof", "_tank"):
        remove(name + suffix)
    R = Matrix.Rotation(rot, 4, 'Z')

    def W(x, y, z):  # local -> world
        return loc + (R @ Vector((x, y, z)))

    FOOTPRINTS.append((loc.x - sx / 2, loc.y - sy / 2, loc.x + sx / 2, loc.y + sy / 2))
    b = Builder(name + "_d")
    floors = max(1, int(sz // 3.1))
    fh = sz / floors
    # floor bands and a parapet
    for f in range(1, floors):
        b.box("trim", W(0, 0, f * fh), (sx + 0.16, sy + 0.16, 0.16), rot)
    for (cx, cy, w, d) in ((0, sy / 2 - 0.1, sx, 0.2), (0, -sy / 2 + 0.1, sx, 0.2), (sx / 2 - 0.1, 0, 0.2, sy), (-sx / 2 + 0.1, 0, 0.2, sy)):
        b.box("trim", W(cx, cy, sz + 0.45), (w + 0.1, d + 0.1, 0.9), rot)
    b.box("roof", W(0, 0, sz + 0.03), (sx - 0.2, sy - 0.2, 0.06), rot)
    # facades: (outward normal in local xy, facade width, offset)
    facades = [((1, 0), sy, sx / 2), ((-1, 0), sy, sx / 2), ((0, 1), sx, sy / 2), ((0, -1), sx, sy / 2)]
    for (nx, ny), width, off in facades:
        street = lane_side is not None and nx == lane_side
        cols = max(1, int((width - 1.2) // 2.6))
        step = (width - 1.2) / cols
        for f in range(floors):
            z0 = f * fh
            for c in range(cols):
                t = -width / 2 + 0.6 + step * (c + 0.5)
                along = Vector((-ny, nx))  # facade direction
                px, py = nx * off + along.x * t, ny * off + along.y * t
                if f == 0:
                    if street:
                        # rolling shutters on the shop floor (skipped where a display frame sits)
                        centre = W(px + nx * 0.06, py + ny * 0.06, 1.35)
                        if not near_slot(centre, (1.1, 1.1, 1.3), 0.2):
                            b.box("shutter", centre, (0.12 if nx else step * 0.9, 0.12 if ny else step * 0.9, 2.6), rot)
                            for k in range(6):
                                b.box("rail", W(px + nx * 0.13, py + ny * 0.13, 0.35 + k * 0.4), (0.03 if nx else step * 0.9, 0.03 if ny else step * 0.9, 0.04), rot)
                    elif c == cols // 2 and random.random() < 0.7:
                        b.box("wood", W(px + nx * 0.05, py + ny * 0.05, 1.05), (0.1 if nx else 1.1, 0.1 if ny else 1.1, 2.1), rot)
                    continue
                wc = W(px + nx * 0.04, py + ny * 0.04, z0 + fh * 0.55)
                if near_slot(wc, (0.8, 0.8, 1.0)):
                    continue
                lit = random.random() < 0.12
                b.box("glass_lit" if lit else "glass", wc, (0.1 if nx else 1.1, 0.1 if ny else 1.1, 1.35), rot)
                b.box("trim", W(px + nx * 0.1, py + ny * 0.1, z0 + fh * 0.55 - 0.75), (0.2 if nx else 1.35, 0.2 if ny else 1.35, 0.12), rot)
                r = random.random()
                if street and r < 0.45:
                    # balcony with railing
                    bx, by = px + nx * 0.5, py + ny * 0.5
                    b.box("trim", W(bx, by, z0 + 0.06), (0.9 if nx else 2.0, 0.9 if ny else 2.0, 0.12), rot)
                    b.box("rail", W(px + nx * 0.92, py + ny * 0.92, z0 + 0.95), (0.05 if nx else 2.0, 0.05 if ny else 2.0, 0.06), rot)
                    for k in (-0.9, 0, 0.9):
                        b.box("rail", W(px + nx * 0.92 + along.x * k, py + ny * 0.92 + along.y * k, z0 + 0.5), (0.05, 0.05, 0.9), rot)
                    if random.random() < 0.4:  # laundry
                        b.box(random.choice(["awning_a", "tarp_blue", "white", "awning_b"]),
                              W(px + nx * 0.7 + along.x * 0.3, py + ny * 0.7 + along.y * 0.3, z0 + 1.5), (0.04 if nx else 0.6, 0.04 if ny else 0.6, 0.5), rot)
                elif r < 0.62:
                    b.box("ac", W(px + nx * 0.3 + along.x * 0.9, py + ny * 0.3 + along.y * 0.9, z0 + fh * 0.3), (0.45 if nx else 0.75, 0.45 if ny else 0.75, 0.5), rot)
    # water tanks on the roof
    for _ in range(random.choice((1, 1, 2))):
        tx, ty = random.uniform(-sx / 2 + 1.5, sx / 2 - 1.5), random.uniform(-sy / 2 + 1.5, sy / 2 - 1.5)
        b.cyl("tank", W(tx, ty, sz + 0.06), 0.8, 1.3, seg=10)
        b.cyl("tank", W(tx, ty, sz + 1.36), 0.35, 0.15, seg=8)
    b.build()


for name in [o.name for o in bpy.data.objects]:
    o = bpy.data.objects.get(name)
    if o and o.type == 'MESH' and o.name.startswith(BUILDING_PATTERNS) and not any(o.name.endswith(s) for s in ("_roof", "_tank")):
        lane = None
        if o.name.startswith("bazaar_shop_"):
            lane = 1 if o.name.endswith("_L") else -1
        detail_building(o, lane)

# bazaar awnings as striped fabric
for o in list(bpy.data.objects):
    if o.name.startswith("bazaar_awning_"):
        o.hide_render = False
        loc, (sx, sy, sz) = o.location.copy(), o.dimensions
        b = Builder(o.name + "_stripes")
        n = 7
        for k in range(n):
            if k % 2:
                b.box("white", (loc.x, loc.y - sy / 2 + sy * (k + 0.5) / n, loc.z + sz + 0.005), (sx, sy / n, 0.01))
        b.build()

# ================================================================== 2. TREES
def neem(b, p, h=None):
    h = h or random.uniform(5.5, 7.5)
    b.cyl("trunk", (p[0], p[1], p[2]), 0.28, h * 0.55, seg=6, r2=0.18)
    for _ in range(random.randint(4, 6)):
        c = (p[0] + random.uniform(-1.6, 1.6), p[1] + random.uniform(-1.6, 1.6), p[2] + h * random.uniform(0.62, 0.9))
        b.ico(random.choice(["leaf_a", "leaf_b", "leaf_c"]), c, random.uniform(1.3, 2.0), (1, 1, 0.8), jitter=0.12)
    FOOTPRINTS.append((p[0] - 0.4, p[1] - 0.4, p[0] + 0.4, p[1] + 0.4))


def gulmohar(b, p):
    h = random.uniform(5.5, 6.5)
    b.cyl("trunk", (p[0], p[1], p[2]), 0.3, h * 0.6, seg=6, r2=0.2)
    for a in range(3):
        ang = a * 2.1 + random.uniform(-0.3, 0.3)
        b.cyl("trunk", (p[0], p[1], p[2] + h * 0.5), 0.12, 2.2, seg=5, r2=0.08,
              rot=Matrix.Rotation(ang, 4, 'Z') @ Matrix.Rotation(0.9, 4, 'X'))
    for _ in range(6):
        c = (p[0] + random.uniform(-2.8, 2.8), p[1] + random.uniform(-2.8, 2.8), p[2] + h * random.uniform(0.75, 0.9))
        b.ico("leaf_b", c, random.uniform(1.4, 1.9), (1.2, 1.2, 0.45), jitter=0.12)
    for _ in range(14):
        c = (p[0] + random.uniform(-3, 3), p[1] + random.uniform(-3, 3), p[2] + h * random.uniform(0.86, 0.98))
        b.ico("gulmohar", c, random.uniform(0.45, 0.75), (1, 1, 0.6), jitter=0.1)
    FOOTPRINTS.append((p[0] - 0.4, p[1] - 0.4, p[0] + 0.4, p[1] + 0.4))


def palm(b, p):
    h = random.uniform(7, 9.5)
    lean = Vector((random.uniform(-1, 1), random.uniform(-1, 1), 0)).normalized() * random.uniform(0.6, 1.4)
    segs = 7
    top = Vector(p)
    for i in range(segs):
        t0, t1 = i / segs, (i + 1) / segs
        a = Vector(p) + lean * (t0 ** 2) + Vector((0, 0, h * t0))
        c = Vector(p) + lean * (t1 ** 2) + Vector((0, 0, h * t1))
        d = c - a
        rot = d.to_track_quat('Z', 'Y').to_matrix().to_4x4()
        b.cyl("palm_trunk", a, 0.24 - 0.1 * t0, d.length * 1.02, seg=6, r2=0.23 - 0.1 * t1, rot=rot)
        top = c
    for k in range(8):
        ang = k * math.tau / 8 + random.uniform(-0.2, 0.2)
        droop = random.uniform(0.35, 0.75)
        rot = Matrix.Rotation(ang, 4, 'Z') @ Matrix.Rotation(-droop, 4, 'Y')
        m = Matrix.Translation(top) @ rot @ Matrix.Translation((1.7, 0, 0)) @ Matrix.Diagonal((3.4, 0.7, 0.06, 1))
        bmesh.ops.create_cube(b._bm("palm_leaf"), size=1.0, matrix=m)
    for k in range(3):
        b.ico("coconut", top + Vector((math.cos(k * 2.1) * 0.3, math.sin(k * 2.1) * 0.3, -0.35)), 0.2)
    FOOTPRINTS.append((p[0] - 0.35, p[1] - 0.35, p[0] + 0.35, p[1] + 0.35))


trees = Builder("trees")
palms = Builder("palms")
for o in list(bpy.data.objects):
    if o.name.endswith("_crown") or o.name.endswith("_trunk"):
        base = o.location.copy()
        is_palm = o.name.startswith("palm_")
        stem = o.name.rsplit("_", 1)[0]
        if o.name.endswith("_trunk"):
            if is_palm:
                palm(palms, base)
            elif random.random() < 0.35:
                gulmohar(trees, base)
            else:
                neem(trees, base)
        bpy.data.objects.remove(o, do_unlink=True)

# extra street trees along the roads (kept off the route, frames and buildings)
ROADS = [o for o in bpy.data.objects if o.name.startswith("road_")]
for rd in ROADS:
    (sx, sy, _), c = rd.dimensions, rd.location
    along_x = sx > sy
    length = sx if along_x else sy
    for side in (-1, 1):
        n = int(length // 13)
        for k in range(n):
            t = -length / 2 + (k + 0.5) * length / n + random.uniform(-2, 2)
            off = (sy if along_x else sx) / 2 + 1.6
            p = (c.x + t, c.y + side * off, 0) if along_x else (c.x + side * off, c.y + t, 0)
            if free_spot(p, 3.5, 1.2) and random.random() < 0.6:
                (gulmohar if random.random() < 0.3 else neem)(trees, p)
# fill empty ground at the edges of the neighbourhood with trees and small houses
houses = Builder("edge_houses")
for _ in range(900):
    x, y = random.uniform(-108, 54), random.uniform(-128, 108)
    p = (x, y, 0.0)
    if route_dist(p) < 14 or in_footprint(p, 4) or any(abs(x - r.location.x) < r.dimensions.x / 2 + 3 and abs(y - r.location.y) < r.dimensions.y / 2 + 3 for r in ROADS):
        continue
    if -80 < x < -20 and -84 < y < -40:  # the maidan stays open
        continue
    if -70 < x < -30 and -104 < y < -84:  # event ground
        continue
    if -2 < x < 42 and -118 < y < -86:  # airport apron
        continue
    if random.random() < 0.8:
        (gulmohar if random.random() < 0.25 else neem)(trees, p)
    else:
        w, d, h = random.uniform(6, 9), random.uniform(6, 9), random.uniform(5, 9)
        houses.box(random.choice(["bld_salmon", "bld_mint", "bld_cream", "bld_blue"]), (x, y, h / 2), (w, d, h))
        houses.box("roof", (x, y, h + 0.15), (w + 0.4, d + 0.4, 0.3))
        FOOTPRINTS.append((x - w / 2, y - d / 2, x + w / 2, y + d / 2))
houses.build()
trees.build()
palms.build()

# ================================================================== 3. STREET: lamps, wires, markings, stalls
street = Builder("street")
lamp_spots = []
for rd in ROADS:
    (sx, sy, _), c = rd.dimensions, rd.location
    along_x = sx > sy
    length = sx if along_x else sy
    n = max(1, int(length // 18))
    side = 1 if rd.name in ("road_north", "road_east") else -1
    row = []
    for k in range(n + 1):
        t = -length / 2 + k * length / n
        off = (sy if along_x else sx) / 2 + 0.6
        p = (c.x + t, c.y + side * off, 0) if along_x else (c.x + side * off, c.y + t, 0)
        if route_dist(p) > 2.6 and not in_footprint(p, 0.4) and not near_slot((p[0], p[1], 3), (0.5, 0.5, 3)):
            row.append(p)
    lamp_spots.append(row)
    for p in row:
        street.cyl("pole", p, 0.11, 6.2, seg=6, r2=0.07)
        arm_dir = Vector((0, -side, 0)) if along_x else Vector((-side, 0, 0))
        tip = Vector(p) + arm_dir * 1.4 + Vector((0, 0, 6.0))
        street.box("pole", (Vector(p) + arm_dir * 0.7 + Vector((0, 0, 6.05))), (1.4 if not along_x else 0.08, 1.4 if along_x else 0.08, 0.08))
        street.box("lamp", tip - Vector((0, 0, 0.12)), (0.5, 0.5, 0.18))
        FOOTPRINTS.append((p[0] - 0.2, p[1] - 0.2, p[0] + 0.2, p[1] + 0.2))
# overhead wires between lamp posts, with crows
crow_b = Builder("crows")
for row in lamp_spots:
    for a, b2 in zip(row, row[1:]):
        A, B = Vector(a) + Vector((0, 0, 5.6)), Vector(b2) + Vector((0, 0, 5.6))
        for wire in (0, 0.25):
            pts = [A.lerp(B, t) - Vector((0, 0, 0.5 * math.sin(math.pi * t) + wire)) for t in (0, 0.25, 0.5, 0.75, 1.0)]
            for p0, p1 in zip(pts, pts[1:]):
                d = p1 - p0
                rot = d.to_track_quat('X', 'Z').to_matrix().to_4x4()
                street.box("rail", (p0 + p1) / 2, (d.length, 0.025, 0.025), rot=rot)
        if random.random() < 0.35:
            for k in range(random.randint(1, 3)):
                t = random.uniform(0.2, 0.8)
                p = A.lerp(B, t) - Vector((0, 0, 0.5 * math.sin(math.pi * t) - 0.12))
                crow_b.ico("crow", p, 0.13, (1.4, 0.8, 0.9))
                crow_b.ico("crow", p + Vector((0, 0, 0.13)), 0.07)
crow_b.build()

# zebra crossings where roads meet the chowk, lane dashes on the long roads
for (cx, cy, along_x, length) in ((0, 17, False, 8), (17, 0, True, 8), (-10, -17, False, 8), (6, 80, True, 8), (-4, -80, True, 8)):
    for k in range(7):
        t = -length / 2 + (k + 0.5) * length / 7
        p = (cx + (0 if along_x else t), cy + (t if along_x else 0), 0.07)
        street.box("marking", p, (0.55, 2.8, 0.02) if not along_x else (2.8, 0.55, 0.02))
for rd in ROADS:
    (sx, sy, _), c = rd.dimensions, rd.location
    along_x = sx > sy
    length = sx if along_x else sy
    for k in range(int(length // 6)):
        t = -length / 2 + 3 + k * 6
        if abs(t) > length / 2 - 2:
            continue
        p = (c.x + t, c.y, 0.06) if along_x else (c.x, c.y + t, 0.06)
        if rd.name == "road_bazaar_lane":
            continue
        street.box("marking", p, (2.2, 0.15, 0.02) if along_x else (0.15, 2.2, 0.02))

# chowk: chai stall with bench, handcart, dustbins, bus stop on road_east
def chai_stall(b, p, rot):
    R = Matrix.Rotation(rot, 4, 'Z')
    P = Vector(p)
    b.box("wood", P + R @ Vector((0, 0, 0.55)), (2.2, 1.1, 1.1), rot)
    b.box("chai", P + R @ Vector((0, 0, 1.15)), (2.3, 1.2, 0.1), rot)
    for sx_ in (-1, 1):
        for sy_ in (-1, 1):
            b.box("wood", P + R @ Vector((sx_ * 1.05, sy_ * 0.55, 1.6)), (0.08, 0.08, 1.0), rot)
    b.box("awning_a", P + R @ Vector((0, 0, 2.12)), (2.8, 1.8, 0.1), rot)
    b.cyl("chrome", P + R @ Vector((0.5, 0, 1.2)), 0.18, 0.35, seg=8)
    for k in range(4):
        b.cyl("white", P + R @ Vector((-0.6 + k * 0.18, 0.25, 1.2)), 0.04, 0.09, seg=6)
    b.box("wood", P + R @ Vector((0, -1.7, 0.4)), (2.0, 0.45, 0.08), rot)
    for sx_ in (-0.85, 0.85):
        b.box("wood", P + R @ Vector((sx_, -1.7, 0.2)), (0.08, 0.4, 0.4), rot)
    FOOTPRINTS.append((p[0] - 1.6, p[1] - 2.0, p[0] + 1.6, p[1] + 1.0))


def handcart(b, p, rot):
    R = Matrix.Rotation(rot, 4, 'Z')
    P = Vector(p)
    b.box("wood", P + R @ Vector((0, 0, 0.85)), (2.0, 1.0, 0.1), rot)
    for sx_ in (-0.7, 0.7):
        b.cyl("tyre", P + R @ Vector((sx_, 0.55, 0.35)), 0.35, 0.08, seg=10, rot=R @ Matrix.Rotation(math.pi / 2, 4, 'X'))
        b.cyl("tyre", P + R @ Vector((sx_, -0.47, 0.35)), 0.35, 0.08, seg=10, rot=R @ Matrix.Rotation(math.pi / 2, 4, 'X'))
    for _ in range(26):
        b.ico(random.choice(["fruit_a", "fruit_b", "fruit_c"]), P + R @ Vector((random.uniform(-0.85, 0.85), random.uniform(-0.4, 0.4), 1.0 + random.uniform(0, 0.25))), 0.12)
    b.box("wood", P + R @ Vector((1.35, 0, 0.9)), (0.8, 0.06, 0.06), rot)
    FOOTPRINTS.append((p[0] - 1.1, p[1] - 0.6, p[0] + 1.1, p[1] + 0.6))


def bus_stop(b, p, rot):
    R = Matrix.Rotation(rot, 4, 'Z')
    P = Vector(p)
    for sx_ in (-1.8, 1.8):
        b.box("pole", P + R @ Vector((sx_, 0.5, 1.3)), (0.1, 0.1, 2.6), rot)
    b.box("bus_red", P + R @ Vector((0, 0, 2.65)), (4.2, 1.8, 0.12), rot)
    b.box("wood", P + R @ Vector((0, 0.4, 0.45)), (3.2, 0.45, 0.08), rot)
    b.box("glass", P + R @ Vector((0, 0.75, 1.5)), (3.6, 0.05, 1.6), rot)
    FOOTPRINTS.append((p[0] - 2.2, p[1] - 1.0, p[0] + 2.2, p[1] + 1.0))


chai_stall(street, (10.5, 6.0, 0.08), math.radians(-20))
handcart(street, (-7.5, -9.5, 0.08), math.radians(35))
handcart(street, (2.9, 53.5, 0.05), math.radians(90))
bus_stop(street, (42.0, 5.0, 0.0), 0)
for p in ((12.5, -4.0), (-5.5, 13.0), (4.2, 35.0), (58.0, -12.0), (-40.0, -21.5)):
    if free_spot(p, 2.0, 0.3):
        street.cyl("bus_cream", (p[0], p[1], 0.05), 0.3, 0.9, seg=8)
street.build()

# ================================================================== 4. VEHICLES (parked)
def taxi(b, p, rot):
    """Premier Padmini kaali-peeli: black body, yellow roof."""
    R = Matrix.Rotation(rot, 4, 'Z')
    P = Vector(p)
    b.box("taxi_k", P + R @ Vector((0, 0, 0.62)), (4.0, 1.6, 0.62), rot)
    b.box("taxi_k", P + R @ Vector((1.55, 0, 0.9)), (0.9, 1.55, 0.1), rot)
    b.box("glass", P + R @ Vector((-0.15, 0, 1.2)), (2.1, 1.45, 0.5), rot)
    b.box("taxi_y", P + R @ Vector((-0.15, 0, 1.5)), (2.0, 1.45, 0.1), rot)
    b.box("taxi_y", P + R @ Vector((-0.15, 0, 1.62)), (0.5, 0.25, 0.16), rot)
    b.box("chrome", P + R @ Vector((2.03, 0, 0.5)), (0.08, 1.5, 0.15), rot)
    b.box("chrome", P + R @ Vector((-2.03, 0, 0.5)), (0.08, 1.5, 0.15), rot)
    for sx_ in (1.3, -1.3):
        for sy_ in (0.72, -0.72):
            b.cyl("tyre", P + R @ Vector((sx_, sy_ - 0.1 * (1 if sy_ > 0 else -1) * 0, 0.32)), 0.32, 0.22, seg=10,
                  rot=R @ Matrix.Rotation(math.pi / 2, 4, 'X') @ Matrix.Translation((0, 0, -0.11)))
    FOOTPRINTS.append((p[0] - 2.1, p[1] - 2.1, p[0] + 2.1, p[1] + 2.1))


def auto(b, p, rot):
    R = Matrix.Rotation(rot, 4, 'Z')
    P = Vector(p)
    b.box("taxi_k", P + R @ Vector((0, 0, 0.55)), (2.4, 1.3, 0.5), rot)
    b.box("taxi_k", P + R @ Vector((1.15, 0, 0.9)), (0.3, 0.9, 0.9), rot)
    b.box("glass", P + R @ Vector((1.2, 0, 1.45)), (0.08, 0.95, 0.5), rot)
    b.box("taxi_y", P + R @ Vector((-0.1, 0, 1.75)), (2.3, 1.35, 0.1), rot)
    b.box("taxi_y", P + R @ Vector((-1.2, 0, 1.2)), (0.1, 1.3, 1.0), rot)
    b.box("rail", P + R @ Vector((0.55, 0.6, 1.3)), (0.05, 0.05, 0.9), rot)
    b.box("rail", P + R @ Vector((0.55, -0.6, 1.3)), (0.05, 0.05, 0.9), rot)
    for (sx_, sy_) in ((1.0, 0), (-0.8, 0.62), (-0.8, -0.62)):
        b.cyl("tyre", P + R @ Vector((sx_, sy_, 0.25)), 0.25, 0.16, seg=10, rot=R @ Matrix.Rotation(math.pi / 2, 4, 'X') @ Matrix.Translation((0, 0, -0.08)))
    FOOTPRINTS.append((p[0] - 1.3, p[1] - 1.3, p[0] + 1.3, p[1] + 1.3))


def bus(b, p, rot):
    R = Matrix.Rotation(rot, 4, 'Z')
    P = Vector(p)
    b.box("bus_red", P + R @ Vector((0, 0, 1.65)), (10.5, 2.5, 2.6), rot)
    b.box("bus_cream", P + R @ Vector((0, 0, 2.3)), (10.55, 2.55, 0.9), rot)
    b.box("glass", P + R @ Vector((0, 0, 2.3)), (10.0, 2.58, 0.7), rot)
    b.box("glass", P + R @ Vector((5.27, 0, 2.0)), (0.05, 2.2, 1.3), rot)
    b.box("bus_red", P + R @ Vector((0, 0, 3.0)), (10.3, 2.4, 0.12), rot)
    for sx_ in (3.6, -3.4):
        for sy_ in (1.2, -1.2):
            b.cyl("tyre", P + R @ Vector((sx_, sy_, 0.5)), 0.5, 0.3, seg=12, rot=R @ Matrix.Rotation(math.pi / 2, 4, 'X') @ Matrix.Translation((0, 0, -0.15)))
    FOOTPRINTS.append((p[0] - 5.4, p[1] - 5.4, p[0] + 5.4, p[1] + 5.4))


def scooter(b, p, rot):
    R = Matrix.Rotation(rot, 4, 'Z')
    P = Vector(p)
    b.box(random.choice(["boat_a", "bus_red", "white"]), P + R @ Vector((0, 0, 0.5)), (1.3, 0.4, 0.35), rot)
    b.box("taxi_k", P + R @ Vector((-0.15, 0, 0.75)), (0.6, 0.35, 0.12), rot)
    b.box("rail", P + R @ Vector((0.55, 0, 0.85)), (0.08, 0.08, 0.7), rot)
    b.box("rail", P + R @ Vector((0.6, 0, 1.2)), (0.06, 0.6, 0.05), rot)
    for sx_ in (0.5, -0.5):
        b.cyl("tyre", P + R @ Vector((sx_, 0, 0.22)), 0.22, 0.12, seg=10, rot=R @ Matrix.Rotation(math.pi / 2, 4, 'X') @ Matrix.Translation((0, 0, -0.06)))


cars = Builder("vehicles")
for n in ("taxi_bazaar", "taxi_airport"):
    body = bpy.data.objects.get(n + "_body")
    if body:
        p, r = body.location.copy(), body.rotation_euler[2]
        remove(n + "_body")
        remove(n + "_cab")
        taxi(cars, (p.x, p.y, 0.0), r)
PARKED = [
    (taxi, (25.0, 76.3), 0), (auto, (38.0, 76.5), 0), (taxi, (30.0, 83.7), math.pi),
    (auto, (28.0, 3.4), math.pi), (scooter, (22.0, -3.6), 0.2), (scooter, (23.2, -3.6), 0.1),
    (taxi, (45.0, -3.4), 0), (taxi, (20.0, -76.4), 0), (auto, (-6.6, -60.0), math.pi / 2),
    (taxi, (-46.0, -26.6), 0), (scooter, (-30.0, -21.6), 1.5), (auto, (55.5, 60.0), math.pi / 2),
    (scooter, (3.1, 44.0), 1.6), (scooter, (-3.2, 50.5), 1.5),
]
for fn, (x, y), r in PARKED:
    if route_dist((x, y)) > 2.2:
        fn(cars, (x, y, 0.05), r)
cars.build()

# ================================================================== 5. ANIMALS (resting)
animals = Builder("animals")


def dog_sleeping(b, p, rot):
    R = Matrix.Rotation(rot, 4, 'Z')
    P = Vector(p)
    col = random.choice(["dog", "dog", "dog_dark"])
    b.ico(col, P + R @ Vector((0, 0, 0.18)), 0.35, (1.5, 1.0, 0.55))
    b.ico(col, P + R @ Vector((0.45, 0.18, 0.18)), 0.16, (1.2, 1.0, 0.9))
    b.box(col, P + R @ Vector((0.52, 0.28, 0.3)), (0.08, 0.06, 0.14), rot)
    b.box(col, P + R @ Vector((-0.5, -0.2, 0.1)), (0.4, 0.07, 0.07), rot + 0.6)


def cow(b, p, rot):
    R = Matrix.Rotation(rot, 4, 'Z')
    P = Vector(p)
    b.ico("cow", P + R @ Vector((0, 0, 0.45)), 0.6, (1.7, 0.9, 0.7))
    b.ico("cow", P + R @ Vector((0.35, 0, 0.85)), 0.25, (1.0, 0.9, 0.9))  # hump
    b.ico("cow", P + R @ Vector((1.1, 0, 0.8)), 0.25, (1.3, 0.8, 0.9))
    for s in (1, -1):
        b.box("horn", P + R @ Vector((1.05, s * 0.18, 1.05)), (0.06, 0.06, 0.28), rot)
        b.box("cow", P + R @ Vector((0.8, s * 0.35, 0.12)), (0.7, 0.12, 0.14), rot)
    FOOTPRINTS.append((p[0] - 1.4, p[1] - 1.4, p[0] + 1.4, p[1] + 1.4))


def pigeons(b, c, n=24, r=2.2):
    for _ in range(n):
        a, d = random.uniform(0, math.tau), random.uniform(0.2, r)
        p = Vector((c[0] + math.cos(a) * d, c[1] + math.sin(a) * d, c[2]))
        h = random.uniform(0, math.tau)
        b.ico("pigeon", p + Vector((0, 0, 0.1)), 0.1, (1.5, 0.9, 0.9))
        b.ico("pigeon", p + Vector((math.cos(h) * 0.12, math.sin(h) * 0.12, 0.2)), 0.055)


for p, r in (((8.5, 9.5, 0.08), 0.4), ((-3.4, 55.0, 0.05), 2.0), ((61.8, -25.0, 0.25), 1.2), ((-20.0, -84.0, 0.05), 0.2), ((31.0, 84.2, 0.05), 3.0)):
    if free_spot(p, 2.2, 0.2):
        dog_sleeping(animals, p, r)
cow(animals, (-24.0, -31.5, 0.0), 0.3)
cow(animals, (2.7, 70.5, 0.05), -1.6)
pigeons(animals, (-6.0, 4.0, 0.09))
animals.build()

# ================================================================== 6. SEAFRONT
sea_old = bpy.data.objects.get("sea")
if sea_old:
    bpy.data.objects.remove(sea_old, do_unlink=True)
bm = bmesh.new()
bmesh.ops.create_grid(bm, x_segments=36, y_segments=48, size=1.0, matrix=Matrix.Translation((142, -10, -0.42)) @ Matrix.Diagonal((78, 130, 1, 1)))
for v in bm.verts:
    v.co.z += random.uniform(-0.12, 0.1)
me = bpy.data.meshes.new("sea")
bm.to_mesh(me)
bm.free()
me.materials.append(mat("sea"))
sea = bpy.data.objects.new("sea", me)
detail_col.objects.link(sea)

front = Builder("seafront")
# tetrapods along the seawall
for k in range(90):
    y = -88 + k * 1.95 + random.uniform(-0.4, 0.4)
    c = Vector((random.uniform(66.0, 68.2), y, -0.3))
    for d in ((0, 0, 1), (0.94, 0, -0.33), (-0.47, 0.82, -0.33), (-0.47, -0.82, -0.33)):
        dv = Matrix.Rotation(random.uniform(0, math.tau), 4, 'Z') @ Vector(d)
        front.cyl("tetrapod", c, 0.28, 0.9, seg=5, r2=0.12, rot=dv.to_track_quat('Z', 'Y').to_matrix().to_4x4())
# railing on the seawall + benches + lamps facing the sea ("Queen's Necklace")
for k in range(88):
    y = -89 + k * 2
    front.box("rail", (64.4, y, 1.1), (0.08, 0.08, 1.0))
front.box("rail", (64.4, -3, 1.55), (0.08, 176, 0.08))
front.box("rail", (64.4, -3, 1.15), (0.06, 176, 0.06))
for k in range(12):
    y = -76 + k * 14
    if abs(y - 20) > 5 and abs(y + 45) > 5 and abs(y - 8) > 3 and not near_slot((62.5, y, 1), (1.2, 1.2, 1)):
        front.box("wood", (62.8, y, 0.7), (0.5, 2.0, 0.08))
        front.box("wood", (63.05, y, 1.0), (0.08, 2.0, 0.5))
        for s in (-0.8, 0.8):
            front.box("pole", (62.8, y + s, 0.45), (0.45, 0.08, 0.45))
for k in range(9):
    y = -80 + k * 20
    front.cyl("pole", (63.6, y, 0.25), 0.1, 6.5, seg=6, r2=0.06)
    front.box("pole", (63.0, y, 6.7), (1.3, 0.08, 0.08))
    front.box("lamp", (62.4, y, 6.55), (0.45, 0.45, 0.18))


def boat(b, p, rot, col):
    R = Matrix.Rotation(rot, 4, 'Z')
    P = Vector(p)
    b.box(col, P + R @ Vector((0, 0, 0.35)), (5.5, 1.6, 0.7), rot)
    b.box("wood", P + R @ Vector((2.9, 0, 0.55)), (0.8, 1.0, 0.5), rot)
    b.box("white", P + R @ Vector((-0.8, 0, 1.1)), (1.6, 1.2, 0.8), rot)
    b.box("wood", P + R @ Vector((0.8, 0, 2.5)), (0.1, 0.1, 4.2), rot)
    b.box("flag", P + R @ Vector((0.8, 0.3, 4.4)), (0.05, 0.6, 0.4), rot)


for (x, y, r, col) in ((88, 30, 0.4, "boat_a"), (96, -20, -0.8, "boat_b"), (110, 55, 1.2, "boat_b"), (84, -60, 0.1, "boat_a"), (124, 5, 2.0, "boat_a")):
    boat(front, (x, y, -0.45), r, col)
# a distant sea link: deck, two pylons, cable fans
for k in range(30):
    y = -120 + k * 8
    front.box("sealink", (175, y + 4, 7.0), (4.5, 8.2, 0.7))
    front.box("sealink", (175, y + 4, 3.3), (1.2, 1.2, 6.8))
for py in (-10, 60):
    front.box("sealink", (175, py, 20), (1.6, 2.2, 40))
    for s in range(1, 11):
        for sign in (-1, 1):
            a, b3 = Vector((175, py, 38 - s * 2.2)), Vector((175, py + sign * s * 3.4, 7.3))
            d = b3 - a
            front.box("sealink", (a + b3) / 2, (0.08, 0.08, d.length), rot=d.to_track_quat('Z', 'Y').to_matrix().to_4x4())
front.build()

# ================================================================== 7. SKY + SKYLINE
for k in range(9):
    cb = Builder(f"cloud_{k:02d}")
    c = Vector((random.uniform(-160, 200), random.uniform(-170, 160), random.uniform(70, 110)))
    for _ in range(random.randint(4, 7)):
        cb.ico("cloud", c + Vector((random.uniform(-9, 9), random.uniform(-4, 4), random.uniform(-1.5, 2.5))),
               random.uniform(4, 7.5), (1.3, 1.0, 0.6), jitter=0.15)
    cb.build()

# the rest of the city: low-detail blocks around the neighbourhood (seen from the aerial shot),
# then taller towers on the horizon to the north. All outside the walkable ground.
city = Builder("city_ring")
GROUND_BOX = (-111, -131, 57, 111)  # blockout ground slab (x0, y0, x1, y1)
placed = 0
tries = 0
while placed < 260 and tries < 4000:
    tries += 1
    x, y = random.uniform(-330, 60), random.uniform(-380, 380)
    if GROUND_BOX[0] - 6 < x < GROUND_BOX[2] + 6 and GROUND_BOX[1] - 6 < y < GROUND_BOX[3] + 6:
        continue
    w, d = random.uniform(8, 14), random.uniform(8, 14)
    far = max(abs(x - 0) - 110, abs(y) - 120, 0)
    h = random.uniform(8, 16) + min(far, 200) * random.uniform(0.03, 0.12)
    key = random.choice(["bld_blue", "bld_salmon", "bld_mint", "bld_cream", "bld_cream"])
    city.box(key, (x, y, h / 2 - 0.34), (w, d, h))
    city.box("roof", (x, y, h - 0.3), (w + 0.4, d + 0.4, 0.3))
    for f in range(1, int(h // 3.2)):
        city.box("trim", (x, y, f * 3.2 - 0.34), (w + 0.12, d + 0.12, 0.14))
    if random.random() < 0.6:
        city.cyl("tank", (x + random.uniform(-2, 2), y + random.uniform(-2, 2), h - 0.2), 0.8, 1.2, seg=8)
    placed += 1
city.build()

sky = Builder("skyline")
for k in range(46):
    a = math.radians(random.uniform(25, 160))  # north / north-west arc
    r = random.uniform(420, 560)
    x, y = math.cos(a) * r - 40, math.sin(a) * r
    if x > 90:
        continue
    w, d, h = random.uniform(14, 26), random.uniform(14, 26), random.uniform(50, 130)
    rot = random.uniform(0, 1)
    sky.box(random.choice(["skyline", "skyline_b"]), (x, y, h / 2 - 1), (w, d, h), rot)
    for f in range(1, int(h // 9)):
        sky.box("trim", (x, y, f * 9), (w + 0.4, d + 0.4, 0.6), rot)
sky.build()

# ================================================================== 8. MARKERS FOR THE WEBSITE
# opening aerial shot: camera position and where it looks
empty("cam_intro", (-70.0, -58.0, 58.0), size=2.0)
empty("cam_intro_target", (12.0, 22.0, 0.0), size=2.0)

# spots where an animated animal loops in place (see 04_street_life.py for the models)
LIFE_SPOTS = [
    ("cow", "maidan", (-27.5, -33.5, 0.0), 0.9),
    ("cow", "bazaar", (-2.8, 67.0, 0.05), 1.5),
    ("dog", "chowk", (13.0, -7.0, 0.08), 2.4),
    ("dog", "seafront", (61.9, 36.0, 0.25), -1.5),
    ("pigeon", "chowk_a", (-6.8, 3.2, 0.09), 0.0),
    ("pigeon", "chowk_b", (-5.2, 4.9, 0.09), 1.4),
    ("pigeon", "chowk_c", (-6.5, 5.2, 0.09), 2.9),
    ("crow", "stall", (10.5, 6.0, 2.2), 0.7),
]
for kind, ident, p, r in LIFE_SPOTS:
    e = empty(f"life_{kind}__{ident}", p, {"kind": kind})
    e.rotation_euler[2] = r


def loop(name, kind, pts, count, speed, z=0.0):
    for i, (x, y) in enumerate(pts):
        props = {"kind": kind, "count": count, "speed": speed} if i == 0 else None
        empty(f"lifepath_{name}_{i:02d}", (x, y, z), props, size=0.4)


# traffic keeps to the left (Mumbai!) and away from the camera's route in the middle of the road
# (loops end before the route cuts across a road, so nothing drives through the camera)
loop("north_traffic", "taxi", [(4, 77.9), (40, 77.9), (42, 80), (40, 82.1), (4, 82.1), (2, 80)], 2, 7.0)
loop("north_autos", "auto", [(40, 82.1), (4, 82.1), (2, 80), (4, 77.9), (40, 77.9), (42, 80)], 1, 5.5)
loop("east_traffic", "taxi", [(18, -1.6), (54, -1.6), (55.5, 0), (54, 1.6), (18, 1.6), (16.5, 0)], 1, 6.5)
loop("east_autos", "auto", [(54, 1.6), (18, 1.6), (16.5, 0), (18, -1.6), (54, -1.6), (55.5, 0)], 1, 5.0)
loop("south_bus", "bus", [(34, -77.3), (-6, -77.3), (-8, -78.2), (-6, -79.1), (34, -79.1), (36, -78.2)], 1, 5.0)
loop("chowk_dogs", "dog", [(-9, -6), (-3, -11), (8, -12), (12, -3), (9, 9), (-4, 11), (-11, 4)], 2, 1.6, 0.08)
loop("promenade_dog", "dog", [(61.2, -70), (61.2, 70), (62.2, 70), (62.2, -70)], 1, 1.8, 0.25)
loop("birds_chowk", "bird", [(-30, -20), (10, -40), (40, -10), (30, 30), (-10, 40), (-40, 10)], 7, 9.0, 30.0)
loop("birds_intro", "bird", [(-60, -30), (-20, -60), (30, -20), (40, 40), (0, 60), (-50, 20)], 6, 11.0, 42.0)

# ground beyond the neighbourhood (below the playable ground, so it is never walkable)
gf = Builder("ground_far")
gf.box("ground", (-268, 0, -0.34), (664, 1300, 0.02))
gf.build()

print("Detail pass done:", len(detail_col.all_objects), "objects in collection 'detail'.")
