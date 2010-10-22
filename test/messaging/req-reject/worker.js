const createChannel     = require("../../../lib").createChannel
    , send              = require("../../../lib/").send
    , reject            = require("../../../lib/").reject
    , decode            = require("../../../lib/").decode

var worker = null
  , rejectMode = false;

worker = createChannel("worker");
worker.encoding = "json";
worker.connect("proc://worker-pool");
worker.on("message", function(msg) {
  var graph = decode(msg, this.encoding);
  if (graph[0] == "set-reject") {
    rejectMode = true;
    send.call(msg, "ok", process.pid);
  } else if (graph[0] == "ping") {
    if (rejectMode) {
      reject.call(msg);
    } else {
      send.call(msg, "pong", process.pid);
    }
  } else {
    throw new Error("Bad message");
  }
});