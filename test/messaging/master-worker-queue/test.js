const ok                = require("assert").ok
    , equal             = require("assert").equal
    , createChannel     = require("../../../lib").createChannel
    , spawn             = require("../../../lib").spawn

const POOL_SIZE         = 2,
      REQUESTS_TO_SEND  = 4000

var master  = null
  , pool  = null
  , timer = null
  , count = 0
  , tokens = []

master = createChannel("master");
master.encoding = "json";
master.bind("proc://worker-pool");

pool = spawn("./worker.js", POOL_SIZE);
pool.on("start", function() {
  setTimeout(function() {
    var reqcount = REQUESTS_TO_SEND;
    while (reqcount--) {
      master.recv("do", function(ok, token) {
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
pool.on("workerStop", function(worker, code, no, error) {
  if (code) {
    throw new Error(error);
  }
});
pool.on("stop", function() {
  
  if (count != REQUESTS_TO_SEND) {
    throw new Error("Request count mismatch");
  }
  
  clearTimeout(timer);
  process.exit();
});

timer = setTimeout(function() {
  throw new Error("Timeout reached");
}, 5000);