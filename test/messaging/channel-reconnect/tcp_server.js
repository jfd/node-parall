const equal             = require("assert").equal
    , createChannel     = require("../../../lib").createChannel
    , send              = require("../../../lib").send
    , decode            = require("../../../lib").decode
    , geturi            = require("../../../lib").geturi

const TCP_PORT          = require("../../common").TCP_PORT
    , TCP_HOST          = require("../../common").TCP_HOST

var resp = null;

resp = createChannel("resp");
resp.listen(geturi("tcp", TCP_HOST, TCP_PORT));
resp.on("message", function(msg) {
  equal(msg.graph[0], "test");
  process.nextTick(function() { process.exit() });
  return msg.ok();
});