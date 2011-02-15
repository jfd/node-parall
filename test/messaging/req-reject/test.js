const ok                = require("assert").ok
    , equal             = require("assert").equal
    , createChannel     = require("../../../lib").createChannel
    , spawn             = require("../../../lib").spawn
    , timeout           = require("../../common").timeout
    , shutdown          = require("../../common").shutdown

const POOL_SIZE         = 4,
      REQUESTS_TO_SEND  = 100

var master  = null
  , connections  = 0
  , count = 0
  , tokens = []
  , rejectingPids = []

timeout(5000);

master = createChannel("req");

master.on("connect", function() {
  var rejectRequestsToSend = POOL_SIZE / 2;

  if (++connections != POOL_SIZE) {
    return;
  }

  while (rejectRequestsToSend--) {
    master.send("set-reject", 1, function(msg, resp, pid) {
      rejectingPids.push(pid);
    });
  }

  setTimeout(function() {
    var reqcount = REQUESTS_TO_SEND;
    while (reqcount--) {
      master.send("ping", function(msg, resp, pid) {
        equal(resp, "pong");
        equal(rejectingPids.indexOf(pid), -1);
        if (++count == REQUESTS_TO_SEND) {
          master.sockets.forEach(function(worker) {
            worker.kill();
          });
        }
      });
    }

    setTimeout(function() {
      master.sockets.forEach(function(sock) {
        sock.send("set-reject", 0);
      });
      rejectingPids = [];
    }, 100);
    
  }, 200);
  
});
master.on("disconnect", function() {
  if (!(--connections)) {
    equal(count, REQUESTS_TO_SEND);
    shutdown();
  }
});

for (var i = 0; i < POOL_SIZE; i++) {
  master.attach(spawn("./worker"));
}