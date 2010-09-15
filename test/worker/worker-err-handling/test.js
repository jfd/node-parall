const ok                = require("assert").ok
    , notEqual          = require("assert").notEqual
    , spawn             = require("../../../lib").spawn

var master  = null
  , timer = null


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
console.log("er")
  pool = spawn("./err-on-startup.js", 1, function(error) {
    process.removeListener("uncaughtException", uncaughtException);
    notEqual(error, undefined);    
  });
}

function testErrAndRestart() {
  
}

function shutdown() {
  clearTimeout(timer);
  process.exit();
}

timer = setTimeout(function() {
  throw new Error("Timeout reached");
}, 5000);

testErrAfterTimeout();