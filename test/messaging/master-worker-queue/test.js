const ok                = require("assert").ok
    , equal             = require("assert").equal
    , createChannel     = require("../../../lib").createChannel
    , spawn             = require("../../../lib").spawn
    , send              = require("../../../lib").send
    , timeout           = require("../../common").timeout
    , shutdown          = require("../../common").shutdown

const POOL_SIZE         = 2
    , REQUESTS_TO_SEND  = 2000

var master  = null
  , connections  = 0
  , count = 0
  , tokens = []
  , workers = []

timeout(5000);

master = createChannel("master");
master.encoding = "json";
master.bind("proc://worker-pool");
master.on("endpointConnect", function() {
  if (++connections == POOL_SIZE) {
    setTimeout(function() {
      var reqcount = REQUESTS_TO_SEND;
      while (reqcount--) {
        send(master, "do", function(ok, token) {
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
            workers.forEach(function(worker) {
              worker.kill();
            });
          }
        });
      }
    }, 200);
  }
});
master.on("endpointDisconnect", function() {
  equal(count, REQUESTS_TO_SEND);
  shutdown();
});

for (var i = 0; i < POOL_SIZE; i++) {
  workers.push(spawn("./worker"));
}
