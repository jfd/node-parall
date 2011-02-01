const ok                = require("assert").ok
    , equal             = require("assert").equal
    , createChannel     = require("../../../lib").createChannel
    , spawn             = require("../../../lib").spawn
    , timeout           = require("../../common").timeout
    , shutdown          = require("../../common").shutdown

const POOL_SIZE         = 1,
      REQUESTS_TO_SEND  = 1

var resp  = null
  , pool  = null
  , count = 0
  , disconnects = 0;
  
timeout(2000);

resp = createChannel("resp");
resp.listen("proc://req-resp");

resp.on("message", function(msg) {

  equal(msg.graph[0], "hello world");

  count++;
  
  msg.send("ok");
});

resp.on("disconnect", function() {
        console.log("state: " + state);
  if (++disconnects == POOL_SIZE) {
    equal(count, POOL_SIZE * REQUESTS_TO_SEND);
    shutdown();
  }
});

for (var i = 0; i < POOL_SIZE; i++) {
  spawn("./request", REQUESTS_TO_SEND, "pipe");
}