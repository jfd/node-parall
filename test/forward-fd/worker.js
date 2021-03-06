const Socket            = require("net").Socket
    , ok                = require("assert").ok
    , createChannel     = require("../../index").createChannel

var worker = null

worker = createChannel("resp");
worker.connect("proc://worker-pool");
worker.recv = function hook(msg, fd) {
  var sock;
  
  ok(typeof fd == "number");
  
  sock = new Socket(fd);
  sock.on("data", function(data) {
    this.write(data);
  });
  
  sock.resume();
  
  msg.ok();  
};