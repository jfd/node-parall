const createChannel     = require("../../lib").createChannel

var resp;

resp = createChannel("resp");
resp.listen("proc://server");
resp.recv = function test(msg) {
  process.nextTick(function() { process.exit() });
  msg.ok();
};