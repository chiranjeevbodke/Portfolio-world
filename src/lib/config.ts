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

// Scroll feel. One "second" = one second of the Blender fly-through.
export const SCROLL = {
  SECONDS_PER_WHEEL_PX: 0.012, // mouse wheel / trackpad
  SECONDS_PER_TOUCH_PX: 0.035, // vertical swipe on touch screens
  SECONDS_PER_KEY: 1.6, // PageUp / PageDown / Space
  FOLLOW_RATE: 4.0, // how quickly the camera catches up with the scroll (1/s)
  FLING_DECAY: 3.5, // touch momentum decay (1/s)
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
  WALK_SPEED: 4.0, // m/s
  RUN_SPEED: 8.0, // m/s with Shift
  TURN_SPEED: 1.9, // rad/s (arrow keys, joystick left/right)
  LOOK_PER_PX: 0.0035, // rad per pixel of drag
  OFFSET_RETURN_RATE: 2.5, // how fast a look-around on the route eases back while scrolling (1/s)
}
