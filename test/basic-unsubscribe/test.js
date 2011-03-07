const Buffer            = require("buffer").Buffer
    , equal             = require("assert").equal
    , createChannel     = require("../../lib").createChannel
    , spawn             = require("../../lib").spawn
    , timeout           = require("../common").timeout
    , shutdown          = require("../common").shutdown

const POOL_SIZE         = 2,
      BCASTS_TO_RECV    = 10,
      RANDOM_BYTES      = "LOreM DOreM IPSUM"

var pub   = null
  , worker = null
  , count = 0
  , pids = []
  , subs = 0
  , totalsubs = 0
  , longestKey = 0
  , hasVariants = false  
  , connections = 0
  , seigerunning = false;

timeout(10000);

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
  if (!seigerunning && pub.sockets.length == POOL_SIZE * 2 && 
      subs == POOL_SIZE * 2) {
    seigerunning = true;
    (function loop() {
      pids.forEach(function(pid) {
        pub.send(pid);
      });
      setTimeout(loop, 50);
    })();
  }
}

function stopseige() {
  // console.log(Object.keys(pub._rawsubscriptions).length)
  equal(Object.keys(pub._rawsubscriptions).length, 0);
  shutdown();
}

pub = createChannel("pub");
pub.listen("proc://test-channel");

pub.on("connect", function(sock) {
  sock.on("subscribe", function() {
    totalsubs++;
    subs++;
    startseige();
  });
  sock.on("unsubscribe", function() {
    subs--;
    if (totalsubs >= POOL_SIZE * 4 && subs == 0) {
      process.nextTick(stopseige);    
    }
  });
});

for (var i = 0; i < POOL_SIZE; i++) {
  worker = spawn("./unsubscriber", [BCASTS_TO_RECV]);
  pids.push(getbytes(worker.pid));
}

for (var i = 0; i < POOL_SIZE; i++) {
  spawn("./nullunsubscriber", [BCASTS_TO_RECV * POOL_SIZE]);
}