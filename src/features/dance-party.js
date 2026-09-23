import * as THREE from 'three';
import { DANCE } from '../config.js';

const AUDIO_URL = `${import.meta.env.BASE_URL}${DANCE.audio}`;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => t * t * (3 - 2 * t);
const approach = (value, target, amount) =>
  value < target ? Math.min(value + amount, target) : Math.max(value - amount, target);

// How the rig looks when the party is at full strength.
const PARTY = { hemi: 0.14, key: 0.5, rim: 2.1, spot: 11 };

/**
 * Dance Party: the page goes dark, a coloured spotlight comes on, the colours keep changing,
 * and the character runs through the dance routine. The routine is a sequence of one-shot
 * clips chained on the mixer's `finished` event (see animator.playSequence); the lights and
 * music fade out over the last moments of the final clip, then the character returns to
 * whichever rest state it was in before.
 */
export function createDanceParty({ stage, animator, hero, stopButton, onBusyChange = () => {} }) {
  const { lights } = stage;
  const layer = hero.querySelector('.hero__party');

  // Spotlight above and slightly in front of the character.
  const spot = new THREE.SpotLight(0xffffff, 0, 0, 0.5, 0.9, 0);
  spot.position.set(0, 5.5, 1.6);
  spot.target.position.set(0, 0.9, 0);
  stage.scene.add(spot, spot.target);

  // Music. Missing file = silent party; nothing else breaks.
  const audio = new Audio(AUDIO_URL);
  audio.preload = 'none';
  audio.addEventListener(
    'error',
    () => console.info(`Dance Party: no music at ${AUDIO_URL}. Add your own mp3 there (see README).`),
    { once: true },
  );

  let active = false; // a routine is running or still fading out
  let ending = false;
  let paused = false;
  let level = 0; // 0 = normal scene, 1 = full party
  let target = 0;
  let rate = 1;
  let clock = 0;

  const color = new THREE.Color();
  const tint = (light, hue, saturation, lightness) => light.color.setHSL(hue / 360, saturation, lightness, THREE.SRGBColorSpace);
  const baseKeyColor = lights.key.color.clone();
  const baseRimColor = lights.rim.color.clone();

  function beginEnding(seconds) {
    if (ending) return;
    ending = true;
    target = 0;
    rate = 1 / seconds;
    document.body.classList.remove('is-party'); // page brightens back in step with the lights
  }

  function finish() {
    active = false;
    ending = false;
    level = 0;
    audio.pause();
    audio.currentTime = 0;
    hero.classList.remove('is-party');
    stage.releaseCamera('party');
    // hand the lights back exactly as they were
    lights.hemi.intensity = lights.base.hemi;
    lights.key.intensity = lights.base.key;
    lights.rim.intensity = lights.base.rim;
    lights.key.color.copy(baseKeyColor);
    lights.rim.color.copy(baseRimColor);
    spot.intensity = 0;
    layer.style.setProperty('--party-level', '0');
    onBusyChange(false);
  }

  function start() {
    if (active || animator.busy) return false;
    const started = animator.playSequence(DANCE.clips, {
      // Finished normally, or aborted with Esc — either way the lights come down.
      onDone: (completed) => beginEnding(completed ? DANCE.fadeOut : 0.6),
    });
    if (!started) return false;

    active = true;
    ending = false;
    clock = 0;
    target = 1;
    rate = 1 / 0.9;

    hero.classList.add('is-party');
    document.body.classList.add('is-party');
    stage.holdCamera('party'); // stop the slow orbit…
    stage.easeToFront(1); // …and turn to face the dancer

    audio.currentTime = 0;
    audio.volume = 0;
    audio.play().catch(() => {});

    onBusyChange(true);
    return true;
  }

  /** Cut the party short (Esc / the stop button). */
  function stop() {
    if (active && !ending) animator.abortSequence();
  }

  /** Hold everything still while the hero is off-screen or the tab is hidden, so music and dance stay in sync. */
  function setPaused(value) {
    if (value === paused) return;
    paused = value;
    if (!active) return;
    if (paused) audio.pause();
    else audio.play().catch(() => {});
  }

  function update(dt) {
    if (!active || paused) return;
    clock += dt;

    // Start fading a little before the last clip ends so the lights are down as the dance finishes.
    if (!ending) {
      const progress = animator.getProgress();
      if (progress && progress.step === DANCE.clips.length - 1 && progress.duration - progress.time <= DANCE.fadeOut) {
        beginEnding(DANCE.fadeOut);
      }
    }

    level = approach(level, target, dt * rate);
    const e = ease(level);

    const hue = (clock * 38) % 360; // a full colour cycle every ~9.5 s
    const beat = (clock * DANCE.bpm) / 60;
    const pulse = reducedMotion ? 0.92 : 0.84 + 0.16 * Math.pow(0.5 + 0.5 * Math.cos(beat * Math.PI * 2), 2);

    // Regular lights fade down; three coloured lights take over.
    lights.hemi.intensity = lerp(lights.base.hemi, PARTY.hemi, e);
    tint(spot, hue, 0.95, 0.55);
    spot.intensity = PARTY.spot * e * pulse;

    color.copy(baseKeyColor);
    tint(lights.key, hue + 240, 0.9, 0.55);
    lights.key.color.lerp(color, 1 - e);
    lights.key.intensity = lerp(lights.base.key, PARTY.key, e);

    color.copy(baseRimColor);
    tint(lights.rim, hue + 120, 0.95, 0.55);
    lights.rim.color.lerp(color, 1 - e);
    lights.rim.intensity = lerp(lights.base.rim, PARTY.rim, e) * (0.9 + 0.1 * pulse);

    // CSS side of the light show (beam, floor pool, colour wash)
    layer.style.setProperty('--party-hue', hue.toFixed(1));
    layer.style.setProperty('--party-level', (e * pulse).toFixed(3));

    audio.volume = Math.min(1, Math.max(0, e * DANCE.audioVolume));

    if (ending && level === 0) finish();
  }

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') stop();
  });
  stopButton.addEventListener('click', stop);

  return { start, stop, update, setPaused, get active() { return active; } };
}
