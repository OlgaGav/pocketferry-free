// Small progressive enhancements. The site works fully without this file.
(function () {
  var ua = navigator.userAgent;
  var phone = /Android|iPhone|iPad|iPod/.test(ua);
  var os = phone ? '' : /Windows/.test(ua) ? 'windows' : /Mac OS X|Macintosh/.test(ua) ? 'mac' : /Linux|CrOS/.test(ua) ? 'linux' : '';
  var names = { mac: 'Mac', windows: 'Windows', linux: 'Linux' };

  // Generic download buttons name the visitor's own system.
  if (os) {
    document.querySelectorAll('a[data-download]').forEach(function (a) {
      a.href = '/download/' + os;
      a.rel = 'nofollow';
      a.textContent = 'Download for ' + names[os] + ', free';
    });
    var row = document.querySelector('.dl [data-platform="' + os + '"]');
    if (row) {
      row.classList.add('is-yours');
      row.parentNode.insertBefore(row, row.parentNode.firstChild);
    }
  }

  // On a phone, explain that the app goes on the computer.
  if (phone) {
    document.querySelectorAll('[data-phone-note]').forEach(function (el) { el.hidden = false; });
    document.querySelectorAll('[data-share]').forEach(function (b) {
      b.addEventListener('click', function () {
        var url = location.origin + '/download';
        if (navigator.share) navigator.share({ title: document.title, url: url }).catch(function () {});
        else location.href = 'mailto:?subject=' + encodeURIComponent('PocketFerry download') + '&body=' + encodeURIComponent(url);
      });
    });
  }
})();
