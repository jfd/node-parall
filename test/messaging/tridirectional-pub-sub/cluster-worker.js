const Buffer            = require("buffer").Buffer
    , equal             = require("assert").equal
    , createChannel     = require("../../../lib").createChannel
    , replyTo           = require("../../../lib/messaging").replyTo
    , ok                = require("../../../lib/messaging").ok

const PUB_URL           = "proc://cluster-pub-" + process.pid;

var noOfWorkers = parseInt(process.argv[2])
  , subscriber  = null
  , publisher   = null
  , resp        = null
  , worker      = null

subscriber = createChannel("sub");
subscriber.exclude("cluster");
subscriber.autoReconnect = false;

publisher = createChannel("pub");
publisher.bind(PUB_URL);
publisher.pipe(subscriber);

resp = createChannel("resp");
resp.encoding = "json";
resp.on("message", function(msg) {
  switch (msg.data[0]) {
    case "request":
      subscriber.connect(msg.data[1], {
        originType: msg.data[1]
      });
      replyTo(msg, "ok", process.pid, PUB_URL);
      break;
  }
});

worker = createChannel("worker");
worker.encoding = "json";
worker.on("message", function(msg) {

  switch (msg.data[0]) {
    case "delegate-pub":
      publisher.attach(msg.fd);
      ok(msg);
      break;

    case "delegate-resp":
      resp.attach(msg.fd);
      ok(msg);
      break;
    
    case "shutdown":
      equal(Object.keys(publisher._subscriptions).length, 0);
      equal(publisher._remoteEndpoints.length, noOfWorkers - 1);
      equal(subscriber._remoteEndpoints.length, noOfWorkers - 1);
      process.nextTick(function() {
        process.exit();
      });
      break;
      
    case "update":
      pids = msg.data[1];
      pids.forEach(function(pid) {
        var url = "proc://cluster-pub-" + pid;
        if (url !== PUB_URL) {
          subscriber.connect(url, {
            originType: "cluster"
          });
        }
      });   
      break;
  }
});

setTimeout(function() {
  worker.connect("proc://cluster-master");
}, 10);