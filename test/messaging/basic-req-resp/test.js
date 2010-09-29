const ok                = require("assert").ok
    , throws            = require("assert").throws
    , createChannel     = require("../../../lib").createChannel
    , spawn             = require("../../../lib").spawn
    , replyTo           = require("../../../lib/messaging").replyTo
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

  if (msg.data[0] !== "hello world") {
    throw new Error("Type mismatch");
  }

  count++;
  
  replyTo(msg, "ok");
});

pool = spawn("./request.js", POOL_SIZE, [REQUESTS_TO_SEND]);

pool.on("exit", function(worker, error) {
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