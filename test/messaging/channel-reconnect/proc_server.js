const equal             = require("assert").equal
    , createChannel     = require("../../../lib").createChannel
    , send              = require("../../../lib").send
    , decode            = require("../../../lib").decode

var resp = null;

resp = createChannel("resp");
resp.encoding = "json";
resp.bind("proc://server");
resp.on("message", function(msg) {
  var graph = decode(msg, "json");
  equal(graph[0], "test");
  send.call(msg, "ok");
  process.nextTick(function() {
    process.exit();
  });
});