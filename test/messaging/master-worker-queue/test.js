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
master.listen("proc://worker-pool");
master.on("connect", function() {
  if (++connections == POOL_SIZE) {
    setTimeout(function() {
      var reqcount = REQUESTS_TO_SEND;
      while (reqcount--) {
        master.send("do", function(msg, ok, token) {
          equal(ok, 'OK');
          if (tokens.indexOf(token) !== -1) {
            throw new Error("Token already received");
          }
          tokens.push(token);
          // console.log("count: %s, of: %s" , count, REQUESTS_TO_SEND);
          if (++count == REQUESTS_TO_SEND) {
            equal(master._readySockets.length, POOL_SIZE);
            for (var i = 0; i < POOL_SIZE; i++) {
              equal(master._readySockets[i]._outgoingcount, 0);
              Object.keys(master._readySockets[i]._ackwaitpool)
                .forEach(function(key) {
                  equal(master._readySockets[i]._ackwaitpool[key], 
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
master.on("disconnect", function() {
  equal(count, REQUESTS_TO_SEND);
  shutdown();
});

for (var i = 0; i < POOL_SIZE; i++) {
  workers.push(spawn("./worker"));
}
