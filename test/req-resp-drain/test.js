const Buffer            = require("buffer").Buffer
    , ok                = require("assert").ok
    , equal             = require("assert").equal
    , createChannel     = require("../../lib").createChannel
    , spawn             = require("../../lib").spawn
    , createPayload     = require("../common").createPayload
    , timeout           = require("../common").timeout
    , shutdown          = require("../common").shutdown

const POOL_SIZE         = 2,
      REQUESTS_TO_SEND  = 500,
      MESSAGE_SIZE      = 10240

var master  = null
  , workers  = []
  , connections = POOL_SIZE
  , count = 0
  , graph = createPayload(MESSAGE_SIZE)

timeout(5000);

master = createChannel("req");
master.listen("proc://worker-pool");
master.on("disconnect", function() {
  if (!(--connections)) {
    equal(count, REQUESTS_TO_SEND);
    shutdown();
  }
});

for (var i = 0; i < POOL_SIZE; i++) {
  workers.push(spawn("./worker", [MESSAGE_SIZE], "pipe"));
}

for (var i = 0; i < REQUESTS_TO_SEND; i++) {
  var req = master.send(graph)
  req.recv = function(msg, data) {
    if (++count == REQUESTS_TO_SEND) {
      workers.forEach(function(worker) {
        worker.kill();
      });
    }
  };
}