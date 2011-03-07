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
  , connections = 0
  , count = 0
  , pids = []
  , subs = 0
  , longestKey = 0
  , hasVariants = false
  , worker
  , seigerunning;

timeout(1000);
  
function getbytes(pid) {
  var buffer = new Buffer(pid + RANDOM_BYTES, "ascii");
  buffer.pidLength = pid.toString().length;
  if (buffer.pidLength != longestKey) {
    hasVariants = longestKey == 0 ? false : true;
    longestKey = buffer.pidLength;
  }
  return buffer;
}

function startseige() {
  if (!seigerunning && pub.sockets.length == POOL_SIZE * 2 && 
      subs == POOL_SIZE * 2) {
    seigerunning = true;
    process.nextTick(function() {
      var count = BCASTS_TO_RECV;
      while (count--) {
        pids.forEach(function(pid) {
          pub.send(pid);
        });
      }
    });
  }
}

function stopseige() {
  equal(subs, 0, "Expected " + pids.length + " unsubscribe events");
  equal(Object.keys(pub._rawsubscriptions), 0, "Expected routing table to \
                                             be empty");
  shutdown();
}

pub = createChannel("pub");
pub.listen("proc://test-channel");

pub.on("connect", function(sock) {
  sock.on("subscribe", function() {
    subs++;
    startseige();
  });
  sock.on("unsubscribe", function() {
    subs--;
    if (subs == 0) {
      process.nextTick(stopseige);
    }
  });
});

pub.on("disconnect", function(sock) {
  if (this.sockets.length == 0) {
    process.nextTick(stopseige);    
  }
});

for (var i = 0; i < POOL_SIZE; i++) {
  worker = spawn("./subscriber", [BCASTS_TO_RECV]);
  pids.push(getbytes(worker.pid));
}

for (var i = 0; i < POOL_SIZE; i++) {
  spawn("./nullsubscriber", [BCASTS_TO_RECV * POOL_SIZE]);
}