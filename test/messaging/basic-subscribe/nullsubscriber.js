const Buffer            = require("buffer").Buffer
    , ok                = require("assert").ok
    , throws            = require("assert").throws
    , createChannel     = require("../../../lib").createChannel

var sub = null
  , messages = parseInt(process.argv[2])
  , count = 0
  

sub = createChannel("sub");
sub.connect("proc://test-channel");
sub.subscribe("");
sub.on("message", function(msg) {

  if (++count == messages) {
    sub.unsubscribe("");
  }
  
  if (count > messages) {
    throw new Error("Received more messages that expected.");
  }
});