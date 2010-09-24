const createChannel     = require("../../../lib").createChannel
    , replyTo           = require("../../../lib/messaging").replyTo
    , ok                = require("../../../lib/messaging").ok
    , createPayload     = require("../../global").createPayload

const MESSAGES_TO_RECV  = parseInt(process.argv[2])

var worker = null
  , count = 0
  , response = createPayload(10);

worker = createChannel("worker");
worker.encoding = "raw";
worker.connect("proc://worker-pool");
worker.onmessage = function(msg) {
  if (msg.data && msg.data.toString("ascii") == "shutdown") {
    process.exit();
  } else {
    replyTo(msg, response);
  }
}