const ok                = require("assert").ok
    , equal             = require("assert").equal
    , createServer      = require("net").createServer
    , createChannel     = require("../../../lib").createChannel
    , spawn             = require("../../../lib").spawn
    , send              = require("../../../lib").send
    , Fd                = require("../../../lib").Fd
    , release           = require("../../../lib").release
    , match             = require("../../../lib").match
    , when              = require("../../../lib").when
    , format            = require("../../../lib").format
    , after             = require("../../../lib").after
    , timeout           = require("../../common").timeout
    , shutdown          = require("../../common").shutdown

const POOL_SIZE         = 4,
      REQUESTS_TO_SEND  = 100
      
const TCP_PORT          = require("../../common").TCP_PORT
    , TCP_HOST          = require("../../common").TCP_HOST;

var master      = null
  , connections = POOL_SIZE

timeout(5000);

master = createChannel("master");
master.encoding = "json";
master.bind("proc://worker-pool");

for (var i = 0; i < POOL_SIZE; i++) {
  spawn("./worker");
}

server = createServer(function(stream) {
  send(master, "hook-fd", Fd(stream), 
    match(
      when('OK') ( 
        release(stream)
      ),
      after (2000) (
        function(args) {
          throw new Error("Worker timeout");
          return args;
        }
      )
  ));
});
server.listen(TCP_PORT, TCP_HOST);

for (var i = 0; i < POOL_SIZE; i++) {
  spawn("./client").on("exit", function() {
    if (!(--connections)) {
      shutdown();     
    }
  });
}