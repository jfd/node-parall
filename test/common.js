const Buffer            = require("buffer").Buffer

exports.TMP_PATH = "/var/tmp";
exports.TCP_PORT = 62000;
exports.TCP_HOST = "127.0.0.1";


var timer = null;

exports.timeout = function(timeout) {
  timer = setTimeout(function() {
    exports.shutdown(new Error("Timeout reached"));
  }, timeout);
}

exports.shutdown = function(exception) {
  clearTimeout(timer);

  if (exception) {
    process.removeAllListeners("uncaughtException");
    throw exception;
  } else {
    process.exit();
  }
}

exports.createPayload = function(size) {
  var payload = new Buffer(size);
  var index = size;
  
  while (index--) {
    payload[index] = Math.floor(Math.random() * 256);
  }
  
  return payload
}