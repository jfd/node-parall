const equal               = require("assert").equal
    , ok                  = require("assert").ok
    , createChannel       = require("../../lib/messaging").createChannel
    , replyTo             = require("../../lib/messaging").replyTo
    , timeout             = require("../global").timeout
    , shutdown            = require("../global").shutdown
    
const SUPPORTED_PROTOCOLS = require("../../lib/messaging").SUPPORTED_PROTOCOLS;

var req = null
  , resp = null


ok(SUPPORTED_PROTOCOLS.indexOf("mem:") != -1, "MemStream is not supported");

timeout(1000);

resp = createChannel("resp");
resp.encoding = "json";
resp.bind("mem://test");
resp.on("message", function(msg) {
  equal(msg.data[0], "ping");
  replyTo(msg, "pong");
});

req = createChannel("req");
req.encoding = "json";
req.connect("mem://test");
req.recv("ping", function(answer) {
  equal(answer, "pong");
  shutdown();
});