const createChannel     = require("../../../lib").createChannel

var resp = null;

resp = createChannel("resp");
resp.listen("sock://server");
resp.receive = function test(msg) {
  process.nextTick(function() { process.exit() });
  msg.ok();
};