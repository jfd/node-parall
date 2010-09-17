const equal             = require("assert").equal
    , createChannel     = require("../../../lib").createChannel
    , replyTo           = require("../../../lib/messaging").replyTo

const TCP_PORT          = require("../../global").TCP_PORT
    , TCP_HOST          = require("../../global").TCP_HOST

var resp = null;

resp = createChannel("resp");
resp.encoding = "json";
resp.bind("tcp://" + TCP_HOST + ":" + TCP_PORT);
resp.on("message", function(msg) {
  equal(msg.data[0], "test");
  replyTo(msg, "ok");
  process.nextTick(function() {
    process.exit();
  });
});