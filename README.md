# Portfolio world

A stylised low-poly Mumbai neighbourhood you explore at street level. The world is built in Blender
(`blender/`) and exported to `public/models/world.glb`; the site only reads it by naming convention:

- `slot_<zone>__<id>` meshes with custom props `slot_id`, `aspect`: display frames
- `route_00`, `route_01`, … empties: the scroll route (eye height 1.7 m)

Replace `world.glb` with a detailed export that keeps those names and everything keeps working.

## Rebuilding the world in Blender

1. New empty file → run `blender/01_mumbai_world_blockout_v3.py` (layout, frames, route)
2. Same file → run `blender/03_mumbai_world_detail.py` (buildings, trees, vehicles, animals, sea, sky, markers)
3. Export `public/models/world.glb`: glTF 2.0, +Y up, **Custom Properties** on, **Compression (Draco)** on
4. New empty file → run `blender/04_street_life.py`, export `public/models/life.glb`
   with **Custom Properties** on and **Animation mode: NLA Tracks** (animated taxis, autos, bus, dogs, cow, pigeons, crows, kites)

Markers the site reads from `world.glb` (all optional):
`cam_intro` / `cam_intro_target` (opening aerial shot), `life_<kind>__<id>` (an animal looping on a spot),
`lifepath_<name>_00, _01 …` (a loop that `count` copies of `kind` travel at `speed` m/s), `cloud_*` (drifting clouds).
`public/models/world_blockout.glb` is the original blockout, kept for reference.

## Live site

Deployed on Netlify: https://chiranjeev-portfolio-world.netlify.app (every push to the branch → redeploy).

- `/` the 3D neighbourhood · `/work` all projects in a grid · `/work/<slug>` a project page
- To add images or projects, see [CONTENT_GUIDE.md](CONTENT_GUIDE.md).

## Run locally

Needs Node 20+.

```bash
npm install
npm run dev        # http://localhost:5173 (also shown on your LAN address for phone testing)
npm run build      # production build in dist/
npm run preview    # serve the production build
```

## Where things live

- `src/world/parseWorld.ts` reads the GLB: finds slots and route, flat-shades and merges scenery
- `src/lib/routePath.ts` port of `blender/02_camera_flythrough.py` (path, slow-down, look-at-work)
- `src/world/CameraRig.tsx` moves the camera each frame
- `src/lib/walkGrid.ts` collisions: a 25 cm walkable grid generated from the loaded meshes
- `src/lib/rig.ts` free roam / back-to-route / map jumps (GSAP)
- `src/world/MapCapture.tsx` renders the mini-map from the world itself (top-down, once at load)
- `src/lib/scroll.ts` Lenis smooth scroll; page scroll position = position on the route
- `src/world/Frames.tsx` artwork on every frame, focus highlight, lazy image loading, click picking
- `src/content/projects.ts` reads `content_map.json` + `content/projects/*/project.json`
- `src/ui/ProjectPanel.tsx`, `src/ui/WorkPage.tsx` project page and `/work` grid
- `src/world/Life.tsx` places and animates street life from `life.glb` on the markers, drifts clouds
- `src/lib/config.ts` all tuning numbers (speeds, scroll feel, sky and sun colours)

## Controls

- The page opens on an aerial shot; the first scroll swoops down into the chowk
- Scroll / swipe up-down / PageUp, PageDown, Space: walk the route (reverse to go back)
- Click or tap a hoarding (or press Enter when its label shows): open the project
- Drag (mouse) or swipe sideways (touch): look around
- WASD or the joystick: leave the route and walk freely; arrows or joystick left/right turn; Shift runs
- Scroll again or "Back to the walk": ease back onto the route
- Map (top right): click a zone to travel there (on phones, tap the map first to open it)
