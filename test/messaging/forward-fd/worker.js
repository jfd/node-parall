const Socket            = require("net").Socket
    , equal             = require("assert").equal
    , ok                = require("assert").ok
    , createChannel     = require("../../../lib").createChannel
    , send              = require("../../../lib/").send
    , mmatch            = require("../../../lib/").mmatch
    , when              = require("../../../lib/").when
    , Fd                = require("../../../lib/").Fd

var worker = null

worker = createChannel("resp");
worker.connect("proc://worker-pool");
worker.on("message", function(msg) {
  var socket;
  
  equal(msg.graph[0], "hook-fd");
  ok(typeof msg.graph[1] == "number");
  
  socket = new Socket(msg.graph[1]);
  socket.on("data", function(data) {
    this.write(data);
  });
  
  socket.resume();
  
  msg.ok();
});