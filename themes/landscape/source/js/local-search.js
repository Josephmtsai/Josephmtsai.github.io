var searchXmlPath = '/search.xml';

function LocalSearch() {
  this.data = null;
}

LocalSearch.prototype.load = function(callback) {
  if (this.data) { callback(this.data); return; }
  var self = this;
  var xhr = new XMLHttpRequest();
  xhr.open('GET', searchXmlPath, true);
  xhr.onload = function() {
    if (xhr.status === 200) {
      var parser = new DOMParser();
      var xml = parser.parseFromString(xhr.responseText, 'text/xml');
      var entries = xml.querySelectorAll('entry');
      self.data = [];
      entries.forEach(function(entry) {
        self.data.push({
          title: (entry.querySelector('title') || {}).textContent || '',
          url: (entry.querySelector('url') || {}).textContent || '',
          content: (entry.querySelector('content') || {}).textContent || ''
        });
      });
      callback(self.data);
    }
  };
  xhr.send();
};

LocalSearch.prototype.search = function(keyword, callback) {
  if (!keyword.trim()) { callback([]); return; }
  var kw = keyword.trim().toLowerCase();
  this.load(function(data) {
    var results = data.filter(function(item) {
      return item.title.toLowerCase().indexOf(kw) !== -1 ||
             item.content.toLowerCase().indexOf(kw) !== -1;
    }).slice(0, 8);
    callback(results);
  });
};

(function($) {
  var localSearch = new LocalSearch();
  var $input = $('.search-form-input');
  var $results = $('<ul id="local-search-results"></ul>');

  $input.after($results);

  var debounceTimer;
  $input.on('input', function() {
    clearTimeout(debounceTimer);
    var kw = $(this).val();
    if (!kw.trim()) { $results.empty().hide(); return; }
    debounceTimer = setTimeout(function() {
      localSearch.search(kw, function(items) {
        $results.empty();
        if (!items.length) {
          $results.append('<li class="no-result">找不到相關文章</li>').show();
          return;
        }
        items.forEach(function(item) {
          $results.append(
            '<li><a href="' + item.url + '">' + item.title + '</a></li>'
          );
        });
        $results.show();
      });
    }, 200);
  });

  $input.on('blur', function() {
    setTimeout(function() { $results.hide(); }, 200);
  });

  $input.on('focus', function() {
    if ($results.children().length) $results.show();
  });

  // prevent form submit to Google
  $('.search-form').on('submit', function(e) {
    e.preventDefault();
  });
})(jQuery);
