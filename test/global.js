exports.TMP_PATH = "/var/tmp";


var timer = null;

exports.timeout = function(timeout) {
  timer = setTimeout(function() {
    throw new Error("Timeout reached");
  }, timeout);
}

exports.shutdown = function() {
  clearTimeout(timer);
  process.exit();
}