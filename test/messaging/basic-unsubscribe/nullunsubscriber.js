const equal             = require("assert").equal
    , createChannel     = require("../../../lib").createChannel

const NO_MESSAGE        = 4

var sub = null
  , count = 0
  , didunsubscribe = false
  , didsubscribe = false
  

sub = createChannel("sub");
sub.connect("proc://test-channel");
sub.subscribe(new Buffer(0));
sub.receive = function(msg, data) {

  if (didunsubscribe && !didsubscribe) {
    throw new Error("Received message when in unsubscribe mode");
  }

  if (++count == NO_MESSAGE && !didunsubscribe) {
    sub.unsubscribe(new Buffer(0));
    equal(Object.keys(sub._rawsubscriptions).length, 0);
    didunsubscribe = true;
    count = 0;
    setTimeout(function() {
      didsubscribe = true;
      sub.subscribe(new Buffer(0));
    }, 50)
  } else if (count == NO_MESSAGE && didsubscribe) {
    sub.unsubscribe(new Buffer(0));
  }
};