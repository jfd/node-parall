const ok                = require("assert").ok
    , equal             = require("assert").equal
    , throws            = require("assert").throws
    , createChannel     = require("../../../lib").createChannel

var requests = parseInt(process.argv[2])
  , req = null
  , count = 0
  , sent = requests


req = createChannel("req");
req.connect("proc://req-resp");

while (sent--) {
  req.send("hello world", function(msg, state) {
    equal(state, "ok");

    if (++count == requests) {
      process.exit();
    }
  });
}
