const equal             = require("assert").equal
    , createChannel     = require("../../../lib").createChannel
    , send              = require("../../../lib/").send
    , decode            = require("../../../lib/").decode

var worker = null
  , count = 0;

worker = createChannel("resp");
worker.connect("proc://worker-pool");
worker.on("message", function(msg) {
  equal(msg.graph[0], "do");
  msg.send('OK', process.pid.toString() + (count++));
});