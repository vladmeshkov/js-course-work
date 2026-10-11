// Живой расчёт дохода по вкладу: запрос к серверу, чтобы формула была одна на всю систему.
(function () {
  var input = document.getElementById('amount');
  var income = document.getElementById('calc-income');
  var total = document.getElementById('calc-total');
  var range = document.getElementById('amount-range');
  var bar = document.getElementById('dep-bar');
  var sumEl = document.getElementById('dep-sum');
  var cap = document.getElementById('dep-income-cap');
  if (!input || !income) return;
  var timer;

  function format(minor, currency) {
    var whole = Math.trunc(minor / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    return whole + ',' + String(minor % 100).padStart(2, '0') + ' ' + currency;
  }

  function update() {
    income.classList.add('skeleton');
    total.classList.add('skeleton');
    var url = '/deposits/calc?product=' + encodeURIComponent(input.dataset.product) + '&amount=' + encodeURIComponent(input.value);
    fetch(url, { headers: { Accept: 'application/json' } })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        income.textContent = data.ok ? format(data.income, data.currency) : '—';
        total.textContent = data.ok ? format(data.total, data.currency) : '—';
        if (data.ok && bar) {
          bar.style.width = Math.max(60, Math.min(94, Math.round((data.total - data.income) / data.total * 100))) + '%';
          sumEl.textContent = format(data.total - data.income, data.currency);
          cap.textContent = 'Доход ' + format(data.income, data.currency);
        }
      })
      .catch(function () {})
      .then(function () { income.classList.remove('skeleton'); total.classList.remove('skeleton'); });
  }

  if (range) {
    range.addEventListener('input', function () {
      input.value = String(range.value).replace('.', ',') + ',00';
      clearTimeout(timer);
      timer = setTimeout(update, 120);
    });
    range.value = parseFloat(String(input.value).replace(/\s/g, '').replace(',', '.')) || range.min;
  }
  input.addEventListener('input', function () {
    if (range) range.value = parseFloat(String(input.value).replace(/\s/g, '').replace(',', '.')) || range.min;
    clearTimeout(timer);
    timer = setTimeout(update, 250);
  });
  if (input.value) update();
})();
