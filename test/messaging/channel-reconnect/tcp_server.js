const equal             = require("assert").equal
    , createChannel     = require("../../../lib").createChannel
    , send              = require("../../../lib").send
    , decode            = require("../../../lib").decode

const TCP_PORT          = require("../../common").TCP_PORT
    , TCP_HOST          = require("../../common").TCP_HOST

var resp = null;

resp = createChannel("resp");
resp.encoding = "json";
resp.bind("tcp://" + TCP_HOST + ":" + TCP_PORT);
resp.on("message", function(msg) {
  var graph = decode(msg, "json");
  equal(graph[0], "test");
  send.call(msg, "ok");
  process.nextTick(function() {
    process.exit();
  });
});