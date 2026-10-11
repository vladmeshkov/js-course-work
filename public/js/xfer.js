(function () {
  var select = document.getElementById('fromAccountId');
  var cur = document.getElementById('xfer-cur');
  if (!select || !cur) return;
  function sync() { var o = select.options[select.selectedIndex]; if (o && o.dataset.currency) cur.textContent = o.dataset.currency; }
  select.addEventListener('change', sync);
  sync();
})();
