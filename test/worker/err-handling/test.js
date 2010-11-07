const ok                = require("assert").ok
    , equal             = require("assert").equal
    , notEqual          = require("assert").notEqual
    , spawn             = require("../../../lib").spawn
    , timeout           = require("../../common").timeout
    , shutdown          = require("../../common").shutdown

var master  = null
  , timer   = null
  , uncaughtException


timeout(5000);

process.on("uncaughtException", function(exception) {
  uncaughtException && uncaughtException(exception);
});


function testErrAfterTimeout() {
  
  // This test should not leak exceptions
  uncaughtException = function(err) {
    shutdown(new Error("Worker leaked exception."));
  }
  
  spawn("./worker", "noerror", "after-timeout").on("exit", function(code) {
    process.nextTick(testErrOnStartup);
  }); 
}

process.nextTick(testErrAfterTimeout);

function testErrOnStartup() {
  
  // Error should be caught by global handle
  uncaughtException = function (err) {
    process.nextTick(testErrOnStartup2);
  }

  spawn("./worker", "at-startup");
}

function testErrOnStartup2() {
  var pool = null;

  // This test should not leak exceptions
  uncaughtException = function(err) {    
    shutdown(new Error("Worker pool leaked exception."));
  }

  spawn("./worker", "at-startup").on("error", function(err) {
    notEqual(err, undefined);
    process.nextTick(testErrAndRestart);
  });  
}

function testErrAndRestart() {
  var worker;
  var didrestart;

  uncaughtException = function(err) {
    shutdown(new Error("Worker pool leaked exception."))
  }
  
  worker = spawn("./worker", "keepalive", "at-startup");
  worker.on("restart", function() {
    if (!didrestart) {
      didrestart = true;
    } else {
      worker.kill('SIGHUP');
    }
  });
  worker.on("exit", function() {
    shutdown();
  });
}