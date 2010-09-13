const equal             = require("assert").equal
    , createChannel     = require("../../../lib").createChannel

const NO_MESSAGE        = 4

var sub = null
  , count = 0
  , didunsubscribe = false
  , didsubscribe = false
  

sub = createChannel("sub");
sub.connect("proc://test-channel");
sub.subscribe("");
sub.on("message", function(msg) {
  var graph = msg.data.toString("ascii");

  if (didunsubscribe && !didsubscribe) {
    throw new Error("Received message when in unsubscribe mode");
  }

  if (++count == NO_MESSAGE && !didunsubscribe) {
    sub.unsubscribe("");
    equal(Object.keys(sub._subscriptions).length, 0);
    didunsubscribe = true;
    count = 0;
    setTimeout(function() {
      didsubscribe = true;
      sub.subscribe("");
    }, 400)
  } else if (count == NO_MESSAGE && didsubscribe) {
    process.exit();
  }
});