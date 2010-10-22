const createChannel     = require("../../../lib").createChannel
    , send              = require("../../../lib/").send
    , decode            = require("../../../lib/").decode

var worker = null
  , count = 0;

worker = createChannel("worker");
worker.encoding = "json";
worker.connect("proc://worker-pool");
worker.on("message", function(msg) {
  var graph = decode(msg, this.encoding);
  if (graph[0] == "do") {
    send.call(msg, "ok", process.pid.toString() + (count++));
  } else {
    throw new Error("Unexpected message");
  }
});