const ok                = require("assert").ok
    , createChannel     = require("../../../lib").createChannel
    , send              = require("../../../lib").send

var requests = parseInt(process.argv[2])
  , resp = null
  , count = 0
  , sent = requests

resp = createChannel("resp");

resp.bind("proc://test");
resp.on("message", function(msg) {

  msg.send(msg);

  if (++count == requests) {
    setTimeout(function() {
      process.exit();
    }, 200);
  }  
});