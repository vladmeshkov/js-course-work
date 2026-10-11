(function () {
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-confirm-toggle]');
    var c = e.target.closest('[data-confirm-cancel]');
    if (t) { var f = document.getElementById(t.dataset.confirmToggle); if (f) f.hidden = !f.hidden; }
    if (c) { var g = document.getElementById(c.dataset.confirmCancel); if (g) g.hidden = true; }
  });
})();
