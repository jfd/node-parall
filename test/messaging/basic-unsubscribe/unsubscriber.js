const Buffer            = require("buffer").Buffer
    , equal             = require("assert").equal
    , createChannel     = require("../../../lib").createChannel

const NO_MESSAGE        = 2

var sub = null
  , count = 0
  , didunsubscribe = false
  , didsubscribe = false
  , pattern = new Buffer(process.pid.toString(), "ascii");
  

sub = createChannel("sub");
sub.connect("proc://test-channel");
sub.subscribe(pattern.toString("binary"));
sub.on("message", function(msg) {
  var graph = msg.graph.toString("ascii");

  if (didunsubscribe && !didsubscribe) {
    throw new Error("Received message when in unsubscribe mode");
  }

  if (graph.substr(0, pattern.length) !== pattern.toString("ascii")) {
    throw new Error("Received unexpected message " + graph);
  }
  
  if (++count == NO_MESSAGE && !didunsubscribe) {
    sub.unsubscribe(pattern.toString("binary"));
    equal(Object.keys(sub._rawsubscriptions).length, 0);
    didunsubscribe = true;
    count = 0;
    setTimeout(function() {
      didsubscribe = true;
      sub.subscribe(pattern.toString("binary"));
    }, 50)
  } else if (count == NO_MESSAGE && didsubscribe) {
    sub.unsubscribe(pattern.toString("binary"));
  }
});