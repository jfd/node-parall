const ok                = require("assert").ok
    , equal             = require("assert").equal
    , throws            = require("assert").throws
    , createChannel     = require("../../index").createChannel

var requests = parseInt(process.argv[2])
  , ch = null
  , req = null
  , count = 0
  , sent = requests


ch = createChannel("req");
ch.connect("proc://req-resp");

while (sent--) {
  req = ch.send("exec", "hello world");
  
  req.recv = function ok(msg) {
    if (++count == requests) {
      process.exit();
    }
  };
  
  req.recv = function() {
    throw new Error("Unexpected message received ");
  };
}
