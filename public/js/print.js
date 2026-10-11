// Кнопка «Распечатать» (встроенные обработчики запрещены политикой CSP).
document.querySelectorAll('[data-print]').forEach(function (button) {
  button.addEventListener('click', function () { window.print(); });
});
