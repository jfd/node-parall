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
  var graph = msg.toString("ascii");

  if (++count == messages) {
    setTimeout(function() {
      process.exit();
    }, 400)
  }
  
  if (count > messages) {
    throw new Error("Received more messages that expected.");
  }
});