/** Stand-in for pages that don't have content yet (say hi, projects). Same transition, one line of text. */
export function comingSoon(title) {
  return {
    render(page) {
      const column = document.createElement('div');
      column.className = 'page__col';
      const p = document.createElement('p');
      p.className = 'page__soon';
      p.textContent = `[${title} — coming soon]`;
      column.append(p);
      page.append(column);
    },
    blocks: (page) => [page.querySelector('.page__soon')],
  };
}
