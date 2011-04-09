const ok                = require("assert").ok
    , createChannel     = require("../../index").createChannel
    , send              = require("../../index").send

var requests = parseInt(process.argv[2])
  , resp = null
  , count = 0
  , sent = requests

resp = createChannel("resp");

resp.listen("proc://test");
resp.recv = function(msg, data) {

  msg.send(data);

  if (++count == requests) {
    setTimeout(function() {
      process.exit();
    }, 200);
  }  
};