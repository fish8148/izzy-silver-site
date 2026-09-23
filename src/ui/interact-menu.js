/**
 * The small menu that opens from the teal "interact" label.
 *
 * Entries are data. To add one later (compliment, stand-off, study) add it here and register
 * a handler for its id in scene/index.js — no markup changes needed.
 */
const ITEMS = [
  { id: 'dance', label: 'Dance Party' },
  // { id: 'compliment', label: 'Compliment' },
  // { id: 'standoff', label: 'Stand-off' },
  // { id: 'study', label: 'Study' },
];

export function createInteractMenu({ toggle, panel }) {
  const handlers = new Map();
  const buttons = new Map();

  for (const item of ITEMS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('role', 'menuitem');
    button.dataset.action = item.id;
    button.textContent = item.label;
    button.disabled = true; // enabled once the 3D scene registers a handler
    buttons.set(item.id, button);
    panel.append(button);
  }

  const isOpen = () => !panel.hidden;

  function open({ focusFirst = false } = {}) {
    panel.hidden = false;
    toggle.setAttribute('aria-expanded', 'true');
    if (focusFirst) panel.querySelector('button:not(:disabled)')?.focus();
  }

  function close({ returnFocus = false } = {}) {
    panel.hidden = true;
    toggle.setAttribute('aria-expanded', 'false');
    if (returnFocus) toggle.focus();
  }

  // event.detail is 0 for keyboard-triggered clicks, which should land focus inside the menu.
  toggle.addEventListener('click', (event) => {
    if (isOpen()) close();
    else open({ focusFirst: event.detail === 0 });
  });

  panel.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-action]');
    if (!button || button.disabled) return;
    close();
    handlers.get(button.dataset.action)?.();
  });

  // click-away and Esc
  document.addEventListener('pointerdown', (event) => {
    if (isOpen() && !panel.contains(event.target) && !toggle.contains(event.target)) close();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && isOpen()) close({ returnFocus: true });
  });

  // arrow-key navigation
  panel.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const items = [...panel.querySelectorAll('button:not(:disabled)')];
    if (!items.length) return;
    event.preventDefault();
    const index = items.indexOf(document.activeElement);
    const step = event.key === 'ArrowDown' ? 1 : -1;
    items[(index + step + items.length) % items.length].focus();
  });

  return {
    /** Wire an entry to an action and enable it. */
    on(id, handler) {
      handlers.set(id, handler);
      const button = buttons.get(id);
      if (button) button.disabled = false;
    },
    /** Grey an entry out while its feature is running. */
    setBusy(id, busy) {
      const button = buttons.get(id);
      if (button) button.disabled = busy;
    },
    close,
  };
}
