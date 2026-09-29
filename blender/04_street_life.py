"""
Mumbai portfolio world - 04 STREET LIFE (animated props)
--------------------------------------------------------
Run in a NEW, EMPTY Blender file (it deletes everything in the scene first).
Then export: File > Export > glTF 2.0 as  public/models/life.glb  with
  Include > Custom Properties ON
  Animation > Mode: "NLA Tracks"
(or run it from the command line, see the bottom of this file).

Builds one small animated model per kind, each under an empty named proto_<kind>:
  taxi, auto, bus    wheels turn          clip  <kind>_drive
  dog                walk / sit idle      clips dog_walk, dog_idle
  cow                grazing idle         clip  cow_idle
  pigeon             pecking              clip  pigeon_peck
  crow               looking around       clip  crow_idle
  bird (black kite)  flapping + gliding   clip  bird_fly

Models face +X (forward) in Blender. The website places copies of them where
03_mumbai_world_detail.py put markers:
  life_<kind>__<id>             a copy loops its idle clip on that spot
  lifepath_<name>_00, _01 ...   copies move along the loop playing their walk / drive clip
Change the look here, re-export life.glb, and the website picks it up.
"""

import bpy
import bmesh
import math
from mathutils import Matrix, Vector

FPS = 24

for o in list(bpy.data.objects):
    bpy.data.objects.remove(o, do_unlink=True)
for a in list(bpy.data.actions):
    bpy.data.actions.remove(a)
scene = bpy.context.scene
scene.render.fps = FPS

PALETTE = {
    "taxi_y": (0.95, 0.78, 0.15), "taxi_k": (0.06, 0.06, 0.06), "glass": (0.16, 0.20, 0.24),
    "chrome": (0.75, 0.76, 0.78), "tyre": (0.05, 0.05, 0.05), "hub": (0.55, 0.55, 0.57),
    "bus_red": (0.78, 0.12, 0.10), "bus_cream": (0.95, 0.90, 0.78), "rail": (0.22, 0.22, 0.23),
    "dog": (0.72, 0.52, 0.32), "dog_light": (0.90, 0.80, 0.62), "nose": (0.08, 0.06, 0.05),
    "cow": (0.92, 0.90, 0.86), "cow_grey": (0.70, 0.68, 0.66), "horn": (0.40, 0.34, 0.28),
    "pigeon": (0.55, 0.57, 0.62), "pigeon_neck": (0.38, 0.52, 0.50), "beak": (0.85, 0.55, 0.25),
    "crow": (0.10, 0.10, 0.12), "crow_grey": (0.30, 0.30, 0.32),
    "kite": (0.36, 0.25, 0.16), "kite_light": (0.60, 0.45, 0.30),
}
_mats = {}


def mat(key):
    if key not in _mats:
        m = bpy.data.materials.new("L_" + key)
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
    return _mats[key]


class Part:
    """One animatable piece: shapes added in the part's local space (origin = pivot)."""

    def __init__(self, name, parent, pivot=(0, 0, 0)):
        self.name, self.parent, self.pivot = name, parent, pivot
        self.bms = {}

    def _bm(self, key):
        return self.bms.setdefault(key, bmesh.new())

    def box(self, key, c, s, rot=None):
        m = Matrix.Translation(c) @ (rot or Matrix.Identity(4)) @ Matrix.Diagonal((*s, 1))
        bmesh.ops.create_cube(self._bm(key), size=1.0, matrix=m)
        return self

    def ico(self, key, c, r, s=(1, 1, 1)):
        bmesh.ops.create_icosphere(self._bm(key), subdivisions=1, radius=r, matrix=Matrix.Translation(c) @ Matrix.Diagonal((*s, 1)))
        return self

    def cyl(self, key, c, r, h, axis='Y', seg=10):
        rot = {'X': Matrix.Rotation(math.pi / 2, 4, 'Y'), 'Y': Matrix.Rotation(math.pi / 2, 4, 'X'), 'Z': Matrix.Identity(4)}[axis]
        bmesh.ops.create_cone(self._bm(key), cap_ends=True, cap_tris=False, segments=seg, radius1=r, radius2=r, depth=h,
                              matrix=Matrix.Translation(c) @ rot)
        return self

    def done(self):
        me = bpy.data.meshes.new(self.name)
        bm = bmesh.new()
        for key, part in self.bms.items():
            idx = len(me.materials)
            me.materials.append(mat(key))
            part.faces.ensure_lookup_table()
            for f in part.faces:
                f.material_index = idx
            tmp = bpy.data.meshes.new("tmp")
            part.to_mesh(tmp)
            bm.from_mesh(tmp)
            bpy.data.meshes.remove(tmp)
            part.free()
        bm.to_mesh(me)
        bm.free()
        o = bpy.data.objects.new(self.name, me)
        scene.collection.objects.link(o)
        o.parent = self.parent
        o.location = self.pivot
        return o


