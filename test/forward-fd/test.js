const ok                = require("assert").ok
    , equal             = require("assert").equal
    , createServer      = require("net").createServer
    , createChannel     = require("../../lib").createChannel
    , spawn             = require("../../lib").spawn
    , timeout           = require("../common").timeout
    , shutdown          = require("../common").shutdown

const POOL_SIZE         = 4,
      REQUESTS_TO_SEND  = 100
      
const TCP_PORT          = require("../common").TCP_PORT
    , TCP_HOST          = require("../common").TCP_HOST;

var master      = null
  , connections = POOL_SIZE

timeout(5000);

master = createChannel("req");
master.listen("proc://worker-pool");

for (var i = 0; i < POOL_SIZE; i++) {
  spawn("./worker");
}

server = createServer(function(sock) {
  var req;
  
  req = master.send("hook", sock);
  
  req.receive = function ok(msg) {
    sock.destroy();
  };
  
});
server.listen(TCP_PORT, TCP_HOST);

for (var i = 0; i < POOL_SIZE; i++) {
  spawn("./client").on("exit", function() {
    if (!(--connections)) {
      shutdown();     
    }
  });
}