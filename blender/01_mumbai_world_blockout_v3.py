"""
Mumbai portfolio world - 01 BLOCKOUT (v3)
v3: event stage (Aanandam, 26/11 Global Peace Honours, Entreprenaari), ice-cream cart,
    maidan snack stall, route detours past the stage. Project mapping lives in content_map.json.
v2: packaging-heavy bazaar + seafront, Maidan for sports events (ISPL cricket, ISL football),
    Akasa Air at the airport edge, pet food moved into the bazaar, route loops back to the chowk.
------------------------------------
Run in Blender: Scripting tab > New > paste > Run Script.
Use a NEW, EMPTY Blender file: this script deletes everything in the scene first.

Units: metres. Blender is Z-up (the glTF exporter converts to Y-up for the web).
Every display frame is a mesh named  slot_<zone>__<id>  with custom properties
"slot_id" and "aspect". The scroll route is saved as empties route_00, route_01...

This is a layout blockout (simple boxes), not final art. Check scale and layout,
then each zone gets its own detailed modelling script.
"""

import bpy
import bmesh
import math
import random
from mathutils import Matrix, Vector

random.seed(7)

# ------------------------------------------------------------------ reset
for o in list(bpy.data.objects):
    bpy.data.objects.remove(o, do_unlink=True)
for c in list(bpy.data.collections):
    bpy.data.collections.remove(c)

scene = bpy.context.scene
scene.unit_settings.system = 'METRIC'
scene.unit_settings.scale_length = 1.0

# ------------------------------------------------------------------ palette
PALETTE = {
    "ground":     (0.78, 0.72, 0.60),
    "road":       (0.36, 0.35, 0.37),
    "plaza":      (0.86, 0.80, 0.70),
    "sea":        (0.22, 0.58, 0.60),
    "promenade":  (0.88, 0.84, 0.76),
    "seawall":    (0.70, 0.66, 0.60),
    "grass":      (0.45, 0.62, 0.38),
    "runway":     (0.26, 0.26, 0.28),
    "bld_blue":   (0.62, 0.74, 0.82),
    "bld_salmon": (0.90, 0.62, 0.55),
    "bld_mint":   (0.66, 0.82, 0.70),
    "bld_cream":  (0.93, 0.88, 0.76),
    "studio":     (0.95, 0.80, 0.55),
    "roof":       (0.55, 0.45, 0.42),
    "tank":       (0.20, 0.20, 0.22),
    "tree":       (0.32, 0.52, 0.30),
    "trunk":      (0.42, 0.30, 0.22),
    "slot":       (0.97, 0.97, 0.95),
    "frame":      (0.15, 0.15, 0.16),
    "awning_a":   (0.85, 0.30, 0.28),
    "awning_b":   (0.95, 0.85, 0.55),
    "taxi_y":     (0.95, 0.78, 0.15),
    "taxi_k":     (0.08, 0.08, 0.08),
    "plane":      (0.95, 0.95, 0.96),
    "bench":      (0.50, 0.36, 0.25),
    "turf":       (0.30, 0.55, 0.30),
    "pitch":      (0.72, 0.60, 0.42),
    "white":      (0.95, 0.95, 0.95),
}
BUILDING_COLOURS = ["bld_blue", "bld_salmon", "bld_mint", "bld_cream"]

_mats = {}


def mat(key):
    if key in _mats:
        return _mats[key]
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
    _mats[key] = m
    return m


# ------------------------------------------------------------------ collections
_cols = {}


def col(name):
    if name in _cols:
        return _cols[name]
    c = bpy.data.collections.new(name)
    scene.collection.children.link(c)
    _cols[name] = c
    return c


# ------------------------------------------------------------------ helpers
def obj_from_bm(name, bm, material, collection, loc=(0, 0, 0), rot_z=0.0):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(mat(material))
    o = bpy.data.objects.new(name, me)
    o.location = loc
    o.rotation_euler[2] = rot_z
    col(collection).objects.link(o)
    return o


def box(name, loc, size, material, collection, rot_z=0.0):
    """loc = centre of the box's base (x, y, z). size = (sx, sy, sz)."""
    sx, sy, sz = size
    bm = bmesh.new()
    m = Matrix.Translation((0, 0, sz / 2)) @ Matrix.Diagonal((sx, sy, sz, 1))
    bmesh.ops.create_cube(bm, size=1.0, matrix=m)
    return obj_from_bm(name, bm, material, collection, loc, rot_z)


