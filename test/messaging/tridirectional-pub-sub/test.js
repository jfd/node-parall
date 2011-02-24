const Buffer            = require("buffer").Buffer
    , equal             = require("assert").equal
    , createChannel     = require("../../../lib").createChannel
    , spawn             = require("../../../lib").spawn
    , timeout           = require("../../common").timeout
    , shutdown          = require("../../common").shutdown

const CLUSTER_POOL_SIZE = 3
    , PUBSUB_POOL_SIZE  = 8
      
var clusterMaster = null 
  , cluster = null
  , delegater = null
  , pubsubMaster = null
  , pubsubs = null
  , pids;
    
timeout(5000);

cluster = createChannel("req");
cluster.listen("proc://cluster");
cluster.on("disconnect", function() {
  if (this.sockets.length == 0) {
    shutdown();
  }
});

pids = [];

for (var i = 0; i < CLUSTER_POOL_SIZE; i++) {
  worker = spawn("./cluster-worker.js", [CLUSTER_POOL_SIZE]);
  pids.push(worker.pid);
  cluster.attach(worker);
}

cluster.sockets.forEach(function(sock) {
  sock.send("update", pids);
});


delegater = createChannel("resp");
delegater.listen("proc://delegater");
delegater.on("connect", function(sock) {
  master.send("delegate-resp", sock, function() {
    sock.destroy();
  });
});

pubsubMaster = createChannel("master");
pubsubMaster.encoding = "json";
pubsubMaster.bind("proc://pubsub-master");

for (var i = 0; i < PUBSUB_POOL_SIZE, i++) {
  worker = spawn("./pubsub-worker.js", [PUBSUB_POOL_SIZE]);
  pids.push(worker.pid);
  pubsubs.attach(worker);
}

pubsubs.sockets.forEach(function(sock) {
  sock.send("update", pids);
});

pubsubs = spawn("./pubsub-worker.js", PUBSUB_POOL_SIZE, [PUBSUB_POOL_SIZE]);
pubsubs
pubsubs.on("spawn", function() {
  pubsubMaster.initial = ["update", pubsubs.pids];
  pubsubMaster.bcast("update", pubsubs.pids);  
});
pubsubs.on("exit", function(worker, code, signal, error) { 
  if (code) throw new Error(error);
});
pubsubs.on("empty", function() {
  clusterMaster.bcast("shutdown");
});