def proto(kind, x):
    root = bpy.data.objects.new(f"proto_{kind}", None)
    root.location = (x, 0, 0)
    root["kind"] = kind
    scene.collection.objects.link(root)
    return root


def animate(clip, obj, keys, prop="rotation_euler", index=None, cyclic=True):
    """keys: list of (frame, value). Pushed to an NLA track named <clip> so all parts share one glTF animation."""
    ad = obj.animation_data or obj.animation_data_create()
    ad.action = None
    base = list(getattr(obj, prop))
    for f, v in keys:
        vals = list(base)
        if index is None:
            vals = list(v)
        else:
            vals[index] = v
        setattr(obj, prop, vals)
        obj.keyframe_insert(prop, frame=f)
    setattr(obj, prop, base)
    act = ad.action
    act.name = f"{clip}__{obj.name}"
    for fc in getattr(act, "fcurves", []):
        for kp in fc.keyframe_points:
            kp.interpolation = 'BEZIER' if not cyclic else 'LINEAR' if prop == "rotation_euler" and index == 0 and "wheel" in obj.name else 'BEZIER'
    track = ad.nla_tracks.new()
    track.name = clip
    track.strips.new(act.name, int(keys[0][0]), act)
    ad.action = None


def swing(clip, obj, axis, amp, period, phase=0.0, steps=8):
    idx = "XYZ".index(axis)
    keys = []
    for k in range(steps + 1):
        f = 1 + period * k / steps
        keys.append((f, math.sin(math.tau * (k / steps + phase)) * amp))
    animate(clip, obj, keys, index=idx)


def spin(clip, obj, axis, period):
    idx = "XYZ".index(axis)
    animate(clip, obj, [(1, 0.0), (1 + period / 2, -math.pi), (1 + period, -math.tau)], index=idx)


# ================================================================== vehicles
def wheel(name, parent, pos, r, w):
    return Part(name, parent, pos).cyl("tyre", (0, 0, 0), r, w).cyl("hub", (0, 0, 0), r * 0.45, w + 0.02).box("hub", (0, 0, 0), (r * 1.3, w + 0.03, 0.08)).done()


root = proto("taxi", 0)
Part("taxi_body", root).box("taxi_k", (0, 0, 0.62), (4.0, 1.6, 0.62)).box("taxi_k", (1.55, 0, 0.9), (0.9, 1.55, 0.1)) \
    .box("glass", (-0.15, 0, 1.2), (2.1, 1.45, 0.5)).box("taxi_y", (-0.15, 0, 1.5), (2.0, 1.45, 0.1)) \
    .box("taxi_y", (-0.15, 0, 1.62), (0.5, 0.25, 0.16)).box("chrome", (2.03, 0, 0.5), (0.08, 1.5, 0.15)) \
    .box("chrome", (-2.03, 0, 0.5), (0.08, 1.5, 0.15)).box("taxi_y", (2.02, 0.55, 0.72), (0.05, 0.25, 0.14)) \
    .box("taxi_y", (2.02, -0.55, 0.72), (0.05, 0.25, 0.14)).done()
for i, (x, y) in enumerate(((1.3, 0.72), (1.3, -0.72), (-1.3, 0.72), (-1.3, -0.72))):
    spin("taxi_drive", wheel(f"taxi_wheel_{i}", root, (x, y, 0.32), 0.32, 0.22), 'Y', FPS)

root = proto("auto", 8)
Part("auto_body", root).box("taxi_k", (0, 0, 0.55), (2.4, 1.3, 0.5)).box("taxi_k", (1.15, 0, 0.9), (0.3, 0.9, 0.9)) \
    .box("glass", (1.2, 0, 1.45), (0.08, 0.95, 0.5)).box("taxi_y", (-0.1, 0, 1.75), (2.3, 1.35, 0.1)) \
    .box("taxi_y", (-1.2, 0, 1.2), (0.1, 1.3, 1.0)).box("rail", (0.55, 0.6, 1.3), (0.05, 0.05, 0.9)) \
    .box("rail", (0.55, -0.6, 1.3), (0.05, 0.05, 0.9)).box("taxi_y", (-0.6, 0, 0.95), (1.0, 1.1, 0.35)).done()
