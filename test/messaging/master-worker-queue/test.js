const ok                = require("assert").ok
    , equal             = require("assert").equal
    , createChannel     = require("../../../lib").createChannel
    , spawn             = require("../../../lib").spawn
    , timeout           = require("../../common").timeout
    , shutdown          = require("../../common").shutdown

const POOL_SIZE         = 2,
      REQUESTS_TO_SEND  = 4000

var master  = null
  , pool  = null
  , count = 0
  , tokens = []

timeout(5000);

master = createChannel("master");
master.encoding = "json";
master.bind("proc://worker-pool");

pool = spawn("./worker.js", POOL_SIZE);
pool.on("full", function() {
  setTimeout(function() {
    var reqcount = REQUESTS_TO_SEND;
    while (reqcount--) {
      master.send("do", function(ok, token) {
        if (ok !== "ok") throw new Error(ok);
        if (tokens.indexOf(token) !== -1) {
          throw new Error("Token already received");
        }
        tokens.push(token);
        if (++count == REQUESTS_TO_SEND) {
          equal(master._readyRemoteEndpoints.length, POOL_SIZE);
          for (var i = 0; i < POOL_SIZE; i++) {
            equal(master._readyRemoteEndpoints[i].outgoingCount, 0);
            Object.keys(master._readyRemoteEndpoints[i]._ackWaitPool)
              .forEach(function(key) {
                equal(master._readyRemoteEndpoints[i]._ackWaitPool[key], 
                      undefined);
            });
          }
          master.bcast("shutdown");
        }
      });
    }
  }, 200);
});
pool.on("exit", function(worker, code, no, error) {
  if (code) {
    throw new Error(error);
  }
});
pool.on("empty", function() {
  
  if (count != REQUESTS_TO_SEND) {
    throw new Error("Request count mismatch");
  }
  
  shutdown();
});