def cylinder(name, loc, radius, height, material, collection, segments=8):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=segments,
                          radius1=radius, radius2=radius, depth=height,
                          matrix=Matrix.Translation((0, 0, height / 2)))
    return obj_from_bm(name, bm, material, collection, loc)


def tree(name, loc, collection, palm=False):
    h = random.uniform(6, 9) if palm else random.uniform(5, 7)
    cylinder(name + "_trunk", loc, 0.25, h * 0.7, "trunk", collection, 6)
    bm = bmesh.new()
    squash = (1.4, 1.4, 0.5, 1) if palm else (1, 1, 0.75, 1)
    r = 1.3 if palm else h * 0.32
    m = Matrix.Translation((0, 0, h * 0.75)) @ Matrix.Diagonal(squash)
    bmesh.ops.create_icosphere(bm, subdivisions=1, radius=r, matrix=m)
    obj_from_bm(name + "_crown", bm, "tree", collection, loc)


def building(name, loc, size, rot_z, collection, material=None):
    material = material or random.choice(BUILDING_COLOURS)
    box(name, loc, size, material, collection, rot_z)
    box(name + "_roof", (loc[0], loc[1], size[2]),
        (size[0] + 0.6, size[1] + 0.6, 0.35), "roof", collection, rot_z)
    if random.random() < 0.6:
        cylinder(name + "_tank",
                 (loc[0] + random.uniform(-1.5, 1.5), loc[1] + random.uniform(-1.5, 1.5), size[2] + 0.35),
                 1.1, 1.6, "tank", collection)


def taxi(name, loc, rot_z, collection="props"):
    box(name + "_body", loc, (4.2, 1.8, 1.0), "taxi_y", collection, rot_z)
    box(name + "_cab", (loc[0], loc[1], loc[2] + 1.0), (2.2, 1.6, 0.7), "taxi_k", collection, rot_z)


SLOTS = []


def slot(zone, sid, loc, rot_deg, w, h, poles=False):
    """Display frame. loc = bottom-centre of the image (x, y, z).
    rot_deg = direction the image FACES: 0 = -Y (south), 90 = +X (east),
    180 = +Y (north), -90 = -X (west)."""
    r = math.radians(rot_deg)
    n = Vector((math.sin(r), -math.cos(r), 0))      # facing direction
    xdir = Vector((math.cos(r), math.sin(r), 0))    # image width direction
    base = Vector(loc)

    frame_c = base - n * 0.15
    box(f"frame_{zone}__{sid}", (frame_c.x, frame_c.y, base.z - 0.2),
        (w + 0.4, 0.2, h + 0.4), "frame", zone, r)

    bm = bmesh.new()
    verts = [bm.verts.new(v) for v in [(-w / 2, 0, 0), (w / 2, 0, 0), (w / 2, 0, h), (-w / 2, 0, h)]]
    face = bm.faces.new(verts)
    uv = bm.loops.layers.uv.new("UVMap")
    for loop, co in zip(face.loops, [(0, 0), (1, 0), (1, 1), (0, 1)]):
        loop[uv].uv = co
    o = obj_from_bm(f"slot_{zone}__{sid}", bm, "slot", zone, (base.x, base.y, base.z), r)
    o["slot_id"] = f"{zone}/{sid}"
    o["aspect"] = round(w / h, 3)

    if poles and base.z > 0.5:
        for i, s in enumerate((-1, 1)):
            p = frame_c - n * 0.25 + xdir * s * (w / 2 - 0.6)
            box(f"pole_{zone}__{sid}_{i}", (p.x, p.y, 0), (0.3, 0.3, base.z), "frame", zone, r)

    SLOTS.append((f"{zone}/{sid}", w, h))
    return o


# ================================================================== GROUND & SEA
box("ground", (-27, -10, -0.3), (166, 240, 0.3), "ground", "00_ground")

bm = bmesh.new()
sea_verts = [bm.verts.new(v) for v in [(64, -140, -0.4), (220, -140, -0.4), (220, 120, -0.4), (64, 120, -0.4)]]
bm.faces.new(sea_verts)
obj_from_bm("sea", bm, "sea", "00_ground")

# roads (thin slabs on the ground)
ROADS = [
    ("road_bazaar_lane", (0, 45), (8, 60)),
    ("road_north",       (29, 80), (58, 8)),
    ("road_east",        (35.5, 0), (41, 8)),
    ("road_south",       (23, -80), (66, 8)),
    ("road_maidan_link", (-10, -47.5), (8, 65)),
    ("road_art_street",  (-42, -24), (56, 6)),
]
for name, (x, y), (sx, sy) in ROADS:
    box(name, (x, y, 0), (sx, sy, 0.05), "road", "00_ground")