for i, (x, y) in enumerate(((1.0, 0), (-0.8, 0.62), (-0.8, -0.62))):
    spin("auto_drive", wheel(f"auto_wheel_{i}", root, (x, y, 0.25), 0.25, 0.16), 'Y', FPS * 0.8)

root = proto("bus", 16)
Part("bus_body", root).box("bus_red", (0, 0, 1.65), (10.5, 2.5, 2.6)).box("bus_cream", (0, 0, 2.3), (10.55, 2.55, 0.9)) \
    .box("glass", (0, 0, 2.3), (10.0, 2.58, 0.7)).box("glass", (5.27, 0, 2.0), (0.05, 2.2, 1.3)) \
    .box("bus_red", (0, 0, 3.0), (10.3, 2.4, 0.12)).box("bus_cream", (5.26, 0, 3.15), (0.05, 1.6, 0.3)).done()
for i, (x, y) in enumerate(((3.6, 1.2), (3.6, -1.2), (-3.4, 1.2), (-3.4, -1.2))):
    spin("bus_drive", wheel(f"bus_wheel_{i}", root, (x, y, 0.5), 0.5, 0.3), 'Y', FPS * 1.4)

# ================================================================== animals
root = proto("dog", 30)
dog_body = Part("dog_body", root, (0, 0, 0.5)).ico("dog", (0, 0, 0), 0.3, (1.6, 0.8, 0.75)).ico("dog_light", (0.12, 0, -0.1), 0.2, (1.4, 0.7, 0.6)).done()
dog_head = Part("dog_head", dog_body, (0.45, 0, 0.2)).ico("dog", (0.1, 0, 0.05), 0.17, (1.1, 0.95, 0.95)) \
    .box("dog", (0.3, 0, 0.0), (0.2, 0.14, 0.12)).box("nose", (0.41, 0, 0.02), (0.04, 0.06, 0.05)) \
    .box("dog", (0.02, 0.09, 0.2), (0.06, 0.05, 0.14)).box("dog", (0.02, -0.09, 0.2), (0.06, 0.05, 0.14)).done()
dog_tail = Part("dog_tail", dog_body, (-0.45, 0, 0.08)).box("dog", (-0.15, 0, 0.1), (0.32, 0.06, 0.06), Matrix.Rotation(0.6, 4, 'Y')).done()
dog_legs = []
for i, (x, y) in enumerate(((0.28, 0.12), (0.28, -0.12), (-0.28, 0.12), (-0.28, -0.12))):
    dog_legs.append(Part(f"dog_leg_{i}", dog_body, (x, y, -0.1)).box("dog", (0, 0, -0.2), (0.09, 0.09, 0.42)).done())
