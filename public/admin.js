// Hover and keyboard-free tooltips for the admin charts.
(function () {
  var tip = document.getElementById('tip');
  if (!tip) return;
  document.querySelectorAll('.chart .hit').forEach(function (el) {
    el.addEventListener('pointermove', function (e) {
      tip.textContent = el.getAttribute('data-tip');
      tip.hidden = false;
      var x = Math.min(e.clientX + 14, window.innerWidth - tip.offsetWidth - 8);
      tip.style.left = x + 'px';
      tip.style.top = e.clientY + window.scrollY - 38 + 'px';
    });
    el.addEventListener('pointerleave', function () { tip.hidden = true; });
  });
})();