# ================================================================== 1. STUDIO CHOWK (start)
box("chowk_plaza", (0, 0, 0), (30, 30, 0.08), "plaza", "studio")
building("studio_building", (-20, 0, 0), (12, 16, 14), 0, "studio", material="studio")
slot("studio", "name-sign", (-13.85, 0, 9.5), 90, 12, 2.5)
slot("studio", "about-board", (6, 8, 0.8), 0, 3, 2)
box("chowk_signpost", (-2, 6, 0), (0.25, 0.25, 3.2), "trunk", "studio")
tree("chowk_tree_01", (9, -9, 0), "studio")
tree("chowk_tree_02", (-9, 11, 0), "studio")

# ================================================================== 2. BAZAAR LANE (packaging: snacks, biscuits, staples, pet food)
for i, y in enumerate(range(20, 72, 9)):
    for side, x, rot in ((-1, -9, 0), (1, 9, 0)):
        building(f"bazaar_shop_{i:02d}_{'L' if side < 0 else 'R'}",
                 (x, y, 0), (10, 8, random.uniform(9, 14)), rot, "bazaar")
        box(f"bazaar_awning_{i:02d}_{'L' if side < 0 else 'R'}",
            (x - side * 5.6, y, 2.8), (1.6, 7, 0.15),
            random.choice(["awning_a", "awning_b"]), "bazaar")
slot("bazaar", "shop-sign-01", (-3.9, 29, 3.4), 90, 5, 1.2)
slot("bazaar", "shop-sign-02", (3.9, 38, 3.4), -90, 5, 1.2)
slot("bazaar", "shop-sign-03", (-3.9, 47, 3.4), 90, 5, 1.2)
slot("bazaar", "shop-sign-04", (3.9, 56, 3.4), -90, 5, 1.2)
slot("bazaar", "stall-banner-01", (-2.6, 64, 1.6), 90, 2.4, 1.2)
slot("bazaar", "lane-end-hoarding", (0, 77, 4), 0, 12, 6, poles=True)
# shopfront window displays (packaging)
slot("bazaar", "shopfront-01", (-3.95, 24, 0.5), 90, 4, 2.2)
slot("bazaar", "shopfront-02", (3.95, 29, 0.5), -90, 4, 2.2)
slot("bazaar", "shopfront-03", (-3.95, 42, 0.5), 90, 4, 2.2)
slot("bazaar", "shopfront-04", (3.95, 47, 0.5), -90, 4, 2.2)
# pet shop (pet food packaging)
slot("bazaar", "pet-shop-sign", (3.9, 65, 3.4), -90, 5, 1.2)
slot("bazaar", "pet-shopfront", (3.95, 60, 0.5), -90, 4, 2.2)
taxi("taxi_bazaar", (2.6, 32, 0), math.radians(90))

# filler blocks between bazaar and seafront
for i in range(8):
    building(f"filler_{i:02d}", (random.uniform(22, 46), random.uniform(16, 70), 0),
             (random.uniform(8, 12), random.uniform(8, 12), random.uniform(10, 18)), 0, "props")
for i, x in enumerate(range(8, 52, 11)):
    building(f"north_row_{i:02d}", (x, 90, 0), (10, 10, random.uniform(10, 15)), 0, "props")
for i, x in enumerate(range(20, 52, 10)):
    building(f"east_row_N_{i:02d}", (x, 10, 0), (8, 8, random.uniform(9, 13)), 0, "props")
    building(f"east_row_S_{i:02d}", (x, -10, 0), (8, 8, random.uniform(9, 13)), 0, "props")

# ================================================================== 3. SEAFRONT PROMENADE (packaging: soft drinks, low-alcohol beverages)
box("promenade", (60, -3, 0), (8, 174, 0.25), "promenade", "seafront")
box("seawall", (64.6, -3, -0.5), (1.2, 174, 1.4), "seawall", "seafront")
for i, y in enumerate(range(-80, 81, 16)):
    tree(f"palm_{i:02d}", (57.3, y, 0.25), "seafront", palm=True)
