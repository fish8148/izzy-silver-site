import { about } from '../data/about.js';

const base = import.meta.env.BASE_URL;

/**
 * Where the resume links go (about me and say hi): `about.resume`, plus the build's fingerprint of public/resume.pdf, so an
 * updated resume is never served from an old cache (vite.config.js).
 */
export function resumeHref() {
  const path = about.resume;
  const url = /^(https?:)?\/\//.test(path) || path.startsWith('/') ? path : `${base}${path}`;
  const version = /^resume\.pdf$/.test(path) && __RESUME_VERSION__ ? `?v=${__RESUME_VERSION__}` : '';
  return url + version;
}

/** "resume ↗", opening in a new tab. */
export function resumeLink(className) {
  const link = document.createElement('a');
  link.className = className;
  link.href = resumeHref();
  link.target = '_blank';
  link.rel = 'noopener';
  link.textContent = 'resume ↗';
  link.setAttribute('aria-label', `resume (${/\.pdf$/i.test(about.resume) ? 'PDF, ' : ''}opens in new tab)`);
  return link;
}
