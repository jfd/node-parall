const createChannel     = require("../../../lib").createChannel
    , replyTo           = require("../../../lib/messaging").replyTo
    , reject            = require("../../../lib/messaging").reject

var worker = null
  , rejectMode = false;

worker = createChannel("worker");
worker.encoding = "json";
worker.connect("proc://worker-pool");
worker.onmessage = function(msg) {
  if (msg.data[0] == "set-reject") {
    rejectMode = true;
    replyTo(msg, "ok", process.pid);
  } else if (msg.data[0] == "ping") {
    if (rejectMode) {
      reject(msg);
    } else {
      replyTo(msg, "pong", process.pid);
    }
  } else if (msg.data[0] == "shutdown") {
    process.exit();
  }
}