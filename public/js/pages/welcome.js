import { html } from '../lib/html.js';
import { api } from '../lib/api.js';
import { dateTime } from '../lib/format.js';

const FACTS = [
  'Первые талеры чеканили с 1518 года в чешском городе Яхимов. От слова «талер» произошло название доллара.',
  'Слово «банк» пришло из итальянского banco, так называли скамью, за которой менялы вели дела.',
  'Белорусские рубли 1992 года называли «зайчиками»: на купюре в один рубль был изображён заяц.',
  'Слово «касса» произошло от латинского capsa, что значит «ящик».'
];

/** Экран «С возвращением» после входа клиента. Без свежего входа сразу открывается кабинет. */
export default async function page() {
  const { shown, name, previous } = await api.get('/welcome');
  if (!shown) return { redirect: '/cabinet' };
  return {
    title: 'С возвращением',
    body: html`<section class="auth welcome">
  <div class="auth__side">
    <div class="auth__top">
      <a class="logo logo--lg" href="/cabinet"><img src="/img/emblem.png" alt="" width="60" height="60"><span>Талер<span class="logo__bank">Банк</span></span></a>
      <div><h1>С возвращением, ${name}</h1>
      <p class="auth__lead">${previous ? `Прошлый вход: ${dateTime(previous).replace(' ', ' в ')}.` : 'Это ваш первый вход.'}</p></div>
    </div>
    <img class="auth__coin" src="/img/coin.png" alt="" width="540">
  </div>
  <div class="auth__panel">
    <div class="auth__card">
      <div class="fact">
        <div class="fact__lead">Знаете ли вы</div>
        <p class="fact__text" id="fact-text">${FACTS[0]}</p>
        <button class="fact__more" type="button" id="fact-next">Другой факт</button>
      </div>
      <a class="btn btn--lg welcome__go" href="/cabinet">Перейти в кабинет</a>
    </div>
  </div>
</section>`,
    mount(root) {
      let i = 0;
      root.querySelector('#fact-next').addEventListener('click', () => {
        i = (i + 1) % FACTS.length;
        root.querySelector('#fact-text').textContent = FACTS[i];
      });
    }
  };
}
