const equal               = require("assert").equal
    , ok                  = require("assert").ok
    , throws              = require("assert").throws
    , Buffer              = require("buffer").Buffer
    , createChannel       = require("../../lib").createChannel
    , timeout             = require("../common").timeout
    , shutdown            = require("../common").shutdown

const REQUESTS_TO_SEND    = 10,
      MESSAGE_SIZE        = 1024 * 100

var req  = null
  , resp = null
  , pool  = null
  , reqrecv = 0
  , msg   = null

function compare(a, b) {
  var l = a.length;
  equal(l, b.length);
  while (l--) {
    equal(a[l], b[l]);
  }
}

function sendMessages(channel, outmsg, count) {
  var req;
  
  while (count--) {
    req = channel.send(outmsg);
    req.receive = function(msg, data) {
      compare(outmsg, msg.graph);
      if (++reqrecv == REQUESTS_TO_SEND) {
        shutdown();
        process.exit();
      }      
    };
  }
}

function buildMessage(size) {
  var msg = new Buffer(size);
  var index = size;
  
  while (index--) {
    msg[index] = ~~(Math.random() * 256);
  }

  return msg;
}
  
timeout(2000);

resp = createChannel("resp");
resp.listen("mem://test");
resp.receive = function(msg, data) {
  msg.send(data);
};

req = createChannel("req");
req.connect("mem://test");
sendMessages(req, buildMessage(MESSAGE_SIZE), REQUESTS_TO_SEND);