P = FPS * 0.6
for i, leg in enumerate(dog_legs):
    swing("dog_walk", leg, 'Y', 0.45, P, phase=0.5 * ((i % 2) ^ (i // 2)))
swing("dog_walk", dog_tail, 'Z', 0.5, P / 2)
swing("dog_walk", dog_head, 'Y', 0.06, P / 2)
swing("dog_walk", dog_body, 'X', 0.03, P)
# idle: sitting, looking around, tail wagging
swing("dog_idle", dog_head, 'Z', 0.5, FPS * 4, steps=8)
swing("dog_idle", dog_tail, 'Z', 0.6, FPS * 0.5)

root = proto("cow", 40)
cow_body = Part("cow_body", root, (0, 0, 1.05)).ico("cow", (0, 0, 0), 0.62, (1.75, 0.85, 0.75)).ico("cow", (0.45, 0, 0.42), 0.24, (1, 0.9, 0.9)).done()
cow_head = Part("cow_head", cow_body, (0.95, 0, 0.1)).ico("cow", (0.22, 0, -0.05), 0.24, (1.4, 0.8, 0.9)) \
    .box("cow_grey", (0.5, 0, -0.12), (0.18, 0.26, 0.2)).box("horn", (0.18, 0.16, 0.26), (0.06, 0.06, 0.3)) \
    .box("horn", (0.18, -0.16, 0.26), (0.06, 0.06, 0.3)).box("cow", (0.12, 0.25, 0.08), (0.08, 0.2, 0.06)) \
    .box("cow", (0.12, -0.25, 0.08), (0.08, 0.2, 0.06)).done()
cow_tail = Part("cow_tail", cow_body, (-1.05, 0, 0.2)).box("cow", (0, 0, -0.35), (0.05, 0.05, 0.7)).box("cow_grey", (0, 0, -0.75), (0.1, 0.1, 0.15)).done()
for i, (x, y) in enumerate(((0.6, 0.25), (0.6, -0.25), (-0.6, 0.25), (-0.6, -0.25))):
    Part(f"cow_leg_{i}", cow_body, (x, y, -0.3)).box("cow", (0, 0, -0.38), (0.14, 0.14, 0.78)).box("cow_grey", (0, 0, -0.76), (0.15, 0.15, 0.06)).done()
animate("cow_idle", cow_head, [(1, 0.0), (FPS * 1.5, 0.55), (FPS * 3, 0.5), (FPS * 3.6, 0.1), (FPS * 5, -0.05), (FPS * 6, 0.0)], index=1)
swing("cow_idle", cow_tail, 'X', 0.35, FPS * 6, steps=12)

root = proto("pigeon", 50)
pb = Part("pigeon_body", root, (0, 0, 0.12)).ico("pigeon", (0, 0, 0), 0.11, (1.5, 0.95, 0.9)).box("pigeon", (-0.2, 0, 0.02), (0.18, 0.1, 0.03)).done()
ph = Part("pigeon_head", pb, (0.12, 0, 0.06)).ico("pigeon_neck", (0.02, 0, 0.04), 0.06).ico("pigeon", (0.05, 0, 0.1), 0.05).box("beak", (0.1, 0, 0.1), (0.04, 0.015, 0.015)).done()
for s in (1, -1):
    Part(f"pigeon_leg_{s}", pb, (0.0, s * 0.04, -0.08)).box("beak", (0, 0, -0.03), (0.02, 0.02, 0.06)).done()
animate("pigeon_peck", ph, [(1, 0.0), (8, 0.0), (11, 0.9), (14, 0.0), (20, 0.0), (23, 0.9), (26, 0.0), (48, 0.0)], index=1)
animate("pigeon_peck", pb, [(1, 0.0), (9, 0.2), (14, 0.0), (21, 0.2), (26, 0.0), (48, 0.0)], index=1)

root = proto("crow", 55)
cb = Part("crow_body", root, (0, 0, 0.18)).ico("crow", (0, 0, 0), 0.14, (1.5, 0.9, 0.9)).box("crow", (-0.25, 0, 0.0), (0.2, 0.1, 0.03)).done()
ch = Part("crow_head", cb, (0.16, 0, 0.1)).ico("crow_grey", (0, 0, 0), 0.08).box("crow", (0.1, 0, -0.01), (0.09, 0.03, 0.03)).done()
for s in (1, -1):
    Part(f"crow_leg_{s}", cb, (0, s * 0.05, -0.1)).box("crow", (0, 0, -0.04), (0.02, 0.02, 0.08)).done()
animate("crow_idle", ch, [(1, 0.0), (18, 0.0), (22, 0.8), (40, 0.8), (44, -0.6), (60, -0.6), (64, 0.0), (72, 0.0)], index=2)

root = proto("bird", 60)  # black kite, circling
kb = Part("bird_body", root).ico("kite", (0, 0, 0), 0.22, (2.0, 0.8, 0.7)).box("kite_light", (-0.55, 0, 0), (0.4, 0.35, 0.04)).done()
for s in (1, -1):
    w = Part(f"bird_wing_{s}", kb, (0.05, s * 0.12, 0.05)).box("kite", (0, s * 0.6, 0), (0.45, 1.2, 0.03)).box("kite_light", (-0.05, s * 1.25, 0), (0.3, 0.3, 0.025)).done()
    animate("bird_fly", w, [(1, 0.0), (6, s * 0.55), (12, 0.0), (18, s * -0.35), (24, 0.0), (48, 0.0), (72, 0.0)], index=0)

scene.frame_start, scene.frame_end = 1, FPS * 6
print("Street life built:", [o.name for o in bpy.data.objects if o.name.startswith("proto_")])

# Command line:  blender -b --python 04_street_life.py -- /path/to/public/models/life.glb
import sys
if "--" in sys.argv:
    out = sys.argv[sys.argv.index("--") + 1]
    bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_extras=True, export_yup=True,
                              export_animations=True, export_animation_mode='NLA_TRACKS', export_cameras=False, export_lights=False)
    print("exported", out)
