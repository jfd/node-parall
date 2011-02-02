const equal             = require("assert").equal
    , createChannel     = require("../../../lib").createChannel
    , send              = require("../../../lib").send
    , decode            = require("../../../lib").decode

var resp = null;

resp = createChannel("resp");
resp.listen("proc://server");
resp.on("message", function(msg) {
  equal(msg.graph[0], "test");
  process.nextTick(function() { process.exit() });
  msg.ok();
});