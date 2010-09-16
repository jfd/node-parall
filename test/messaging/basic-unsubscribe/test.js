const Buffer            = require("buffer").Buffer
    , equal             = require("assert").equal
    , createChannel     = require("../../../lib").createChannel
    , spawn             = require("../../../lib").spawn

const POOL_SIZE         = 2,
      BCASTS_TO_RECV    = 10,
      RANDOM_BYTES      = "LOreM DOreM IPSUM"

var pub   = null
  , pool  = null
  , nullpool = null
  , activepools = 0
  , timer = null
  , count = 0
  , pids = []
  , subs = 0
  , longestKey = 0
  , hasVariants = false  

function getbytes(pid) {
  var buffer = new Buffer(pid + RANDOM_BYTES, "ascii");
  buffer.pidLength = pid.toString().length;
  if (buffer.pidLength != longestKey) {
    hasVariants = longestKey == 0 ? false : true;
    longestKey = buffer.pidLength;
  }
  return buffer;
}

function getlongestbufferlength() {
  var longest = 0;
  pids.forEach(function(pid) {
    longest = pid.pidLength > longest ? pid.pidLength : longest;
  });
  return longest;
}

function onpoolfull() {
  if (++activepools == 2) {
    setTimeout(startseige, 100);
  }  
}

function onpoolempty() {
  if (--activepools == 0) {
    process.nextTick(stopseige);
  }  
}

function startseige() {
  var count = BCASTS_TO_RECV;
  equal(subs, POOL_SIZE + 1, "Expected " + pids.length + " subscribe events");
  equal(pub._broadcastEndpointFilterOptions.longestKey, longestKey);
  equal(pub._hasPatternLengthVariants, hasVariants);

  (function loop() {
    pids.forEach(function(pid) {
      pub.bcast(pid);
    });
    setTimeout(loop, 50);
  })();

  timer = setTimeout(function() {
    throw new Error("Timeout reached");
  }, 10000);  
}

function stopseige() {
  equal(subs, 0, "Expected " + pids.length + " unsubscribe events");
  equal(Object.keys(pub._subscriptions), 0, "Expected routing table to \
                                             be empty");
  equal(pub._hasPatternLengthVariants, -1);
  equal(pub._broadcastEndpointFilterOptions.longestKey, 0);
  
  clearTimeout(timer);
  process.exit();  
}

pub = createChannel("pub");
pub.bind("proc://test-channel");

pub.on("subscribe", function(pattern) {
  subs++;
});

pub.on("unsubscribe", function(pattern) {
  subs--;
});

pool = spawn("./unsubscriber.js", POOL_SIZE);
pool.on("spawn", function(worker) {
  pids.push(getbytes(worker.pid));
});
pool.on("exit", function(worker, error) {
  if (error) {
    throw new Error(error);
  }
});
pool.on("full", onpoolfull);
pool.on("empty", onpoolempty);

nullpool = spawn("./nullunsubscriber.js", POOL_SIZE);
nullpool.on("exit", function(worker, error) {
  if (error) {
    throw new Error(error);
  }
});
nullpool.on("full", onpoolfull);
nullpool.on("empty", onpoolempty);