import * as THREE from 'three';
import { CLIPS, CROSSFADE, ENTRANCES, ENTRANCE_SETTLE, IDLE_ACTIONS, IDLE_AFTER, IDLE_FADE, REST_CYCLE, SPEED } from '../config.js';

/**
 * Animation state machine.
 *
 *   rest states   idle → wave → spin → idle …   (loop forever; a click on the character advances). Treading water is a
 *                 rest state too, but only the swim entrance ends in it, and a click ends it.
 *   entrance      one clip that brings the character in (a wave, a swing, a moonwalk…), then idle
 *   idle action   after IDLE_AFTER seconds standing in idle he does one of IDLE_ACTIONS once, then idle again
 *   sequence      one-shot clips played back to back (Dance Party). Each is LoopOnce +
 *                 clampWhenFinished, and the next step / return to rest is triggered by the
 *                 mixer's `finished` event — never a timer.
 *
 * Every clip change is a crossfade.
 *
 * The character's root (where he stands, and which way he faces) is set every frame from the clips that are playing,
 * weighted by how much of each is showing, so it blends in step with the crossfades. Each clip can contribute:
 *   groundLift  clips that never touch the floor (the hurricane kick) are lowered to it
 *   anchors     clips that carry their own travel are shifted so their LAST frame lands at the centre (see measureAnchors)
 *   motions     travel done in code: the moonwalk plays in place and is slid in from off-screen
 */