box("drinks_stall", (59, 20, 0.25), (3, 4, 2.6), "awning_a", "seafront")
slot("seafront", "stall-banner", (59, 17.85, 1.9), 0, 3, 0.8)
slot("seafront", "hoarding-01", (54.8, 40, 3), 90, 10, 5, poles=True)
slot("seafront", "hoarding-02", (54.8, -30, 3), 90, 10, 5, poles=True)
slot("seafront", "hoarding-03", (54.8, 62, 3), 90, 10, 5, poles=True)
box("seaside_shack", (59, -45, 0.25), (4, 5, 3), "bld_mint", "seafront")
slot("seafront", "shack-menu-board", (59, -47.65, 1.0), 0, 2.4, 1.6)
box("icecream_cart", (58, 8, 0.25), (2.2, 1.2, 1.1), "white", "seafront")
box("icecream_umbrella_pole", (58, 8, 1.35), (0.1, 0.1, 1.6), "frame", "seafront")
cylinder("icecream_umbrella", (58, 8, 2.95), 1.6, 0.15, "awning_a", "seafront", 8)
slot("seafront", "icecream-cart", (58, 8.65, 0.45), 180, 2.0, 0.8)

# ================================================================== 4. AIRPORT EDGE (Akasa Air branding)
box("runway", (20, -110, 0), (80, 14, 0.06), "runway", "airport")
building("terminal", (10, -94, 0), (24, 10, 8), 0, "airport", material="bld_cream")
slot("airport", "terminal-hoarding", (10, -88.8, 8.6), 180, 12, 4)
slot("airport", "gate-screen", (-1, -88.95, 1.2), 180, 2.4, 1.4)
box("plane_fuselage", (45, -110, 1.2), (18, 3, 3), "plane", "airport")
box("plane_wings", (46, -110, 2.2), (4, 18, 0.4), "plane", "airport")
box("plane_tail", (37, -110, 4.2), (2.5, 0.4, 3.5), "plane", "airport")
slot("airport", "plane-livery", (45, -108.4, 1.7), 180, 10, 2.2)
box("boarding_kiosk", (4, -88.6, 0), (1.2, 0.6, 2.6), "frame", "airport")
slot("airport", "boarding-kiosk", (4, -88.25, 0.9), 180, 1.0, 1.6)
taxi("taxi_airport", (20, -77.5, 0), 0)

# ================================================================== 5. MAIDAN (sports & events: ISPL, ISL, event stage)
box("maidan_ground", (-50, -62, 0), (60, 44, 0.1), "grass", "maidan")
for i in range(6):
    tree(f"maidan_tree_W_{i:02d}", (-83 + random.uniform(-0.5, 0.5), random.uniform(-82, -42), 0.1), "maidan")
for i in range(5):
    tree(f"maidan_tree_N_{i:02d}", (random.uniform(-58, -25), -37.5, 0.1), "maidan")

# --- ISPL cricket (west half)
box("ispl_pitch", (-65, -62, 0.1), (3, 20, 0.04), "pitch", "maidan")
for end_y in (-52, -72):
    for dx in (-0.2, 0, 0.2):
        box(f"ispl_stump_{end_y}_{dx}", (-65 + dx, end_y, 0.14), (0.05, 0.05, 0.7), "white", "maidan")
slot("maidan", "ispl-scoreboard", (-65, -40.5, 3), 0, 10, 5, poles=True)
slot("maidan", "ispl-boundary-west", (-79.4, -62, 0.1), 90, 10, 1.2)
slot("maidan", "ispl-boundary-south", (-65, -84.3, 0.1), 0, 10, 1.2)

# --- ISL football (east half)
box("isl_turf", (-34, -62, 0.1), (24, 34, 0.04), "turf", "maidan")
for gy, tag in ((-45.5, "N"), (-78.5, "S")):
    box(f"isl_goal_{tag}_L", (-37.5, gy, 0.14), (0.15, 0.15, 2.4), "white", "maidan")
    box(f"isl_goal_{tag}_R", (-30.5, gy, 0.14), (0.15, 0.15, 2.4), "white", "maidan")
    box(f"isl_goal_{tag}_bar", (-34, gy, 2.54), (7.15, 0.15, 0.15), "white", "maidan")
for i, (fx, fy) in enumerate(((-47, -45), (-21, -45), (-47, -79), (-21, -79))):
    box(f"isl_floodlight_{i}", (fx, fy, 0.1), (0.5, 0.5, 16), "frame", "maidan")
    box(f"isl_floodlight_{i}_lamp", (fx, fy, 16.1), (2.5, 0.8, 1.4), "white", "maidan")
slot("maidan", "isl-led-north", (-34, -44.3, 0.1), 0, 14, 1.2)
slot("maidan", "isl-led-south", (-34, -79.7, 0.1), 180, 14, 1.2)
slot("maidan", "isl-hoarding", (-48.5, -52, 3), 90, 10, 5, poles=True)

