const createChannel     = require("../../index").createChannel

var resp = null;

resp = createChannel("resp");
resp.listen("sock://server");
resp.recv = function test(msg) {
  process.nextTick(function() { process.exit() });
  msg.ok();
};