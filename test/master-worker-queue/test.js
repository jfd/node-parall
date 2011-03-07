const ok                = require("assert").ok
    , equal             = require("assert").equal
    , createChannel     = require("../../lib").createChannel
    , spawn             = require("../../lib").spawn
    , send              = require("../../lib").send
    , timeout           = require("../common").timeout
    , shutdown          = require("../common").shutdown

const POOL_SIZE         = 2
    , REQUESTS_TO_SEND  = 2000

var master  = null
  , connections  = 0
  , count = 0
  , tokens = []

timeout(5000);

master = createChannel("req");
master.on("connect", function() {
  if (++connections == POOL_SIZE) {
    var reqcount = REQUESTS_TO_SEND;
    while (reqcount--) {
      var req = master.send("test");
      req.receive = function ok(msg, token) {

        if (tokens.indexOf(token) !== -1) {
          throw new Error("Token already received");
        }

        tokens.push(token);

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
          master.sockets.forEach(function(sock) { sock.kill() });
        }
      };
    }
  }
});
master.on("disconnect", function() {
  equal(count, REQUESTS_TO_SEND);
  shutdown();
});

for (var i = 0; i < POOL_SIZE; i++) {
  master.attach(spawn("./worker", "pipe"));
}
