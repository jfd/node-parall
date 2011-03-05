const createChannel     = require("../../../lib").createChannel
    , geturi            = require("../../../lib").geturi

const TCP_PORT          = require("../../common").TCP_PORT
    , TCP_HOST          = require("../../common").TCP_HOST

var resp = null;

resp = createChannel("resp");
resp.listen(geturi("tcp", TCP_HOST, TCP_PORT));
resp.receive = function test(msg) {
  process.nextTick(function() { process.exit() });
  return msg.ok();
};