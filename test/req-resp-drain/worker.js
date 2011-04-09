const equal             = require("assert").equal
const createChannel     = require("../../index").createChannel
    , send              = require("../../index").send
    , createPayload     = require("../common").createPayload

const MESSAGE_SIZE      = parseInt(process.argv[2]);

var worker = null
  , count = 0
  , response = createPayload(10);

worker = createChannel("resp");
worker.connect("proc://worker-pool");
worker.recv = function(msg, data) {
  equal(data.length, MESSAGE_SIZE);
  msg.send(response);
};
