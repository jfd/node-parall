const createChannel     = require("../../../lib").createChannel
    , replyTo           = require("../../../lib/messaging").replyTo
    , ok                = require("../../../lib/messaging").ok

var worker = null
  , count = 0;

worker = createChannel("worker");
worker.encoding = "json";
worker.connect("proc://worker-pool");
worker.onmessage = function(msg) {
  if (msg.data[0] == "do") {
    replyTo(msg, "ok", process.pid.toString() + (count++));
  } else if (msg.data[0] == "shutdown") {
    process.exit();
  }
}