# --- snack stall by the football turf (Alan's Chips FIFA edition)
box("maidan_snack_stall", (-19, -72, 0.1), (3, 3, 2.6), "awning_b", "maidan")
slot("maidan", "snack-stall", (-17.45, -72, 1.6), 90, 2.6, 1.0)

# --- event stage, south of the maidan (Aanandam, 26/11 Global Peace Honours, Entreprenaari)
box("event_ground", (-50, -94, 0), (40, 20, 0.08), "plaza", "maidan")
box("event_stage", (-50, -97, 0.08), (24, 8, 1.2), "frame", "maidan")
box("event_stage_wall", (-50, -100.8, 1.28), (24, 1, 8), "frame", "maidan")
slot("maidan", "event-stage-screen", (-50, -100.25, 2.2), 180, 16, 6.5)
slot("maidan", "event-side-screen-L", (-66, -95, 1.5), 180, 4, 6, poles=True)
slot("maidan", "event-side-screen-R", (-34, -95, 1.5), 180, 4, 6, poles=True)

# ================================================================== 6. ART STREET (illustrations)
for sid, x, w in (("mural-01", -25, 8), ("mural-02", -45, 10)):
    box(f"wall_{sid}", (x, -19.8, 0), (w + 2, 1, 5.5), "bld_cream", "art")
    slot("art", sid, (x, -20.45, 0.6), 0, w, 4)
box("wall_mural-03", (-35, -28.2, 0), (10, 1, 5.5), "bld_salmon", "art")
slot("art", "mural-03", (-35, -27.55, 0.6), 180, 8, 4)
building("gallery", (-62, -15, 0), (12, 8, 6), 0, "art", material="bld_blue")
slot("art", "gallery-window", (-62, -19.15, 1.0), 0, 6, 3)

# ================================================================== SCROLL ROUTE (eye height 1.7 m)
ROUTE = [
    (6, -10), (0, 5), (0, 40), (0, 74), (10, 80), (45, 80), (60, 70),
    (60, 30), (60, -10), (60, -60), (55, -80), (30, -84), (5, -84),
    (-12, -75), (-20, -62), (-45, -62), (-49, -72), (-50, -88), (-64, -89),
    (-75, -78), (-74.5, -46), (-68, -30), (-60, -24), (-35, -24), (-18, -20), (-4, -8),
]
cd = bpy.data.curves.new("scroll_route", 'CURVE')
cd.dimensions = '3D'
sp = cd.splines.new('POLY')
sp.points.add(len(ROUTE) - 1)
for p, (x, y) in zip(sp.points, ROUTE):
    p.co = (x, y, 1.7, 1)
col("route").objects.link(bpy.data.objects.new("scroll_route", cd))
for i, (x, y) in enumerate(ROUTE):
    e = bpy.data.objects.new(f"route_{i:02d}", None)
    e.location = (x, y, 1.7)
    e.empty_display_size = 0.8
    col("route").objects.link(e)

# ================================================================== CAMERA, SUN, SKY
cam_data = bpy.data.cameras.new("cam_start")
cam_data.lens = 24
cam = bpy.data.objects.new("cam_start", cam_data)
cam.location = (6, -10, 1.7)
cam.rotation_euler = (math.radians(90), 0, math.atan2(6, 15))
col("route").objects.link(cam)
scene.camera = cam

sun_data = bpy.data.lights.new("sun_golden_hour", 'SUN')
sun_data.energy = 3.5
sun_data.color = (1.0, 0.85, 0.68)
sun = bpy.data.objects.new("sun_golden_hour", sun_data)
sun.rotation_euler = (math.radians(68), 0, math.radians(-40))
col("route").objects.link(sun)

world = scene.world or bpy.data.worlds.new("World")
scene.world = world
world.color = (0.90, 0.76, 0.66)
try:
    world.use_nodes = True
except Exception:
    pass
if world.node_tree:
    bg = world.node_tree.nodes.get("Background")
    if bg:
        bg.inputs[0].default_value = (0.90, 0.76, 0.66, 1.0)

# ================================================================== REPORT
print("\n=== Display slots (id, width m, height m, aspect) ===")
for sid, w, h in SLOTS:
    print(f"{sid:32s} {w:5.1f} x {h:4.1f}   aspect {w / h:.2f}")
print(f"Total slots: {len(SLOTS)}")
print(f"Objects: {len(bpy.data.objects)}")
print("Blockout done.")
