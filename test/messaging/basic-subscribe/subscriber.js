const Buffer            = require("buffer").Buffer
    , ok                = require("assert").ok
    , throws            = require("assert").throws
    , createChannel     = require("../../../lib").createChannel

var sub = null
  , messages = parseInt(process.argv[2])
  , count = 0
  , pattern = new Buffer(process.pid.toString(), "ascii");
  

sub = createChannel("sub");
sub.connect("proc://test-channel");
sub.subscribe(pattern.toString());
sub.on("message", function(msg) {
  var graph = msg.graph.toString("ascii");

  if (graph.substr(0, pattern.length) !== pattern.toString("ascii")) {
    throw new Error("Received unexpected message `" + graph + "`");
  }
  
  if (++count == messages) {
    sub.unsubscribe(pattern.toString());
  }
  
  if (count > messages) {
    throw new Error("Received more messages that expected.");
  }
});