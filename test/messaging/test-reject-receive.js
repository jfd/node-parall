const equal             = require("assert").equal
    , createChannel     = require("../../lib").createChannel
    , spawn             = require("../../lib").spawn
    , receive           = require("../../lib").receive
    , timeout           = require("../common").timeout
    , shutdown          = require("../common").shutdown

var master  = null

timeout(5000);

if (process.argv[2] == "worker") {
  receive (
    "ping", function() {
      this.reject();
    }
  )
} else {
  master = createChannel("req");
  master.attach(spawn(__filename, ["worker"]));
  master.send("ping", function(msg, state) {
    equal(state, 'REJECT');
    shutdown();
  });
}