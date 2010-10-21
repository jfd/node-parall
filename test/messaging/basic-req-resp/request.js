const ok                = require("assert").ok
    , throws            = require("assert").throws
    , createChannel     = require("../../../lib").createChannel
    , send              = require("../../../lib").send

var requests = parseInt(process.argv[2])
  , req = null
  , count = 0
  , sent = requests

req = createChannel("req");
req.encoding = "json";

req.connect("proc://req-resp");

while (sent--) {
  send(req, "hello world", function(state) {
    if (state !== "ok") {
      throw new Error("Expected OK!");
    }

    if (++count == requests) {
      process.exit();
    }
  });
}
