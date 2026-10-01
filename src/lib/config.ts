// Tuning values. The fly-through ones mirror blender/02_camera_flythrough.py
// so the site feels like the preview you approved in Blender.

export const EYE_HEIGHT = 1.7

export const FLY = {
  CRUISE_SPEED: 7.0, // m/s between zones
  SLOW_FACTOR: 0.3, // speed near a frame = CRUISE_SPEED * SLOW_FACTOR
  SLOW_NEAR: 6.0, // full slow-down when a frame is this close (m)
  SLOW_FAR: 20.0, // starts slowing at this distance (m)
  LOOK_AHEAD: 8.0, // how far ahead on the path the camera looks (m)
  LOOK_AT_WORK: 0.65, // 0 = never turn to frames, 1 = stare at them
  LOOK_SMOOTH_24FPS: 0.12, // Blender: smoothed_look.lerp(look, 0.12) per frame at 24 fps
  LENS_MM: 24,
  SENSOR_MM: 36,
}

// Scroll feel. Lenis eases a real page scroll; one fly-through second = PX_PER_SECOND of scrolling.
export const SCROLL = {
  PX_PER_SECOND: 80, // whole route ~13,000 px
  INTRO_SECONDS: 6, // the opening swoop from the aerial shot down to the street, in fly-through seconds
  LERP: 0.08, // Lenis wheel smoothing (lower = silkier)
  TOUCH_LERP: 0.075, // Lenis touch smoothing
  FOLLOW_RATE: 14, // camera catch-up with the eased scroll (1/s), just removes frame-to-frame noise
  LOOK_RATE: 3.2, // how quickly the head turns toward its target (1/s)
}

// Golden-hour look. Sun direction comes from the Blender sun (rot 68°, 0, -40°),
// converted to Y-up: it sits low in the south-west.
export const LOOK = {
  SUN_DIR: [-0.596, 0.375, 0.71] as [number, number, number],
  SUN_COLOR: '#ffcf9e',
  SUN_INTENSITY: 2.3,
  HEMI_SKY: '#ffe9d2',
  HEMI_GROUND: '#b39079',
  HEMI_INTENSITY: 2.35,
  SKY_ZENITH: '#7fa4cf',
  SKY_MID: '#e9b98f',
  SKY_HORIZON: '#ffd6a6',
  FOG_NEAR: 90,
  FOG_FAR: 340,
}

// Free roam
export const ROAM = {
  WALK_SPEED: 3.2, // m/s
  RUN_SPEED: 6.5, // m/s with Shift
  ACCEL: 7, // how quickly you get up to speed (1/s)
  DECEL: 9, // how quickly you stop (1/s)
  STRIDE: 0.8, // metres per step (head bob rhythm)
  BOB: 0.055, // head bob height (m)
  SWAY: 0.025, // side-to-side sway (m)
  TURN_SPEED: 1.9, // rad/s (arrow keys, joystick left/right)
  LOOK_PER_PX: 0.0035, // rad per pixel of drag
  OFFSET_RETURN_RATE: 0.9, // look-around on the route eases back as you scroll (per fly-through second scrolled)
}

// Draco decoder (self-hosted in public/draco/) for compressed .glb exports
export const DRACO = '/draco/'

// The city model (Meshopt-compressed) and its uncompressed fallback
export const WORLD_URL = '/models/world-city-v7.glb'
export const WORLD_FALLBACK_URL = '/models/world-city-v7-fallback.glb'
