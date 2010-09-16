const ok                = require("assert").ok
    , throws            = require("assert").throws
    , createChannel     = require("../../../lib").createChannel
    , spawn             = require("../../../lib").spawn
    , timeout           = require("../../global").timeout
    , shutdown          = require("../../global").shutdown
    

const MESSAGES_TO_SEND  = 1000,
      MESSAGE           = "Broadcast message"

var pub = null
  , pool  = null
  
timeout(5000);

pub = createChannel("pub");
pub.encoding = "ascii";
pub.bind("proc://pub-sub");

pool = spawn("./worker.js", 2, [MESSAGES_TO_SEND, MESSAGE]);

pool.on("full", function() {
  setTimeout(function() {
    var count = MESSAGES_TO_SEND;
    while (count--) {
      pub.bcast(MESSAGE) 
    }
  }, 200);
});

pool.on("exit", function(worker, error) {
  if (error) {
    throw error;
  }
});

pool.on("empty", shutdown);