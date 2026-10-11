(function () {
  function toggle(row) {
    var d = document.getElementById(row.dataset.auditToggle);
    if (!d) return;
    d.hidden = !d.hidden;
    row.setAttribute('aria-expanded', String(!d.hidden));
  }
  document.addEventListener('click', function (e) {
    var row = e.target.closest('[data-audit-toggle]');
    if (row) toggle(row);
  });
  document.addEventListener('keydown', function (e) {
    var row = e.target.closest && e.target.closest('[data-audit-toggle]');
    if (row && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); toggle(row); }
  });
})();
