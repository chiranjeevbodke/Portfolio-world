"""
Mumbai portfolio world - 02 CAMERA FLY-THROUGH
-----------------------------------------------
Run AFTER 01_mumbai_world_blockout_v2.py, in the same file.
Scripting tab > New > paste > Run Script. Then press Numpad 0 and Space to play.

Preview of how the website's scroll will feel:
- the camera rides the route at eye height (1.7 m) on a smooth curve
- it slows down near display frames (like a visitor pausing on your work)
- it turns its head gently toward each frame as it passes, then looks ahead again

Tweak the settings below and re-run; it replaces the previous animation.
"""

import bpy
import math
from mathutils import Vector

# ------------------------------------------------------------------ settings
FPS = 24
CRUISE_SPEED = 7.0      # metres per second between zones
SLOW_FACTOR = 0.3       # speed near a frame = CRUISE_SPEED * SLOW_FACTOR
SLOW_NEAR = 6.0         # full slow-down when a frame is this close (m)
SLOW_FAR = 20.0         # starts slowing at this distance (m)
LOOK_AHEAD = 8.0        # how far ahead on the path the camera looks (m)
LOOK_AT_WORK = 0.65     # 0 = never turn to frames, 1 = stare at them
EYE_HEIGHT = 1.7
LENS_MM = 24

scene = bpy.context.scene

# ------------------------------------------------------------------ route
route = sorted((o for o in scene.objects if o.name.startswith("route_") and o.type == 'EMPTY'),
               key=lambda o: o.name)
if len(route) < 2:
    raise RuntimeError("No route_XX empties found. Run the blockout script first.")
pts = [Vector((o.location.x, o.location.y, EYE_HEIGHT)) for o in route]


def catmull_rom(p0, p1, p2, p3, t):
    t2, t3 = t * t, t * t * t
    return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2
                  + (-p0 + 3 * p1 - 3 * p2 + p3) * t3)


ext = [pts[0] + (pts[0] - pts[1])] + pts + [pts[-1] + (pts[-1] - pts[-2])]
dense = []
for i in range(1, len(ext) - 2):
    for k in range(30):
        dense.append(catmull_rom(ext[i - 1], ext[i], ext[i + 1], ext[i + 2], k / 30))
dense.append(pts[-1].copy())

dist = [0.0]
for a, b in zip(dense, dense[1:]):
    dist.append(dist[-1] + (b - a).length)
total_len = dist[-1]


def point_at(d):
    d = max(0.0, min(total_len, d))
    lo, hi = 0, len(dist) - 1
    while hi - lo > 1:
        mid = (lo + hi) // 2
        if dist[mid] <= d:
            lo = mid
        else:
            hi = mid
    seg = dist[hi] - dist[lo]
    t = 0 if seg == 0 else (d - dist[lo]) / seg
    return dense[lo].lerp(dense[hi], t)


# ------------------------------------------------------------------ display frames
slots = []
for o in scene.objects:
    if o.name.startswith("slot_") and o.type == 'MESH':
        corners = [o.matrix_world @ Vector(c) for c in o.bound_box]
        centre = sum(corners, Vector()) / 8
        slots.append(centre)


def smoothstep(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def nearest_slot_ahead(pos, forward):
    best, best_d = None, 1e9
    for c in slots:
        v = c - pos
        v2 = Vector((v.x, v.y, 0))
        d = v2.length
        if d < best_d and d > 0.01 and v2.normalized().dot(forward) > -0.2:
            best, best_d = c, d
    return best, best_d


# ------------------------------------------------------------------ timing (slow near work)
step = 0.5
times, t, d = [0.0], 0.0, 0.0
samples = [0.0]
while d < total_len:
    pos = point_at(d)
    fwd = point_at(d + 1.0) - pos
    fwd = Vector((fwd.x, fwd.y, 0)).normalized() if fwd.length > 0 else Vector((0, 1, 0))
    _, sd = nearest_slot_ahead(pos, fwd)
    speed = CRUISE_SPEED * (SLOW_FACTOR + (1 - SLOW_FACTOR) * smoothstep(SLOW_NEAR, SLOW_FAR, sd))
    ds = min(step, total_len - d)
    t += ds / speed
    d += ds
    times.append(t)
    samples.append(d)

duration = times[-1]
end_frame = int(math.ceil(duration * FPS)) + 1


def dist_at_time(tt):
    lo, hi = 0, len(times) - 1
    while hi - lo > 1:
        mid = (lo + hi) // 2
        if times[mid] <= tt:
            lo = mid
        else:
            hi = mid
    span = times[hi] - times[lo]
    f = 0 if span == 0 else (tt - times[lo]) / span
    return samples[lo] + (samples[hi] - samples[lo]) * f


# ------------------------------------------------------------------ camera + target
for name in ("cam_flythrough", "cam_target"):
    old = bpy.data.objects.get(name)
    if old:
        bpy.data.objects.remove(old, do_unlink=True)

cam_data = bpy.data.cameras.new("cam_flythrough")
cam_data.lens = LENS_MM
cam_data.clip_start = 0.1
cam_data.clip_end = 1000
cam = bpy.data.objects.new("cam_flythrough", cam_data)
scene.collection.objects.link(cam)

target = bpy.data.objects.new("cam_target", None)
target.empty_display_size = 0.4
scene.collection.objects.link(target)

con = cam.constraints.new('TRACK_TO')
con.target = target
con.track_axis = 'TRACK_NEGATIVE_Z'
con.up_axis = 'UP_Y'

smoothed_look = None
for f in range(1, end_frame + 1):
    tt = (f - 1) / FPS
    dd = dist_at_time(min(tt, duration))
    pos = point_at(dd)
    ahead = point_at(dd + LOOK_AHEAD)
    fwd = Vector((ahead.x - pos.x, ahead.y - pos.y, 0))
    fwd = fwd.normalized() if fwd.length > 0.01 else Vector((0, 1, 0))
    look = Vector((ahead.x, ahead.y, EYE_HEIGHT - 0.1))

    sc, sd = nearest_slot_ahead(pos, fwd)
    if sc is not None:
        w = LOOK_AT_WORK * (1 - smoothstep(SLOW_NEAR, SLOW_FAR, sd))
        look = look.lerp(sc, w)

    # soften head turns so the camera never snaps
    smoothed_look = look if smoothed_look is None else smoothed_look.lerp(look, 0.12)

    cam.location = pos
    target.location = smoothed_look
    cam.keyframe_insert("location", frame=f)
    target.keyframe_insert("location", frame=f)

# ------------------------------------------------------------------ scene setup
scene.render.fps = FPS
scene.frame_start = 1
scene.frame_end = end_frame
scene.frame_current = 1
scene.camera = cam

print(f"Route length: {total_len:.0f} m | duration: {duration:.0f} s | frames: {end_frame}")
print("Press Numpad 0 (camera view), then Space to play.")
