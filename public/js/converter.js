// Конвертер валют: расчёт делает сервер по курсам банка, формула одна на всю систему.
(function () {
  var amount = document.getElementById('conv-amount');
  var result = document.getElementById('conv-result');
  var curLabel = document.getElementById('conv-cur');
  var pills = document.querySelectorAll('.cur-pill');
  if (!amount || !pills.length) return;
  var current = pills[0].dataset.cur;
  var timer;

  function money(minor) {
    var whole = Math.trunc(minor / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    return whole + ',' + String(minor % 100).padStart(2, '0');
  }

  function update() {
    result.classList.add('skeleton');
    var url = '/rates/convert?from=BYN&to=' + current + '&amount=' + encodeURIComponent(amount.value);
    fetch(url).then(function (r) { return r.json(); }).then(function (d) {
      result.textContent = d.ok ? money(d.result) : '—';
    }).catch(function () {}).then(function () { result.classList.remove('skeleton'); });
  }

  pills.forEach(function (pill) {
    pill.addEventListener('click', function () {
      current = pill.dataset.cur;
      curLabel.textContent = current;
      pills.forEach(function (p) { p.setAttribute('aria-checked', String(p === pill)); });
      update();
    });
  });
  amount.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(update, 200); });
  update();
})();
