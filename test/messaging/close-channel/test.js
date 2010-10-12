const ok                = require("assert").ok
    , equal             = require("assert").equal
    , createChannel     = require("../../../lib").createChannel
    , spawn             = require("../../../lib").spawn
    , timeout           = require("../../common").timeout
    , shutdown          = require("../../common").shutdown

const POOL_SIZE         = 4;

var master  = null
  , pool  = null
  , connectCount = 0
  , closingFired = false
  , closeFired = false;

timeout(5000);

master = createChannel("master");
master.bind("proc://worker-pool");
master.on("endpointConnect", function() {
  connectCount++;
  if (connectCount == POOL_SIZE) {
    master.close();
  }
});
master.on("closing", function() {
  closingFired = true;
});
master.on("close", function() {
  closeFired = true;
});

pool = spawn("./worker.js", POOL_SIZE);
pool.on("empty", function() {
  ok(closingFired);
  ok(closeFired);
  shutdown();
});