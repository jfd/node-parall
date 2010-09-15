const ok                = require("assert").ok
    , equal             = require("assert").equal
    , notEqual          = require("assert").notEqual
    , spawn             = require("../../../lib").spawn
    , timeout           = require("../../global").timeout
    , shutdown          = require("../../global").shutdown

var master  = null
  , timer   = null


timeout(5000);

function testErrAfterTimeout() {
  var pool = null;
  
  // This test should not leak exceptions
  function uncaughtException(err) {
    process.removeListener("uncaughtException", uncaughtException);
    throw new Error("Worker pool leaked exception.");
  }
  
  process.on("uncaughtException", uncaughtException);
  
  pool = spawn("./err-after-timeout.js", 1);
  pool.on("empty", function(code, signal, error) {
    // console.log("%s, %s, %s", code, signal, error);
    process.nextTick(testErrOnStartup);
    process.removeListener("uncaughtException", uncaughtException);
  });  
}

function testErrOnStartup() {
  
  // Error should be caught by global handle
  function uncaughtException(err) {
    process.removeListener("uncaughtException", uncaughtException);
    process.nextTick(testErrOnStartup2);
  }

  process.on("uncaughtException", uncaughtException);
  
  spawn("./err-on-startup.js", 1);
}

function testErrOnStartup2() {
  var pool = null;

  // This test should not leak exceptions
  function uncaughtException(err) {
    process.removeListener("uncaughtException", uncaughtException);
    throw new Error("Worker pool leaked exception.");
  }

  process.on("uncaughtException", uncaughtException);

  pool = spawn("./err-on-startup.js", 1);
  pool.on("error", function(error) {
    process.removeListener("uncaughtException", uncaughtException);
    notEqual(error, undefined);
    process.nextTick(testErrOnStartup3);
  });
  
}

function testErrOnStartup3() {
  var pool = null;

  function uncaughtException(err) {
    process.removeListener("uncaughtException", uncaughtException);
    throw new Error("Worker pool leaked exception.");
  }
  
  // This test should not leak exceptions
  process.on("uncaughtException", uncaughtException);

  pool = spawn("./err-on-startup.js", 1, function(error) {
    process.removeListener("uncaughtException", uncaughtException);
    notEqual(error, undefined);
    process.nextTick(testErrAndRestart);
  });
}

function testErrAndRestart() {
  var pool = null
    , options = { restartOnError: true }
    , fullSignals = 0
    , spawnSignals = 0
    , errorSignals = 0
    , exitSignals = 0

  function uncaughtException(err) {
    process.removeListener("uncaughtException", uncaughtException);
    throw new Error("Worker pool leaked exception.");
  }
  
  // This test should not leak exceptions
  process.on("uncaughtException", uncaughtException);

  pool = spawn("./err-and-restart.js", 1, [process.pid], options);
  pool.on("full", function() {
    fullSignals++;
  })
  pool.on("spawn", function() {
    spawnSignals++;
  });
  pool.on("workerError", function() {
    errorSignals++;
  });
  pool.on("exit", function() {
    exitSignals++;
  });
  pool.on("empty", function() {
    process.removeListener("uncaughtException", uncaughtException);
    equal(fullSignals, 1, "full signal");
    equal(spawnSignals, 2, "spawn signal");
    equal(errorSignals, 1, "error signal");
    equal(exitSignals, 2, "exit signal");
    shutdown();
  })
}

testErrAfterTimeout();