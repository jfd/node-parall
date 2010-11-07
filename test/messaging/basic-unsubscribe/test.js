const Buffer            = require("buffer").Buffer
    , equal             = require("assert").equal
    , createChannel     = require("../../../lib").createChannel
    , spawn             = require("../../../lib").spawn
    , timeout           = require("../../common").timeout
    , shutdown          = require("../../common").shutdown

const POOL_SIZE         = 2,
      BCASTS_TO_RECV    = 10,
      RANDOM_BYTES      = "LOreM DOreM IPSUM"

var pub   = null
  , worker = null
  , count = 0
  , pids = []
  , subs = 0
  , longestKey = 0
  , hasVariants = false  
  , connections = 0;

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

function startseige() {
  var count = BCASTS_TO_RECV;
  equal(subs, POOL_SIZE + 1, "Expected " + pids.length + " subscribe events");
  equal(pub._broadcastEndpointFilterOptions.longestKey, longestKey);
  equal(pub._hasPatternLengthVariants, hasVariants);

  (function loop() {
    pids.forEach(function(pid) {
      pub.send(new Buffer(pid.toString(), "ascii"));
    });
    setTimeout(loop, 50);
  })();

  timeout(10000);
}

function stopseige() {
  equal(subs, 0, "Expected " + pids.length + " unsubscribe events");
  equal(Object.keys(pub._subscriptions), 0, "Expected routing table to \
                                             be empty");
  equal(pub._hasPatternLengthVariants, -1);
  equal(pub._broadcastEndpointFilterOptions.longestKey, 0);

  shutdown();
}

pub = createChannel("pub");
pub.bind("proc://test-channel");

pub.on("subscribe", function(pattern) {
  subs++;
});

pub.on("unsubscribe", function(pattern) {
  subs--;
});

pub.on("endpointConnect", function() {
  if (++connections == POOL_SIZE * 2) {
    setTimeout(startseige, 100);
  }
});

pub.on("endpointDisconnect", function() {
  if (!(--connections)) {
    process.nextTick(stopseige);    
  }
});

for (var i = 0; i < POOL_SIZE; i++) {
  worker = spawn("./unsubscriber", BCASTS_TO_RECV);
  pids.push(getbytes(worker.pid));
}

for (var i = 0; i < POOL_SIZE; i++) {
  spawn("./nullunsubscriber", BCASTS_TO_RECV * POOL_SIZE);
}