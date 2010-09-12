const ok                = require("assert").ok
    , throws            = require("assert").throws
    , createChannel     = require("../../../lib").createChannel
    , spawn             = require("../../../lib").spawn
    , replyTo           = require("../../../lib/messaging").replyTo

const POOL_SIZE         = 2,
      REQUESTS_TO_SEND  = 10

var resp  = null
  , pool  = null
  , timer = null
  , count = 0

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

pool.on("workerStop", function(worker, error) {
  if (error) {
    throw error;
  }
});

pool.on("stop", function() {
  
  if (count != POOL_SIZE * REQUESTS_TO_SEND) {
    throw new Error("Message count mismatch");
  }
  
  clearTimeout(timer);
  process.exit();
});

timer = setTimeout(function() {
  throw new Error("Timeout reached");
}, 2000);