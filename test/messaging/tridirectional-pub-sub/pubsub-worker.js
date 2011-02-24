const Buffer            = require("buffer").Buffer
    , equal             = require("assert").equal
    , createChannel     = require("../../../lib").createChannel
    , replyTo           = require("../../../lib/messaging").replyTo
    , ok                = require("../../../lib/messaging").ok

const PID               = process.pid
    , NO_OF_MESSAGES    = 30
    , NO_OF_PUBSUBS     = parseInt(process.argv[2])
    , MESSAGES_TO_RECV  = (NO_OF_PUBSUBS - 1) * NO_OF_MESSAGES
    , PUB_URL           = "proc://pubsub-" + PID
    , POST_INTERVAL     = 10
    

var subscriber  = null
  , publisher   = null
  , resp        = null
  , worker      = null
  , patterns    = []
  , recvcache   = []
  , sendcount   = 0
  , senddone    = false
  , recvdone    = false


subscriber = createChannel("sub");
subscriber.exclude(PUB_URL);
subscriber.on("message", function(msg) {
  var graph = msg.data.toString("ascii");
  var mypid = PID.toString();

  if (graph.substr(0, mypid.length) == mypid) {
    throw new Error("Recieved own message");
  }
  
  if (recvcache.indexOf(graph) !== -1) {
    throw new Error("Received duplicate message");
  }
  
  recvcache.push(graph);

  if (recvcache.length == MESSAGES_TO_RECV) {
    recvdone = true;
    if (senddone) process.exit();
  }
});

publisher = createChannel("pub");
publisher.bind(PUB_URL);
publisher.on("endpointConnect", function() {
  var sendcount = NO_OF_MESSAGES; 
  function postloop() {
    var msg = new Buffer(PID + "" + sendcount, "ascii");
    if (sendcount--) {
      publisher.bcast(msg);
      setTimeout(postloop, POST_INTERVAL);
    } else {
      senddone = true;
      if (recvdone) process.exit();
    }
  }
  setTimeout(postloop, 500);
})

req = createChannel("req");
req.encoding = "json";
req.send("request", PUB_URL, function(ok, pid, remotePubUrl) {
  subscriber.connect(remotePubUrl);
})

worker = createChannel("worker");
worker.encoding = "json";
worker.on("message", function(msg) {
  switch (msg.data[0]) {
    case "update":
      pids = msg.data[1];
      pids.forEach(function(pid) {
        if (pid !== PID && patterns.indexOf(pid) == -1) {
          subscriber.subscribe(pid);
        }
      });   
      break;
  }
});

worker.connect("proc://pubsub-master");
req.connect("proc://delegater");

setTimeout(function() {
}, 100);