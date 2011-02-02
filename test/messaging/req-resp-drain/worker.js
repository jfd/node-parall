const createChannel     = require("../../../lib").createChannel
    , send              = require("../../../lib/").send
    , createPayload     = require("../../common").createPayload

const MESSAGES_TO_RECV  = parseInt(process.argv[2])

var worker = null
  , count = 0
  , response = createPayload(10);

worker = createChannel("worker");
worker.connect("proc://worker-pool");
worker.on("message", function(msg) {
  msg.send(response);
});