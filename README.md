# Portfolio world

A stylised low-poly Mumbai neighbourhood you explore at street level. The world is built in Blender
(`blender/`) and exported to `public/models/world.glb`; the site only reads it by naming convention:

- `slot_<zone>__<id>` meshes with custom props `slot_id`, `aspect`: display frames
- `route_00`, `route_01`, … empties: the scroll route (eye height 1.7 m)

Replace `world.glb` with a detailed export that keeps those names and everything keeps working.

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
- `src/lib/config.ts` all tuning numbers (speeds, scroll feel, sky and sun colours)

## Controls

- Scroll / swipe up-down / PageUp, PageDown, Space: walk the route (reverse to go back)
- Drag (mouse) or swipe sideways (touch): look around
- WASD or the joystick: leave the route and walk freely; arrows or joystick left/right turn; Shift runs
- Scroll again or "Back to the walk": ease back onto the route
- Map (top right): click a zone to travel there (on phones, tap the map first to open it)
