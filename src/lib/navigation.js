/** Пункты верхнего меню в зависимости от роли. */

const GUEST = [
  { label: 'Вклады', href: '/deposits' },
  { label: 'Кредиты', href: '/loans' },
  { label: 'Курсы валют', href: '/rates' }
];

const CLIENT = [
  { label: 'Главная', href: '/cabinet' },
  { label: 'Счета и карты', href: '/accounts' },
  { label: 'Платежи и переводы', href: '/payments' },
  { label: 'Вклады', href: '/deposits' },
  { label: 'Кредиты', href: '/loans' }
];

const STAFF = [{ label: 'Рабочее место', href: '/workplace' }];

export function navFor(user) {
  if (!user) return GUEST;
  return user.role_code === 'client' ? CLIENT : STAFF;
}
