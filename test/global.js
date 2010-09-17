exports.TMP_PATH = "/var/tmp";
exports.TCP_PORT = 62000;
exports.TCP_HOST = "127.0.0.1";


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