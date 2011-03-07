const equal             = require("assert").equal
    , createChannel     = require("../../lib").createChannel
    , spawn             = require("../../lib").spawn
    , openStdMsg        = require("../../lib/util").openStdMsg
    , timeout           = require("../common").timeout
    , shutdown          = require("../common").shutdown

var master  = null
var req;

timeout(5000);

if (process.argv[2] == "worker") {
  openStdMsg().receive = function ping(msg) {
    msg.reject();
  };
} else {
  master = createChannel("req");
  master.attach(spawn(__filename, ["worker"]));
  req = master.send("ping");
  req.receive = function REJECT() {
    shutdown();
  };
}