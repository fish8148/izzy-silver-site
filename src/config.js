/**
 * Central tuning knobs. Clip names must match the names embedded in character.glb
 * (see `npm run prep:character`). Change a value here, not deep in the logic.
 */

// Which GLB clip backs each state.
export const CLIPS = {
  idle: 'happy idle',
  wave: 'waving',
  spin: 'hurricane kick',
  tread: 'treading water',
};

// Clicking the character walks through these "resting" states in order, then wraps. (Treading water isn't in it: he only
// does that after swimming in, and a click ends it.)
export const REST_CYCLE = ['idle', 'wave', 'spin'];

// The launch wave repeats this many times. At the slower wave speed below one loop takes ~1.1 s, so 3 loops is about
// 3.4 seconds of waving.
export const INTRO_WAVE_LOOPS = 3;

// Playback speed of each resting state (1 = the clip's own speed, lower = slower). The wave clip is very quick
// on its own, so it plays at half speed; the hurricane kick is a little under two-thirds.
export const SPEED = { idle: 1, wave: 0.5, spin: 0.6, tread: 1 };

// Entrances: how the character arrives. Each plays once and then settles into idle.
//   clip     the GLB clip
//   loops    how many times to play it (default 1)
//   speed    playback speed (default 1)
//   anchor   for clips that carry their own travel (a swing, a climb): pin the LAST frame to the centre of the screen.
//            'xyz' pins the spot and the height of the feet (a climb ends standing on a ledge, which becomes the floor),
//            'xz' pins the spot only (a swimmer stays up at swimming height)
//   travel   for the moonwalk: the clip plays in place, so the code slides it in from off-screen; it faces away from
//            the centre and glides backwards, like the real thing. `speed` is the glide (m/s: the clip repeats as many
//            times as it takes to cover the distance), `ease` how long it takes to slow to a stop (s), `margin` how far
//            past the screen edge it starts (m), `yaw` how far it turns from the camera (degrees)
//   settle   seconds to blend into idle afterwards (default ENTRANCE_SETTLE)
//   after    the rest state to end in (default idle). The swim ends treading water, and stays there until he's clicked.
//   rest     which rest state a click should carry on from while this one is playing (default idle)
export const ENTRANCES = {
  wave: { clip: 'waving', loops: INTRO_WAVE_LOOPS, speed: SPEED.wave, rest: 'wave' },
  salute: { clip: 'saluting' },
  swing: { clip: 'swing to land', anchor: 'xyz', settle: 0.6 },
  moonwalk: { clip: 'moonwalking', travel: { speed: 0.85, ease: 0.7, margin: 0.8, yaw: 90 }, settle: 0.6 },
  swim: { clip: 'swimming', anchor: 'xz', settle: 0.8, after: 'tread' },
  climb: { clip: 'freehang climb', anchor: 'xyz', settle: 0.5 },
};

// The first time the home screen appears he greets you with one of these, then settles into idle. It's picked at random but
// never the same as last time (remembered across reloads), so reloading the page gives a different one. Each time you come
// back from a page, one of the others.
export const FIRST_ENTRANCES = ['wave', 'salute'];
export const RETURN_ENTRANCES = ['swing', 'moonwalk', 'swim', 'climb'];

// Idle actions: after this many seconds standing in idle he does one of these, then goes back to idle (and the wait starts
// again). Never the same one twice in a row. An action can have a `cooldown`: after he does it, it's off the list for that
// many seconds. Actions play once unless they say `loops`.
export const IDLE_AFTER = 10;
export const IDLE_ACTIONS = [
  { clip: 'shooting arrow', cooldown: 20 },
  { clip: 'saluting' },
  { clip: 'waving', loops: INTRO_WAVE_LOOPS, speed: SPEED.wave },
];
export const IDLE_FADE = 0.45; // crossfade into an idle action and back out again (he has to turn to the side for the arrow)

