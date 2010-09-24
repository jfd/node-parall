const Buffer            = require("buffer").Buffer

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

exports.createPayload = function(size) {
  var payload = new Buffer(size);
  var index = size;
  
  while (index--) {
    payload[index] = Math.floor(Math.random() * 256);
  }
  
  return payload
}