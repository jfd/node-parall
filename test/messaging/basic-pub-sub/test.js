const ok                = require("assert").ok
    , throws            = require("assert").throws
    , createChannel     = require("../../../lib").createChannel
    , spawn             = require("../../../lib").spawn

const MESSAGES_TO_SEND  = 1000,
      MESSAGE           = "Broadcast message"

var pub = null
  , pool  = null
  , timer = null

pub = createChannel("pub");
pub.encoding = "ascii";
pub.bind("proc://pub-sub");

pool = spawn("./worker.js", 2, [MESSAGES_TO_SEND, MESSAGE]);

pool.on("start", function() {
  setTimeout(function() {
    var count = MESSAGES_TO_SEND;
    while (count--) {
      pub.bcast(MESSAGE) 
    }
  }, 200);
});

pool.on("workerStop", function(worker, error) {
  if (error) {
    throw error;
  }
});

pool.on("stop", function() {
  clearTimeout(timer);
  process.exit();
});

timer = setTimeout(function() {
  throw new Error("Timeout reached");
}, 2000);