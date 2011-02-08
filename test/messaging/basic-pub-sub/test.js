const ok                = require("assert").ok
    , throws            = require("assert").throws
    , createChannel     = require("../../../lib").createChannel
    , spawn             = require("../../../lib").spawn
    , timeout           = require("../../common").timeout
    , shutdown          = require("../../common").shutdown
    

const MESSAGES_TO_SEND  = 1000,
      POOL_SIZE         = 2,
      MESSAGE           = "Broadcast message"

var pub = null
  , pool  = null
  , connections = 0;
  
timeout(5000);

function bcast() {
  var count = MESSAGES_TO_SEND;
  while (count--) {
    pub.send(new Buffer(MESSAGE));
  }
}

pub = createChannel("pub");
pub.listen("proc://pub-sub");

pub.on("connect", function() {
  // We need a timeout here. Child needs time to send the SUBSCRIBE message
  (++connections == POOL_SIZE) && setTimeout(bcast, 200);
});

pub.on("disconnect", function() {
  if (!(--connections)) {
    shutdown();
  }
});

for (var i = 0; i < POOL_SIZE; i++) {
  spawn("./worker", [MESSAGES_TO_SEND, MESSAGE], "pipe");  
}