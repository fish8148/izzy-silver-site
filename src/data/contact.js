/**
 * The say hi page. A link left empty is left off the page.
 *
 *   formEndpoint  where the "send" button posts the message, as JSON: { name, email, message } (a Formspree form's URL,
 *                 e.g. 'https://formspree.io/f/abcdwxyz', works as it is). Left empty, "send" opens a new email to
 *                 `email` with the message already filled in, in the visitor's own mail app.
 */
export const contact = {
  email: 'isilver@uwaterloo.ca',
  formEndpoint: '',
  links: [
    { name: 'linkedin', href: 'https://www.linkedin.com/in/izzysilver/' },
    { name: 'github', href: '' },
    { name: 'instagram', href: '' },
  ],
};
