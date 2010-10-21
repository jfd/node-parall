const ok                = require("assert").ok
    , throws            = require("assert").throws
    , createChannel     = require("../../../lib").createChannel
    , spawn             = require("../../../lib").spawn
    , send              = require("../../../lib").send
    , decode            = require("../../../lib").decode
    , timeout           = require("../../common").timeout
    , shutdown          = require("../../common").shutdown

const POOL_SIZE         = 2,
      REQUESTS_TO_SEND  = 10

var resp  = null
  , pool  = null
  , count = 0
  
timeout(2000);

resp = createChannel("resp");
resp.encoding = "json";
resp.bind("proc://req-resp");

resp.on("message", function(msg) {
  var graph = decode(msg, "json");

  if (graph[0] !== "hello world") {
    throw new Error("Type mismatch");
  }

  count++;
  
  send.call(msg, "ok");
});

pool = spawn("./request.js", POOL_SIZE, [REQUESTS_TO_SEND]);

pool.on("exit", function(worker, code, signal, error) {
  if (error) {
    throw error;
  }
});

pool.on("empty", function() {
  
  if (count != POOL_SIZE * REQUESTS_TO_SEND) {
    throw new Error("Message count mismatch");
  }
  
  shutdown();
});