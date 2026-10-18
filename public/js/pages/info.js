import { html } from '../lib/html.js';
import { api } from '../lib/api.js';

/** Статические страницы: /info/privacy, /info/terms, /info/tariffs, /info/license и /forgot. */
export default async function page({ params }) {
  const { title, blocks } = await api.get(`/info/${params.slug ?? 'forgot'}`);
  return {
    title,
    body: html`<nav class="crumbs" aria-label="Навигация"><a href="/">Главная</a><span>${title}</span></nav>
<section class="tile info">
  <h1>${title}</h1>
  ${blocks.map((b) => html`<h2>${b[0]}</h2><p>${b[1]}</p>`)}
</section>`
  };
}
