const equal             = require("assert").equal
    , createChannel     = require("../../../lib").createChannel
    , replyTo           = require("../../../lib/messaging").replyTo

var resp = null;

resp = createChannel("resp");
resp.encoding = "json";
resp.bind("sock://server");
resp.on("message", function(msg) {
  equal(msg.data[0], "test");
  replyTo(msg, "ok");
  process.nextTick(function() {
    process.exit();
  });
});