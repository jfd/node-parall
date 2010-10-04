const ok                = require("assert").ok
    , equal             = require("assert").equal
    , createChannel     = require("../../../lib").createChannel
    , spawn             = require("../../../lib").spawn
    , timeout           = require("../../common").timeout
    , shutdown          = require("../../common").shutdown

const POOL_SIZE         = 4,
      REQUESTS_TO_SEND  = 100

var master  = null
  , pool  = null
  , count = 0
  , tokens = []
  , rejectingPids = []

timeout(5000);

master = createChannel("master");
master.encoding = "json";
master.bind("proc://worker-pool");

pool = spawn("./worker.js", POOL_SIZE);
pool.on("full", function() {
  setTimeout(function() {
    var rejectRequestsToSend = POOL_SIZE / 2;
    
    while (rejectRequestsToSend--) {
      master.send("set-reject", function(resp, pid) {
        rejectingPids.push(pid);
      });
    }
    
    setTimeout(function() {
      var reqcount = REQUESTS_TO_SEND;
      while (reqcount--) {
        master.send("ping", function(resp, pid) {
          equal(resp, "pong");
          equal(rejectingPids.indexOf(pid), -1);
          if (++count == REQUESTS_TO_SEND) {
            master.bcast("shutdown");
          }
          console.log(count);
        });
      }
    }, 200);
    
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