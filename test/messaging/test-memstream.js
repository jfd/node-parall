const equal               = require("assert").equal
    , ok                  = require("assert").ok
    , createChannel       = require("../../lib").createChannel
    , send                = require("../../lib").send
    , decode              = require("../../lib").decode
    , timeout             = require("../common").timeout
    , shutdown            = require("../common").shutdown
    
const SUPPORTED_PROTOCOLS = require("../../lib/messaging").SUPPORTED_PROTOCOLS;

var req = null
  , resp = null


ok(SUPPORTED_PROTOCOLS.indexOf("mem:") != -1, "MemStream is not supported");

timeout(1000);

resp = createChannel("resp");
resp.encoding = "json";
resp.bind("mem://test");
resp.on("message", function(msg) {
  var graph = decode(msg, this.encoding);
  equal(graph[0], "ping");
  send(msg, "pong");
});

req = createChannel("req");
req.encoding = "json";
req.connect("mem://test");
send(req, "ping", function(answer) {
  equal(answer, "pong");
  shutdown();
});