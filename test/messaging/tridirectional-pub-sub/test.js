const Buffer            = require("buffer").Buffer
    , equal             = require("assert").equal
    , createChannel     = require("../../../lib").createChannel
    , spawn             = require("../../../lib").spawn
    , timeout           = require("../../global").timeout
    , shutdown          = require("../../global").shutdown

const CLUSTER_POOL_SIZE = 3
    , PUBSUB_POOL_SIZE  = 8
      
var clusterMaster = null 
    cluster = null
    delegater = null
    pubsubMaster = null
    pubsubs = null
    
timeout(5000);

clusterMaster = createChannel("master");
clusterMaster.encoding = "json";
clusterMaster.bind("proc://cluster-master");

cluster = spawn("./cluster-worker.js", CLUSTER_POOL_SIZE, [CLUSTER_POOL_SIZE]);
cluster.on("spawn", function() { 
  clusterMaster.initial = ["update", cluster.pids];
  clusterMaster.bcast("update", cluster.pids);
});
cluster.on("exit", function(worker, code, signal, error) { 
  if (code) {
    throw new Error(error);
  }
});
cluster.on("empty", shutdown);

delegater = createChannel("resp");
delegater.encoding = "json";
delegater.bind("proc://delegater");
delegater.delegateTo(clusterMaster);

pubsubMaster = createChannel("master");
pubsubMaster.encoding = "json";
pubsubMaster.bind("proc://pubsub-master");

pubsubs = spawn("./pubsub-worker.js", PUBSUB_POOL_SIZE, [PUBSUB_POOL_SIZE]);
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