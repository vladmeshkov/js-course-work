import { html, raw } from './html.js';

// Флаги валют (SVG). code: usd, eur, rub, cny, byn; w: ширина в пикселях.
const FLAGS = {
  usd: ['Флаг США', '<rect width="44" height="30" fill="#fff"/><rect y="0" width="44" height="2.3" fill="#C8313E"/><rect y="4.6" width="44" height="2.3" fill="#C8313E"/><rect y="9.2" width="44" height="2.3" fill="#C8313E"/><rect y="13.8" width="44" height="2.3" fill="#C8313E"/><rect y="18.4" width="44" height="2.3" fill="#C8313E"/><rect y="23" width="44" height="2.3" fill="#C8313E"/><rect y="27.6" width="44" height="2.4" fill="#C8313E"/><rect width="19" height="16.1" fill="#26397F"/><circle cx="4" cy="3.6" r="1.1" fill="#fff"/><circle cx="9.5" cy="3.6" r="1.1" fill="#fff"/><circle cx="15" cy="3.6" r="1.1" fill="#fff"/><circle cx="4" cy="8" r="1.1" fill="#fff"/><circle cx="9.5" cy="8" r="1.1" fill="#fff"/><circle cx="15" cy="8" r="1.1" fill="#fff"/><circle cx="4" cy="12.4" r="1.1" fill="#fff"/><circle cx="9.5" cy="12.4" r="1.1" fill="#fff"/><circle cx="15" cy="12.4" r="1.1" fill="#fff"/>'],
  eur: ['Флаг Евросоюза', '<rect width="44" height="30" fill="#1F3F9A"/><circle cx="30" cy="15" r="1.3" fill="#F7D117"/><circle cx="28.93" cy="19" r="1.3" fill="#F7D117"/><circle cx="26" cy="21.93" r="1.3" fill="#F7D117"/><circle cx="22" cy="23" r="1.3" fill="#F7D117"/><circle cx="18" cy="21.93" r="1.3" fill="#F7D117"/><circle cx="15.07" cy="19" r="1.3" fill="#F7D117"/><circle cx="14" cy="15" r="1.3" fill="#F7D117"/><circle cx="15.07" cy="11" r="1.3" fill="#F7D117"/><circle cx="18" cy="8.07" r="1.3" fill="#F7D117"/><circle cx="22" cy="7" r="1.3" fill="#F7D117"/><circle cx="26" cy="8.07" r="1.3" fill="#F7D117"/><circle cx="28.93" cy="11" r="1.3" fill="#F7D117"/>'],
  rub: ['Флаг России', '<rect width="44" height="10" fill="#fff"/><rect y="10" width="44" height="10" fill="#1C57A5"/><rect y="20" width="44" height="10" fill="#D52B1E"/>'],
  cny: ['Флаг Китая', '<rect width="44" height="30" fill="#DE2910"/><polygon points="8,3.5 9.06,6.54 12.28,6.61 9.71,8.56 10.64,11.64 8,9.8 5.36,11.64 6.29,8.56 3.72,6.61 6.94,6.54" fill="#FFDE00"/><circle cx="15" cy="3" r="1" fill="#FFDE00"/><circle cx="17.5" cy="6" r="1" fill="#FFDE00"/><circle cx="17.5" cy="10" r="1" fill="#FFDE00"/><circle cx="15" cy="13" r="1" fill="#FFDE00"/>'],
  byn: ['Флаг Беларуси', '<rect width="44" height="20" fill="#C8313E"/><rect y="20" width="44" height="10" fill="#4AA657"/><rect width="7.5" height="30" fill="#fff"/><polygon points="3.75,1.5 6.25,4.5 3.75,7.5 1.25,4.5" fill="#C8313E"/><polygon points="3.75,9 6.25,12 3.75,15 1.25,12" fill="#C8313E"/><polygon points="3.75,16.5 6.25,19.5 3.75,22.5 1.25,19.5" fill="#C8313E"/><polygon points="3.75,24 6.25,27 3.75,30 1.25,27" fill="#C8313E"/>']
};


/** Флаг валюты как разметка. */
export function flag(code, w = 40) {
  const entry = FLAGS[String(code).toLowerCase()];
  if (!entry) return html``;
  const h = Math.round((w * 30) / 44);
  return html`<svg width="${w}" height="${h}" viewBox="0 0 44 30" role="img" aria-label="${entry[0]}" class="flag">${raw(entry[1])}</svg>`;
}
