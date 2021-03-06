const ok                = require("assert").ok
    , equal             = require("assert").equal
    , createChannel     = require("../../index").createChannel
    , spawn             = require("../../index").spawn
    , timeout           = require("../common").timeout
    , shutdown          = require("../common").shutdown

const POOL_SIZE         = 4;

var master  = null
  , pool  = null
  , connections = 0
  , closingFired = false
  , closeFired = false;

timeout(5000);

master = createChannel("req");
master.listen("proc://worker-pool");
master.on("connect", function() {
  if (++connections == POOL_SIZE) {
    master.close();
  }
});
master.on("closing", function() {
  closingFired = true;
});
master.on("close", function() {
  closeFired = true;
});

function onexit() {
  if (!(--connections)) {
    ok(closingFired);
    ok(closeFired);
    shutdown();
  }
}

for (var i = 0; i < POOL_SIZE; i++) {
  spawn("./worker.js").on("exit", onexit);
}