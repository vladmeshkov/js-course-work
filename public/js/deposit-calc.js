// Живой расчёт дохода по вкладу: запрос к серверу, чтобы формула была одна на всю систему.
(function () {
  var input = document.getElementById('amount');
  var income = document.getElementById('calc-income');
  var total = document.getElementById('calc-total');
  if (!input || !income) return;
  var timer;

  function format(minor, currency) {
    var whole = Math.trunc(minor / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    return whole + ',' + String(minor % 100).padStart(2, '0') + ' ' + currency;
  }

  function update() {
    var url = '/deposits/calc?product=' + encodeURIComponent(input.dataset.product) + '&amount=' + encodeURIComponent(input.value);
    fetch(url, { headers: { Accept: 'application/json' } })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        income.textContent = data.ok ? format(data.income, data.currency) : '—';
        total.textContent = data.ok ? format(data.total, data.currency) : '—';
      })
      .catch(function () {});
  }

  input.addEventListener('input', function () {
    clearTimeout(timer);
    timer = setTimeout(update, 250);
  });
  if (input.value) update();
})();
