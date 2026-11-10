// Русские подписи для внутренних кодов: виды документов (проводок) и события журнала аудита.
// Код без подписи показывается как есть, чтобы новое событие не пропало из таблицы.

/** Виды документов двойной записи. */
const DOCUMENTS = {
  transfer_own: 'Перевод между своими счетами',
  transfer_client: 'Перевод клиенту банка',
  interbank_out: 'Перевод в другой банк',
  interbank_in: 'Поступление из другого банка',
  payment: 'Оплата услуг',
  card_purchase: 'Покупка по карте',
  cash_in: 'Взнос наличных',
  cash_out: 'Выдача наличных',
  deposit_open: 'Открытие вклада',
  deposit_interest: 'Проценты по вкладу',
  deposit_return: 'Возврат вклада',
  deposit_clawback: 'Удержание процентов по вкладу',
  loan_issue: 'Выдача кредита',
  loan_payment: 'Платёж по кредиту',
  loan_partial: 'Частичное досрочное погашение',
  loan_payoff: 'Полное погашение кредита',
  storno: 'Сторно'
};

/** События журнала аудита. */
const ACTIONS = {
  'auth.login': 'Вход', 'auth.logout': 'Выход', 'auth.2fa': 'Код второго фактора',
  '2fa.enable': 'Включена 2FA', '2fa.disable': 'Отключена 2FA', '2fa.recovery_used': 'Использован резервный код',
  'client.register': 'Регистрация клиента',
  'kyc.view': 'Просмотр анкеты', 'kyc.verify': 'Анкета подтверждена', 'kyc.reject': 'Анкета отклонена',
  'account.open': 'Открытие счёта', 'account.close': 'Закрытие счёта', 'account.freeze': 'Блокировка счёта', 'account.unfreeze': 'Разблокировка счёта',
  'transfer.done': 'Перевод выполнен', 'transfer.held': 'Перевод задержан', 'transfer.otp_sent': 'Отправлен код перевода',
  'interbank.queued': 'Перевод в другой банк принят', 'interbank.held': 'Перевод в другой банк задержан',
  'interbank.cancel': 'Перевод в другой банк отменён', 'interbank.incoming': 'Входящий платёж',
  'fraud.approve': 'Антифрод: одобрено', 'fraud.reject': 'Антифрод: отклонено',
  'payment.done': 'Оплата услуг', 'autopay.create': 'Подключён автоплатёж',
  'card.issue': 'Выпуск карты', 'card.block': 'Блокировка карты', 'card.unblock': 'Разблокировка карты', 'card.close': 'Закрытие карты', 'card.limits': 'Лимиты карты',
  'deposit.open': 'Открытие вклада', 'deposit.close_early': 'Досрочное закрытие вклада',
  'loan.apply': 'Заявка на кредит', 'loan.approve': 'Кредит одобрен', 'loan.reject': 'Кредит отклонён',
  'loan.issue': 'Выдача кредита', 'loan.partial': 'Частичное погашение', 'loan.payoff': 'Полное погашение',
  'user.create': 'Создан пользователь', 'user.block': 'Пользователь заблокирован', 'user.unblock': 'Пользователь разблокирован', 'user.role': 'Смена роли',
  'rates.refresh': 'Обновление курсов', 'rates.spread': 'Изменение спреда', 'settings.update': 'Изменение настроек',
  'backup.create': 'Резервная копия', 'backup.restore': 'Восстановление из копии', 'eod.close_day': 'Закрытие дня'
};

/** Подпись вида документа: «Перевод клиенту банка». */
export const documentLabel = (type) => (Object.hasOwn(DOCUMENTS, type) ? DOCUMENTS[type] : type);

/** Подпись события журнала: «Вход». */
export const actionLabel = (action) => (Object.hasOwn(ACTIONS, action) ? ACTIONS[action] : action);
