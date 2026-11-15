// Модель диаграммы вариантов использования (рисунок 1.13): актёры, варианты, отношения и области холста.
// Расстановку подбирает tools/uc-layout.js, рисует tools/uml-views.js. Шрифт у всех вариантов один (14, полужирный),
// размер эллипса считается из текста: перенос по словам, эллипс примерно в 2,3 раза шире своей высоты.

export const UC_FONT = 14;

/** Перенос названия по словам: строки не длиннее max символов. */
export function wrapText(text, max = 15) {
  const out = [];
  for (const w of text.split(' ')) {
    const last = out[out.length - 1];
    if (last && (last + ' ' + w).length <= max) out[out.length - 1] = last + ' ' + w;
    else out.push(w);
  }
  return out;
}

/** Размер эллипса по тексту: полуоси rx, ry и текст с переносами. */
export function ucSize(text) {
  const lines = wrapText(text);
  const w = Math.max(...lines.map((l) => l.length)) * UC_FONT * 0.6 + 40;
  const ry = lines.length * 9 + 17;
  return { rx: Math.max(Math.round(w / 2), Math.round(ry * 2.2)), ry, label: lines.join('\n') };
}

const c = (id, region, text) => ({ id, region, text });

export const UC = {
  frame: { x: 170, y: 0, w: 1330, h: 1330 },
  pkg: { x: 905, y: 815, w: 550, h: 485 },
  regions: {
    client: { x: 200, y: 55, w: 420, h: 800 },
    mid: { x: 480, y: 55, w: 420, h: 800 },
    admin: { x: 200, y: 900, w: 680, h: 410 },
    op: { x: 880, y: 50, w: 360, h: 250 },
    mon: { x: 880, y: 300, w: 360, h: 250 },
    cr: { x: 880, y: 550, w: 360, h: 240 },
    user: { x: 930, y: 860, w: 500, h: 420 }
  },
  actors: [
    { id: 'client', name: 'Клиент', cx: 80, cy: 420, side: 1, cases: ['acc', 'xfer', 'pay', 'dep', 'loan', 'repay', 'card', 'stmt'] },
    { id: 'admin', name: 'Администратор', cx: 80, cy: 1110, side: 1, cases: ['trf', 'users', 'audit', 'reports', 'backup', 'eod'] },
    { id: 'op', name: 'Операционист', cx: 1590, cy: 150, side: -1, cases: ['kyc', 'cash', 'lock'] },
    { id: 'mon', name: 'Специалист по\nмониторингу', cx: 1590, cy: 400, side: -1, cases: ['fraud', 'special'] },
    { id: 'cr', name: 'Кредитный\nспециалист', cx: 1590, cy: 650, side: -1, cases: ['review', 'issue'] },
    { id: 'user', name: 'Пользователь', cx: 1590, cy: 1050, side: -1, cases: ['reg', 'auth', 'rates', 'sec', 'notif'] }
  ],
  cases: [
    c('acc', 'client', 'Открыть счёт'), c('xfer', 'client', 'Перевести деньги'), c('pay', 'client', 'Оплатить услугу'),
    c('dep', 'client', 'Оформить вклад'), c('loan', 'client', 'Оформить кредит'), c('repay', 'client', 'Погасить кредит'),
    c('card', 'client', 'Выпустить карту'), c('stmt', 'client', 'Получить выписку по счёту'),
    c('fx', 'mid', 'Конвертировать валюту'), c('code', 'mid', 'Подтвердить операцию кодом'),
    c('auto', 'mid', 'Настроить автоплатёж'), c('calc', 'mid', 'Рассчитать доход по вкладу'),
    c('early', 'mid', 'Закрыть вклад досрочно'), c('score', 'mid', 'Оценить кредитоспособность'),
    c('prepay', 'mid', 'Погасить кредит досрочно'), c('block', 'mid', 'Заблокировать карту'),
    c('pdf', 'mid', 'Сформировать выписку в PDF'),
    c('trf', 'admin', 'Задать курсы и тарифы'), c('users', 'admin', 'Управлять пользователями'),
    c('audit', 'admin', 'Проанализировать журнал аудита'), c('reports', 'admin', 'Сформировать отчёты'),
    c('backup', 'admin', 'Создать резервную копию'), c('eod', 'admin', 'Закрыть операционный день'),
    c('accrue', 'admin', 'Начислить проценты по вкладам'), c('charge', 'admin', 'Списать платежи по кредитам'),
    c('kyc', 'op', 'Проверить анкету клиента'), c('cash', 'op', 'Принять и выдать наличные'), c('lock', 'op', 'Заблокировать счёт клиента'),
    c('fraud', 'mon', 'Разобрать задержанный перевод'), c('special', 'mon', 'Назначить особый контроль'),
    c('review', 'cr', 'Рассмотреть заявку на кредит'), c('issue', 'cr', 'Выдать средства по кредиту'),
    c('reg', 'user', 'Зарегистрироваться'), c('form', 'user', 'Заполнить анкету'), c('auth', 'user', 'Авторизоваться'),
    c('tfa', 'user', 'Подтвердить вход кодом 2FA'), c('rates', 'user', 'Просмотреть курсы валют'),
    c('conv', 'user', 'Рассчитать конвертацию валют'), c('sec', 'user', 'Управлять безопасностью'), c('notif', 'user', 'Просмотреть уведомления')
  ],
  // [от, к, вид]: «include» – от базового к включаемому, «extend» – от расширяющего к базовому
  // у каждого базового варианта не больше одного уточнения; уточнения стоят дальше от актёра, чем базовый вариант
  links: [
    ['fx', 'xfer', 'extend'], ['xfer', 'code', 'include'], ['auto', 'pay', 'extend'], ['dep', 'calc', 'include'], ['early', 'dep', 'extend'],
    ['loan', 'score', 'include'], ['prepay', 'repay', 'extend'], ['block', 'card', 'extend'],
    ['stmt', 'pdf', 'include'], ['eod', 'accrue', 'include'], ['eod', 'charge', 'include'],
    ['reg', 'form', 'include'], ['tfa', 'auth', 'extend'], ['conv', 'rates', 'extend']
  ]
};
