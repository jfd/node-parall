const Socket            = require("net").Socket
    , ok                = require("assert").ok
    , createChannel     = require("../../../lib").createChannel

var worker = null

worker = createChannel("resp");
worker.connect("proc://worker-pool");
worker.receive = function hook(msg, fd) {
  var sock;
  
  ok(typeof fd == "number");
  
  sock = new Socket(fd);
  sock.on("data", function(data) {
    this.write(data);
  });
  
  sock.resume();
  
  msg.ok();  
};