// The default blend into idle after an entrance, a touch longer than the usual crossfade so it reads as a settle.
export const ENTRANCE_SETTLE = 0.5;

// Seconds for every other crossfade between clips.
export const CROSSFADE = 0.3;

// Dance Party: clips play back-to-back, each once, chained on the mixer's `finished` event.
export const DANCE = {
  clips: ['hip hop dancing', 'dancing', 'samba dancing'],
  audio: 'audio/dance.mp3', // served from /public — add your own file (see README)
  audioVolume: 0.85,
  bpm: 121, // drives the light pulse
  fadeOut: 1.4, // seconds of lights/music fade before the routine ends
};

// Say hi: the head you can stretch (src/features/face-lift.js). Lengths are in "head heights": the scan is scaled to be 1 tall.
export const FACE_LIFT = {
  radius: 0.26, // how far around the grabbed spot the surface follows the pointer
  maxPull: 1.5, // the furthest one drag can pull, so a wild fling can't throw the face off the screen
  follow: 26, // how tightly the surface chases the pointer: higher is snappier, lower is gooier
  resetMs: 480, // the head eases back to normal over this long
  span: 0.5, // how much of the screen's height the head fills
  centerY: 0.47, // where its centre sits on screen (0 = top, 1 = bottom)
  maxWidth: 0.7, // ...and it never gets wider than this share of the screen (portrait phones)
  turn: 0, // radians about the vertical axis, if the scan ever comes out facing away from the camera
  swing: 48, // degrees the camera can orbit to either side (the scan's back is open)
};

// My things: the objects floating in the "space station" (src/features/floating-things.js). Sizes and speeds are shares of
// the screen (its shorter side for speeds), so it feels the same on a laptop and on a phone.
export const THINGS = {
  size: 0.125, // an object's radius as a share of the screen height...
  sizeWide: 0.19, // ...and never more than this share of the width (portrait phones)
  drift: [0.02, 0.055], // slowest and fastest an object cruises on its own, in screen heights per second
  headerDrift: [0.009, 0.024], // the same for the "my things" header, which is slower and a bit lighter than the objects
  headerMass: 0.55, // how heavy the header is, compared with an average object
  left: 0, // where the objects' left wall is, as a share of the screen width: 0 is the screen's edge, 0.4 keeps them on the right
  damping: 0.28, // per second: how quickly a thrown object settles back to its cruising speed (low = it keeps going)
  bounce: 0.92, // how much speed survives a bounce off a wall or another object
  maxSpeed: 3.4, // the fastest a throw can be, in screen heights per second
  tilt: 1.5, // phones: how hard a tilt pushes, in screen heights per second squared at a full 90 degrees
  open: 0.8, // seconds for an object to come forward when clicked
  close: 0.65, // ...and to float back
};

// Phone tilt (src/ui/tilt.js), used by the home screen's swaying labels and by my things.
export const TILT = {
  settle: 2.2, // seconds for a tilt that is simply held to fade into "normal": only *moving* the phone counts
  limit: 0.6, // the most one reading can lean either way (0.5 is about 30 degrees), so a jerk can't fling things
};

// The home screen's floating labels sway with the phone (src/ui/sway.js).
export const SWAY = {
  px: 44, // how far a label leans at a full unit of tilt (each label leans by its own share of this: --depth in index.html)
  limit: 26, // never further than this, px
  stiffness: [5.2, 8.6], // each label has its own spring in this range, so they don't move in lockstep
  damping: 0.4, // below 1 they overshoot and settle: a sway rather than a slide
};

// A pointer that moves less than this many px between down and up counts as a click, not a drag.
export const CLICK_SLOP_PX = 6;

// The nametag fades this long after the pointer stops moving.
export const NAMETAG_IDLE_MS = 3000;

// Camera: how long after a drag ends before the slow auto-rotate resumes.
export const AUTOROTATE_RESUME_MS = 3500;
export const AUTOROTATE_SPEED = 0.9; // OrbitControls units; 2.0 ≈ one lap per 30 s
