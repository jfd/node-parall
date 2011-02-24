const Buffer            = require("buffer").Buffer
    , equal             = require("assert").equal
    , createChannel     = require("../../../lib").createChannel
    , RespSocket        = require("../../../lib").RespSocket
    , receive           = require("../../../lib").receive

const PUB_URL           = "proc://cluster-pub-" + process.pid;

var noOfWorkers = parseInt(process.argv[2])
  , subscriber  = null
  , publisher   = null
  , resp        = null
  , worker      = null

subscriber = createChannel("sub");
subscriber.exclude("cluster");

publisher = createChannel("pub");
publisher.bind(PUB_URL);
publisher.pipe(subscriber);


receive (
  
  "delegate-pub", Number, function(fd) {
    var 
    publisher.attach(msg.fd);
  },
  
  "delegate-resp", Number, function(fd) {
    var sock = new RespSocket({fd: fd});
    resp.attach(sock);
    this.ok();
  },
  
  "update", Array, function(pids) {
    pids.forEach(function(pid) {
      var url = "proc://cluster-pub-" + pid;
      if (url !== PUB_URL) {
        subscriber.connect(url, { id: "cluster" });
      }
    });
    this.ok();
  },
  
  "shutdown", function() {
    equal(Object.keys(publisher._rawsubscriptions).length, 0);
    equal(publisher.sockets.length, noOfWorkers - 1);
    equal(subscriber.sockets.length, noOfWorkers - 1);
    process.nextTick(function() {
      process.exit();
    });
    this.ok();
  }
  
);

resp = createChannel("resp");
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