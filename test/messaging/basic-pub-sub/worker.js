const equal             = require("assert").equal
    , createChannel     = require("../../../lib").createChannel

var messages = parseInt(process.argv[2])
  , message = process.argv[3]
  , sub = null;

sub = createChannel("sub");
sub.subscribe("");
sub.connect("proc://pub-sub");
sub.on("message", function(msg) {

  equal(message, msg.graph);

  if (--messages == 0) {
    process.exit();
  }
});