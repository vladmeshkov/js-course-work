(function () {
  var partial = document.getElementById('repay-partial');
  var full = document.getElementById('repay-full');
  if (!partial || !full) return;
  var tabs = document.querySelectorAll('[data-repay-tab]');
  tabs.forEach(function (t) {
    t.addEventListener('click', function () {
      var isFull = t.dataset.repayTab === 'full';
      full.hidden = !isFull;
      partial.hidden = isFull;
      tabs.forEach(function (x) { x.setAttribute('aria-selected', String(x === t)); });
    });
  });
  var balance = Number(partial.dataset.balance);
  var input = partial.querySelector('.repay__amount');
  var msg = document.getElementById('repay-msg');
  var effect = document.getElementById('repay-effect');
  function money(minor) {
    return Math.trunc(minor / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ',' + String(Math.abs(minor) % 100).padStart(2, '0');
  }
  function update() {
    var v = parseFloat(String(input.value).replace(/\s/g, '').replace(',', '.'));
    var minor = Math.round(v * 100);
    if (!input.value) msg.textContent = 'Введите сумму досрочного платежа.';
    else if (!isFinite(minor) || minor <= 0) msg.textContent = 'Введите сумму, например 500,00.';
    else if (minor >= balance) msg.textContent = 'Сумма не меньше остатка долга. Выберите «Полностью».';
    else msg.textContent = 'Остаток долга после платежа: ' + money(balance - minor) + ' BYN.';
    var mode = partial.querySelector('input[name="mode"]:checked').value;
    effect.textContent = mode === 'term' ? 'Платёж по графику останется прежним, срок сократится.' : 'Срок останется прежним, ежемесячный платёж станет меньше.';
  }
  input.addEventListener('input', update);
  partial.addEventListener('change', update);
  update();
})();
