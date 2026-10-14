import { contact } from '../data/contact.js';
import { resumeLink } from '../ui/resume.js';
import { pageCharacter, preloadPageCharacter } from './page-character.js';

// he stands as on about me, so he's the same size on both pages
const CHARACTER_FRAMING = { feet: 0.97, span: 0.9 };
const COPIED_MS = 1600; // how long "copied" shows after the address is clicked

const views = new WeakMap(); // page element -> its character (page-character.js)

function make(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text) el.textContent = text;
  return el;
}

/** What "send" does: post to the form service if there is one, otherwise open a ready-written email. */
async function deliver({ name, email, message }) {
  if (!contact.formEndpoint) {
    const subject = name ? `hi from ${name}` : 'hi from your site';
    const body = email ? `${message}\n\n${name || 'me'}, ${email}` : message;
    window.location.href = `mailto:${contact.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    return;
  }
  const response = await fetch(contact.formEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ name, email, message, _subject: name ? `hi from ${name}` : 'hi from your site' }),
  });
  if (!response.ok) throw new Error(`the form service answered ${response.status}`);
}

/**
 * Say hi (25a "Intro form", set like about me's intro). On the left, a contact form written as a sentence ("hi izzy, i'm
 * ___ and you can reach me at ___"), a message box, then one row of text links (send by email ↗, linkedin ↗, …, resume ↗)
 * with the address to copy under it; once sent, a thank-you takes its place. On the right, the 3D character standing on
 * the black page with no panel, as on about me (features/panel-character.js). (The stretchy head scan,
 * features/face-lift.js, is set aside.)
 */
export const sayHiPage = {
  stagger: 90,

  preload: preloadPageCharacter,

  render(page) {
    page.classList.add('page--hi');
    const root = make('div', 'hi page__scroll');

    // ---- the form ------------------------------------------------------------------------------------------------
    const form = make('form', 'hi-form');
    form.noValidate = true; // (the email is checked here, so the message reads like the rest of the page)
    form.setAttribute('aria-label', 'Send Izzy a message');

    const sentence = make('div', 'hi-sentence');
    const nameInput = make('input', 'hi-input hi-input--name');
    Object.assign(nameInput, { type: 'text', name: 'name', placeholder: 'your name', autocomplete: 'name' });
    nameInput.setAttribute('aria-label', 'your name');
    const fromInput = make('input', 'hi-input hi-input--email');
    Object.assign(fromInput, { type: 'email', name: 'email', placeholder: 'your email', autocomplete: 'email', spellcheck: false });
    fromInput.setAttribute('aria-label', 'your email');
    sentence.append(make('span', '', 'hi izzy, i’m'), nameInput, make('span', '', 'and you can reach me at'), fromInput);

    const message = make('textarea', 'hi-message');
    Object.assign(message, { name: 'message', placeholder: 'what’s on your mind…' });
    message.setAttribute('aria-label', 'your message');

    // one row of text links: send, then the links (contact.js) and the resume; the address to copy under it
    const actions = make('div', 'hi-actions');
    const row = make('div', 'hi-links-row');
    const send = make('button', 'hi-send', contact.formEndpoint ? 'send ↗' : 'send by email ↗');
    send.type = 'submit';
    send.disabled = true;
    row.append(send);
    for (const { name, href } of contact.links) {
      if (!href) continue;
      const a = make('a', 'hi-link', `${name} ↗`);
      Object.assign(a, { href, target: '_blank', rel: 'noopener noreferrer' });
      a.setAttribute('aria-label', `${name} (opens in new tab)`);
      row.append(a);
    }
    row.append(resumeLink('hi-link'));
    const alt = make('p', 'hi-alt');
    const copy = make('button', 'hi-copy', contact.email);
    copy.type = 'button';
    copy.setAttribute('aria-label', `${contact.email}, click to copy`);
    const copyLabel = make('span', 'hi-copy-label', 'click to copy');
    copyLabel.setAttribute('aria-live', 'polite');
    alt.append('or copy ', copy, ' ', copyLabel);
    actions.append(row, alt);

    const error = make('p', 'hi-error');
    error.setAttribute('role', 'status');
    error.hidden = true;
    form.append(sentence, message, actions, error);

    // ---- the thank-you -------------------------------------------------------------------------------------------
    const sent = make('div', 'hi-sent');
    sent.hidden = true;
    sent.tabIndex = -1;
    const thanks = make('p', 'hi-sent__thanks');
    // (with no form service, "send" hands the message to the visitor's mail app: they still press send there)
    const back = make('p', 'hi-sent__line', contact.formEndpoint ? 'i’ll get back to you soon.' : 'your email app should open with it ready to send.');
    const again = make('button', 'hi-sent__again', 'write another');
    again.type = 'button';
    sent.append(thanks, back, again);

    const main = make('div', 'hi-main');
    main.append(form, sent);

    // ---- the character ---------------------------------------------------------------------------------------------
    const side = make('div', 'hi-side');
    const floor = make('div', 'hi-floor');
    const canvas = make('canvas', 'hi-canvas');
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', "Izzy's 3D character. Click him to change what he's doing, or drag to look around.");
    const note = make('p', 'hi-note');
    note.hidden = true;
    side.append(floor, canvas, note);

    const inner = make('div', 'hi__inner');
    inner.append(main, side);
    root.append(inner);
    page.append(root);

    // ---- behaviour -----------------------------------------------------------------------------------------------
    views.set(page, pageCharacter({ canvas, note, framing: CHARACTER_FRAMING, failText: "couldn't load the 3D character, but the links still work." }));

    let sending = false;
    const ready = () => message.value.trim().length > 0;
    const sync = () => {
      send.disabled = !ready() || sending;
    };
    message.addEventListener('input', sync);
    const showError = (text) => {
      error.textContent = text;
      error.hidden = !text;
    };
    fromInput.addEventListener('input', () => {
      if (error.dataset.kind === 'email') showError('');
    });

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!ready() || sending) return;
      const from = fromInput.value.trim();
      if (from && !fromInput.validity.valid) {
        error.dataset.kind = 'email';
        showError('that email doesn’t look quite right.');
        fromInput.focus();
        return;
      }
      sending = true;
      sync();
      showError('');
      try {
        await deliver({ name: nameInput.value.trim(), email: from, message: message.value.trim() });
        const name = nameInput.value.trim();
        thanks.textContent = name ? `thanks, ${name}` : 'thanks';
        form.hidden = true;
        sent.hidden = false;
        sent.focus({ preventScroll: true });
      } catch (failure) {
        console.error('Failed to send the message', failure);
        error.dataset.kind = 'send';
        showError('couldn’t send, try emailing instead.');
      } finally {
        sending = false;
        sync();
      }
    });

    again.addEventListener('click', () => {
      message.value = ''; // (the name and email stay)
      sync();
      sent.hidden = true;
      form.hidden = false;
      message.focus();
    });

    let copiedTimer = 0;
    copy.addEventListener('click', () => {
      navigator.clipboard?.writeText(contact.email).catch(() => {});
      copyLabel.textContent = 'copied';
      clearTimeout(copiedTimer);
      copiedTimer = setTimeout(() => (copyLabel.textContent = 'click to copy'), COPIED_MS);
    });
  },

  blocks: (page) => [...page.querySelectorAll('.hi-sentence, .hi-message, .hi-actions, .hi-side')],

  onShow(page) {
    views.get(page).show();
  },

  onHide(page) {
    views.get(page).hide();
  },
};
