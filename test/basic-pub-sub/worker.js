const equal             = require("assert").equal
    , createChannel     = require("../../index").createChannel

var messages = parseInt(process.argv[2])
  , message = process.argv[3]
  , sub = null;

sub = createChannel("sub");
sub.subscribe(new Buffer(0));
sub.connect("proc://pub-sub");

sub.recv = function (msg, data) {
  equal(message, data.toString());

  if (--messages == 0) {
    process.exit();
  }  
};