export function createAnimator({ mixer, actions, root, groundLift = {}, anchors = {} }) {
  const base = { x: root.position.x, y: root.position.y, z: root.position.z, yaw: root.rotation.y };
  const listeners = new Set();
  const motions = new Map(); // action -> () => { x, y, z, yaw }: where that clip puts the root, when it isn't a constant
  const cooldowns = new Map(); // idle action clip -> seconds before he can pick it again
  const finished = []; // actions the mixer has finished: dealt with at the start of the next update

  let current = null; // action currently on top
  let restState = 'idle'; // where we return after a sequence
  let sequence = null; // { names, index, action, onStep, onDone }
  let entrance = null; // { name, def, action, elapsed, duration, onDone }
  let idleAction = null; // { def, action }: the idle action that is playing, if any
  let lastIdleClip = null;
  let idleTime = 0; // seconds spent standing in idle

  const need = (name) => {
    const action = actions[name];
    if (!action) throw new Error(`character.glb has no clip named "${name}"`);
    return action;
  };

  const nameOf = (action) => action?.getClip().name ?? null;
  const emit = () => listeners.forEach((fn) => fn(getState()));

  function crossTo(action, { loop = THREE.LoopRepeat, repetitions = Infinity, fade = CROSSFADE, timeScale = 1 } = {}) {
    if (current === action) {
      // It's already the one showing. If it is being asked for in a different way (a wave that was going to run three
      // times is now the resting wave, forever), set it up that way, or it would run out and freeze on its last frame.
      if (action.loop === loop && action.repetitions === repetitions && !action.paused) return action;
      if (action.paused || !action.enabled) action.reset(); // it had finished: start it again
      action.setLoop(loop, repetitions);
      action.clampWhenFinished = Number.isFinite(repetitions);
      action.setEffectiveTimeScale(timeScale);
      action.setEffectiveWeight(1);
      action.play();
      return action;
    }

    const previous = current;
    action.reset();
    action.setLoop(loop, repetitions);
    // Anything that ends on its own (a one-shot, or an entrance's few loops) must HOLD its last pose while we fade out
    // of it. Otherwise three.js switches the action off the moment it finishes, and for the length of the crossfade
    // nothing drives the skeleton but the bind pose (the arms-out A-pose): a visible flash.
    action.clampWhenFinished = Number.isFinite(repetitions);
    action.setEffectiveTimeScale(timeScale);
    action.setEffectiveWeight(1);
    action.play();

    // The very first clip starts at full weight: there is nothing to blend from except the
    // bind pose (arms out), and fading in from that would flash a T-pose on load.
    if (previous) previous.crossFadeTo(action, fade, false);

    current = action;
    return action;
  }

  // ---- rest states ----------------------------------------------------------------
  function playRest(state, options) {
    restState = state;
    idleTime = 0;
    crossTo(need(CLIPS[state]), { timeScale: SPEED[state] ?? 1, ...options });
    emit();
  }

  /** Something else is taking over: drop a running entrance / idle action (the entrance's owner is told it was cut short). */
  function dropTransients() {
    const done = entrance?.onDone;
    entrance = null;
    if (idleAction) endIdleAction();
    done?.(false);
  }

  /** Advance idle → wave → spin → idle. Ignored while a sequence owns the character. From anywhere else (treading water) it goes to idle. */
  function cycle() {
    if (sequence) return false;
    dropTransients(); // a click during an entrance or an idle action takes over from it
    const next = REST_CYCLE[(REST_CYCLE.indexOf(restState) + 1) % REST_CYCLE.length];
    playRest(next);
    return true;
  }

  // ---- entrances ------------------------------------------------------------------
  /**
   * Bring the character in with one of the ENTRANCES, then settle into idle (or the rest state the entrance ends in).
   * `halfWidth` is how far the screen's edge is from the centre at the character's distance (metres): the moonwalk
   * starts just beyond it. `onDone(completed)` runs when it's all over, or with false if a click cut it short.
   */
  function playEntrance(name, { halfWidth = 2.5, onDone } = {}) {
    const def = ENTRANCES[name];
    if (!def) throw new Error(`no entrance called "${name}"`);
    if (sequence) return false;
    dropTransients();

    const speed = def.speed ?? 1;
    const clip = need(def.clip).getClip();
    // A moonwalk covers the distance from the screen's edge at a steady pace, so how many times it repeats depends on how
    // wide the screen is: a few more on a laptop than on a phone.
    const distance = def.travel ? halfWidth + def.travel.margin : 0;
    const loops = def.travel ? Math.max(2, Math.round(distance / (def.travel.speed * clip.duration))) : (def.loops ?? 1);
    const duration = (clip.duration * loops) / speed;

    const mine = { name, def, action: null, elapsed: 0, duration, onDone };
    entrance = mine;
    restState = def.rest ?? 'idle'; // a click after the launch wave carries on from the wave; after any other, from idle
    idleTime = 0;
    // A cut, not a crossfade: he starts from wherever the last clip left him, which is nowhere near where this one begins
    // (this happens while the canvas is still faded out).
    mixer.stopAllAction();
    current = null;
    mine.action = crossTo(need(def.clip), {
      loop: loops > 1 ? THREE.LoopRepeat : THREE.LoopOnce,
      repetitions: loops,
      timeScale: speed,
    });

    if (def.travel) {
      // Slide in from just past the screen's edge at a steady pace, then slow to a stop at the centre. He faces away from
      // the centre (a moonwalk goes backwards) and turns to the camera as he blends into idle (yaw is weighted like the rest).
      const side = Math.random() < 0.5 ? -1 : 1;
      const from = side * distance;
      const yaw = side * THREE.MathUtils.degToRad(def.travel.yaw);
      const ease = Math.min(def.travel.ease, duration);
      const speedAtStart = 1 / (duration - ease / 2); // fraction of the whole trip covered per second
      motions.set(mine.action, () => {
        const t = Math.min(mine.elapsed, duration);
        const cruise = duration - ease;
        const covered = t <= cruise ? speedAtStart * t : speedAtStart * (cruise + (t - cruise) - (t - cruise) ** 2 / (2 * ease));
        return { x: from * (1 - Math.min(covered, 1)), z: 0, yaw };
      });
    }
    emit();
    return true;
  }

  function finishEntrance() {
    const { def, onDone } = entrance;
    entrance.elapsed = entrance.duration;
    entrance = null;
    playRest(def.after ?? 'idle', { fade: def.settle ?? ENTRANCE_SETTLE });
    onDone?.(true);
  }

  // ---- idle actions ---------------------------------------------------------------
  /** Pick one that isn't cooling down (and isn't the one he just did, if there's a choice) and do it. */
  function startIdleAction() {
    const available = IDLE_ACTIONS.filter((def) => actions[def.clip] && !(cooldowns.get(def.clip) > 0));
    const fresh = available.filter((def) => def.clip !== lastIdleClip);
    const pool = fresh.length ? fresh : available;
    if (!pool.length) {
      idleTime = IDLE_AFTER; // everything is cooling down: try again next frame
      return;
    }
    const def = pool[Math.floor(Math.random() * pool.length)];
    const loops = def.loops ?? 1;
    idleTime = 0;
    lastIdleClip = def.clip;
    idleAction = {
      def,
      action: crossTo(need(def.clip), {
        loop: loops > 1 ? THREE.LoopRepeat : THREE.LoopOnce,
        repetitions: loops,
        timeScale: def.speed ?? 1,
        fade: IDLE_FADE,
      }),
    };
    emit();
  }

  /** It's over (or cut short): its cool-down starts now. */
  function endIdleAction() {
    const { def } = idleAction;
    idleAction = null;
    if (def.cooldown) cooldowns.set(def.clip, def.cooldown);
  }

  // ---- one-shot sequences ---------------------------------------------------------
  function startStep() {
    const name = sequence.names[sequence.index];
    sequence.action = crossTo(need(name), { loop: THREE.LoopOnce, repetitions: 1 });
    sequence.onStep?.(name, sequence.index);
  }

  /** Play clips back to back, then crossfade to whichever rest state was active before. */
  function playSequence(names, { onStep, onDone } = {}) {
    if (sequence) return false;
    dropTransients();
    sequence = { names, index: 0, action: null, onStep, onDone };
    startStep();
    emit();
    return true;
  }

  function endSequence(completed) {
    if (!sequence) return;
    const { onDone } = sequence;
    sequence = null;
    playRest(restState);
    onDone?.(completed);
  }

  /** Bail out of a running sequence early (Esc). */
  const abortSequence = () => endSequence(false);

  /** A clip reached its end: move on to whatever follows it. */
  function handleFinished(action) {
    if (sequence && action === sequence.action) {
      if (sequence.index < sequence.names.length - 1) {
        sequence.index += 1;
        startStep();
      } else {
        endSequence(true);
      }
    } else if (entrance && action === entrance.action) {
      finishEntrance();
    } else if (idleAction && action === idleAction.action) {
      endIdleAction();
      playRest('idle', { fade: IDLE_FADE });
    }
  }

  // The mixer tells us when a LoopOnce / finite-repeat action reaches its end. That happens in the middle of its own update,
  // so all we do is note it: see update().
  mixer.addEventListener('finished', ({ action }) => finished.push(action));

  // ---- per-frame ------------------------------------------------------------------
  /** Where he stands and which way he faces: the playing clips' offsets, weighted by how much of each is showing. */
  function placeRoot() {
    let x = 0;
    let y = 0;
    let z = 0;
    let yaw = 0;
    let total = 0;
    for (const action of Object.values(actions)) {
      // (only clips that have been started: one that never was still reports a weight of 1)
      if (!action.enabled || !action.isScheduled()) continue;
      const weight = action.getEffectiveWeight();
      if (weight <= 0) continue;
      const name = nameOf(action);
      const own = motions.get(action)?.() ?? anchors[name];
      x += weight * (own?.x ?? 0);
      y += weight * ((own?.y ?? 0) - (groundLift[name] ?? 0));
      z += weight * (own?.z ?? 0);
      yaw += weight * (own?.yaw ?? 0);
      total += weight;
    }
    const k = total > 0 ? 1 / total : 0;
    root.position.set(base.x + x * k, base.y + y * k, base.z + z * k);
    root.rotation.y = base.yaw + yaw * k;
  }

  /**
   * Advance the mixer, count the time spent in idle, and put the character where the clips want him.
   *
   * Starting a clip (the next one after one that finished, or an idle action) is done here, BEFORE the mixer runs, never
   * from inside its update or after it. A clip started in the middle of an update hasn't had its weight worked out for that
   * frame, so it reports a full weight next to the one fading out, and blending the two for the root halved every offset for
   * a single frame: the swing hopped 2.7 m toward the camera when it ended, the climb jumped 1.3 m.
   */
  function update(dt) {
    while (finished.length) handleFinished(finished.shift());
    for (const [clip, left] of cooldowns) if (left > 0) cooldowns.set(clip, Math.max(left - dt, 0));

    const standing = !sequence && !entrance && !idleAction && restState === 'idle' && current === actions[CLIPS.idle];
    if (standing) {
      idleTime += dt;
      if (idleTime >= IDLE_AFTER) startIdleAction();
    }

    mixer.update(dt);
    if (entrance) entrance.elapsed += dt;
    placeRoot();
  }

  /** Where the running sequence is: which clip, and how far through it. */
  function getProgress() {
    const action = sequence?.action;
    if (!action) return null;
    return { step: sequence.index, time: action.time, duration: action.getClip().duration };
  }

  function getState() {
    return {
      rest: restState,
      clip: nameOf(current),
      busy: !!sequence,
      entrance: entrance?.name ?? null,
      idleAction: idleAction?.def.clip ?? null,
      idleTime,
      cooldowns: Object.fromEntries([...cooldowns].filter(([, left]) => left > 0)),
      step: sequence?.index ?? null,
    };
  }

  return {
    update,
    playEntrance,
    cycle,
    playRest,
    playSequence,
    abortSequence,
    getState,
    getProgress,
    get busy() {
      return !!sequence;
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}
