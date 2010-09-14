const Buffer            = require("buffer").Buffer
    , equal             = require("assert").equal
    , createChannel     = require("../../../lib").createChannel
    , spawn             = require("../../../lib").spawn

const CLUSTER_POOL_SIZE = 3
    , PUBSUB_POOL_SIZE  = 8
      
var clusterMaster = null 
    cluster = null
    delegater = null
    pubsubMaster = null
    pubsubs = null
    timer = null

clusterMaster = createChannel("master");
clusterMaster.encoding = "json";
clusterMaster.bind("proc://cluster-master");

cluster = spawn("./cluster-worker.js", CLUSTER_POOL_SIZE, [CLUSTER_POOL_SIZE]);
cluster.on("update", function() { 
  clusterMaster.initial = ["update", cluster.pids];
  clusterMaster.bcast("update", cluster.pids);
});
cluster.on("workerStop", function(worker, code, signal, error) { 
  if (code) {
    throw new Error(error);
  }
});
cluster.on("stop", function() {
  clearTimeout(timer);
  process.exit();
});

delegater = createChannel("resp");
delegater.encoding = "json";
delegater.bind("proc://delegater");
delegater.delegateTo(clusterMaster);

pubsubMaster = createChannel("master");
pubsubMaster.encoding = "json";
pubsubMaster.bind("proc://pubsub-master");

pubsubs = spawn("./pubsub-worker.js", PUBSUB_POOL_SIZE, [PUBSUB_POOL_SIZE]);
pubsubs.on("start", function() {
  pubsubMaster.initial = ["update", pubsubs.pids];
  pubsubMaster.bcast("update", pubsubs.pids);  
});
pubsubs.on("workerStop", function(worker, code, signal, error) { 
  if (code) throw new Error(error);
});
pubsubs.on("stop", function() {
  clusterMaster.bcast("shutdown");
});


timer = setTimeout(function() {
  throw new Error("Timeout reached");
}, 5000);  
