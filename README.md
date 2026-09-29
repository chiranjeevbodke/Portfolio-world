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
- `src/lib/config.ts` all tuning numbers (speeds, scroll feel, sky and sun colours)
