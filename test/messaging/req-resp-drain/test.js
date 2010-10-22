const Buffer            = require("buffer").Buffer
    , ok                = require("assert").ok
    , equal             = require("assert").equal
    , createChannel     = require("../../../lib").createChannel
    , spawn             = require("../../../lib").spawn
    , createPayload     = require("../../common").createPayload
    , timeout           = require("../../common").timeout
    , shutdown          = require("../../common").shutdown

const POOL_SIZE         = 2,
      REQUESTS_TO_SEND  = 500,
      MESSAGE_SIZE      = 10240

var master  = null
  , pool  = null
  , count = 0
  , graph = createPayload(MESSAGE_SIZE)

timeout(5000);

master = createChannel("master");
master.encoding = "raw";
master.bind("proc://worker-pool");

pool = spawn("./worker.js", POOL_SIZE, [REQUESTS_TO_SEND / POOL_SIZE]);
pool.on("exit", function(worker, code, no, error) {
  if (code) {
    throw new Error(error);
  }
});
pool.on("empty", function(err, err1,err2) {
  if (count != REQUESTS_TO_SEND) {
    throw new Error("Request count mismatch");
  }
  
  shutdown();
});

for (var i = 0; i < REQUESTS_TO_SEND; i++) {
  master.send(graph, function() {
    if (++count == REQUESTS_TO_SEND) {
      pool.kill();
    }
  });
}