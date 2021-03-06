const equal               = require("assert").equal
    , ok                  = require("assert").ok
    , createChannel       = require("../index").createChannel
    , timeout             = require("./common").timeout
    , shutdown            = require("./common").shutdown
    
var req = null
  , resp = null

timeout(1000);

resp = createChannel("resp");
resp.listen("mem://test");
resp.on("error", function(err) {
  console.log(err);
});
resp.recv = function ping(msg) {
  msg.send("pong");
};

req = createChannel("req");
req.connect("mem://test");
req.on("error", function(err) {
  console.log(err);
});

var r = req.send("ping");
r.recv = function pong(msg) {
  shutdown();
};