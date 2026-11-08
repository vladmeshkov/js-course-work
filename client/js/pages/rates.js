import { html } from '../lib/html.js';
import { api } from '../lib/api.js';
import { crumbs } from '../lib/ui.js';
import { ratesBlock, mountConverter } from '../lib/rates-block.js';

export default async function page() {
  const { rates } = await api.get('/rates');
  return {
    title: 'Курсы валют',
    body: html`${crumbs([['Главная', '/'], 'Курсы валют'])}<h1>Курсы валют</h1>${ratesBlock(rates)}`,
    mount: mountConverter
  };
}
