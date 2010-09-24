const ok                = require("assert").ok
    , throws            = require("assert").throws
    , createChannel     = require("../../../lib").createChannel

var requests = parseInt(process.argv[2])
  , req = null
  , count = 0
  , sent = requests

req = createChannel("req");
req.encoding = "json";

req.connect("proc://req-resp");

function onrecv(ok) {
  if (ok !== "ok") {
    throw new Error("Expected OK!");
  }
  
  if (++count == requests) {
    process.exit();
  }
}

while (sent--) {
  req.send("hello world", onrecv);
}
