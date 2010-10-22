const equal               = require("assert").equal
    , ok                  = require("assert").ok
    , throws              = require("assert").throws
    , Buffer              = require("buffer").Buffer
    , createChannel       = require("../../lib").createChannel
    , replyTo             = require("../../lib").send
    , timeout             = require("../common").timeout
    , shutdown            = require("../common").shutdown

const SUPPORTED_PROTOCOLS = require("../../lib/messaging").SUPPORTED_PROTOCOLS;

const REQUESTS_TO_SEND    = 10,
      MESSAGE_SIZE        = 1024 * 100

var req  = null
  , resp = null
  , pool  = null
  , reqrecv = 0
  , msg   = null
  
ok(SUPPORTED_PROTOCOLS.indexOf("mem:") != -1, "MemStream is not supported");

function compare(a, b) {
  var l = a.length;
  equal(l, b.length);
  while (l--) {
    equal(a[l], b[l]);
  }
}

function sendMessages(channel, outmsg, count) {
  while (count--) {
    channel.send(outmsg, function(inmsg) {
      compare(outmsg, inmsg);
      if (++reqrecv == REQUESTS_TO_SEND) {
        shutdown();
        process.exit();
      }      
    });
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
resp.bind("mem://test");
resp.on("message", function(msg) {
  msg.send(msg);
});


req = createChannel("req");
req.connect("mem://test");
sendMessages(req, buildMessage(MESSAGE_SIZE), REQUESTS_TO_SEND);

