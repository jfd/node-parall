const ok                = require("assert").ok
    , throws            = require("assert").throws
    , createChannel     = require("../../../lib").createChannel

var messages = parseInt(process.argv[2])
  , message = process.argv[3]
  , sub = null;

sub = createChannel("sub");
sub.encoding = "ascii";
sub.subscribe("");
sub.connect("proc://pub-sub");
sub.on("message", function(msg) {

  if (message != msg) {
    throw new Error("Bad format");
  }

  if (--messages == 0) {
    process.exit();
  }
});