const equal             = require("assert").equal
    , throws            = require("assert").throws
    , Buffer            = require("buffer").Buffer
    , createChannel     = require("../../../lib").createChannel
    , spawn             = require("../../../lib").spawn
    , timeout           = require("../../common").timeout
    , shutdown          = require("../../common").shutdown

const REQUESTS_TO_SEND  = 10,
      MESSAGE_SIZE      = 1024 * 100

var req  = null
  , pool  = null
  , reqcount = 0
  , msg   = null

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
      reqcount++;
      compare(outmsg, inmsg);
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

req = createChannel("req");
req.connect("proc://test");

sendMessages(req, buildMessage(MESSAGE_SIZE), REQUESTS_TO_SEND);

pool = spawn("./resp.js", 1, [REQUESTS_TO_SEND]);

pool.on("exit", function(worker, code, sig, error) {

  if (error) {
    throw error;
  }
});

pool.on("empty", function() {
  
  equal(reqcount, REQUESTS_TO_SEND);
  
  shutdown();
});