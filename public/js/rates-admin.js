(function () {
  var form = document.querySelector('form[action="/admin/rates/spreads"]');
  if (!form) return;
  var inputs = Array.prototype.slice.call(form.querySelectorAll('input.mini'));
  var counter = document.getElementById('rates-changes');
  function count() {
    var n = inputs.filter(function (i) { return i.value !== i.defaultValue; }).length;
    counter.textContent = n ? 'Изменено значений: ' + n : 'Изменений нет';
  }
  form.addEventListener('input', count);
  form.querySelectorAll('[data-spread]').forEach(function (b) {
    b.addEventListener('click', function () {
      inputs.forEach(function (i) { i.value = b.dataset.spread; });
      form.querySelectorAll('[data-spread]').forEach(function (x) { x.setAttribute('aria-selected', String(x === b)); });
      count();
    });
  });
  document.getElementById('rates-reset').addEventListener('click', function () {
    inputs.forEach(function (i) { i.value = i.defaultValue; });
    form.querySelectorAll('[data-spread]').forEach(function (x) { x.setAttribute('aria-selected', 'false'); });
    count();
  });
})();
