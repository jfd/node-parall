const ok                = require("assert").ok
    , equal             = require("assert").equal
    , throws            = require("assert").throws
    , createChannel     = require("../../../lib").createChannel

var requests = parseInt(process.argv[2])
  , ch = null
  , req = null
  , count = 0
  , sent = requests


ch = createChannel("req");
ch.connect("proc://req-resp");

while (sent--) {
  req = ch.send("exec", "hello world");
  
  req.receive = function OK(msg) {
    if (++count == requests) {
      process.exit();
    }
  };
  
  req.receive = function() {
    console.log.apply(null, arguments);
    throw new Error(["Unexpected message received "].join(arguments).toString());
  };
}
