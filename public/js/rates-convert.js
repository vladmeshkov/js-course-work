// Конвертер валют на странице курсов: расчёт делает сервер по курсам банка.
(function () {
  var amount = document.getElementById('conv-amount');
  var from = document.getElementById('conv-from');
  var to = document.getElementById('conv-to');
  var result = document.getElementById('conv-result');
  if (!amount) return;
  var timer;

  function money(minor) {
    var whole = Math.trunc(minor / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    return whole + ',' + String(minor % 100).padStart(2, '0');
  }

  function update() {
    var url = '/rates/convert?from=' + from.value + '&to=' + to.value + '&amount=' + encodeURIComponent(amount.value);
    fetch(url).then(function (r) { return r.json(); }).then(function (d) {
      result.textContent = d.ok ? money(d.result) + ' ' + to.value : '—';
    }).catch(function () {});
  }

  [amount, from, to].forEach(function (el) {
    el.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(update, 200); });
  });
  update();
})();
