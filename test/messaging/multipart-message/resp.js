const ok                = require("assert").ok
    , createChannel     = require("../../../lib").createChannel
    , replyTo           = require("../../../lib/messaging").replyTo

var requests = parseInt(process.argv[2])
  , resp = null
  , count = 0
  , sent = requests

resp = createChannel("resp");

resp.bind("proc://test");
resp.on("message", function(msg) {

  replyTo(msg, msg.data);

  if (++count == requests) {
    setTimeout(function() {
      process.exit();
    }, 200);
  }  
});