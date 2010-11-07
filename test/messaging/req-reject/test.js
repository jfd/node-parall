const ok                = require("assert").ok
    , equal             = require("assert").equal
    , createChannel     = require("../../../lib").createChannel
    , spawn             = require("../../../lib").spawn
    , send              = require("../../../lib").send
    , timeout           = require("../../common").timeout
    , shutdown          = require("../../common").shutdown

const POOL_SIZE         = 4,
      REQUESTS_TO_SEND  = 100

var master  = null
  , workers = []
  , connections  = 0
  , count = 0
  , tokens = []
  , rejectingPids = []

timeout(5000);

master = createChannel("master");
master.encoding = "json";
master.bind("proc://worker-pool");
master.on("endpointConnect", function() {
  if (++connections == POOL_SIZE) {
    setTimeout(function() {
      var rejectRequestsToSend = POOL_SIZE / 2;

      while (rejectRequestsToSend--) {
        send(master, "set-reject", function(resp, pid) {
          rejectingPids.push(pid);
        });
      }

      setTimeout(function() {
        var reqcount = REQUESTS_TO_SEND;
        while (reqcount--) {
          send(master, "ping", function(resp, pid) {
            equal(resp, "pong");
            equal(rejectingPids.indexOf(pid), -1);
            if (++count == REQUESTS_TO_SEND) {
              workers.forEach(function(worker) {
                worker.kill();
              });
            }
          });
        }
      }, 200);

    }, 200);
  }
});
master.on("endpointDisconnect", function() {
  if (!(--connections)) {
    equal(count, REQUESTS_TO_SEND);
    shutdown();
  }
});

for (var i = 0; i < POOL_SIZE; i++) {
  workers.push(spawn("./worker"));
}