const ok                = require("assert").ok
    , equal             = require("assert").equal
    , notEqual          = require("assert").notEqual
    , spawn             = require("../../index").spawn
    , timeout           = require("../common").timeout
    , shutdown          = require("../common").shutdown

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
  
  spawn("./worker", "noerror", ["after-timeout"]).on("exit", function(code) {
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

  spawn("./worker", ["at-startup"]).on("error", function(err) {
    notEqual(err, undefined);
    process.nextTick(testErrReference);
  });  
}

function testErrReference() {

  // Error should be caught by global handle
  uncaughtException = function (err) {
    process.nextTick(testErrAndRestart);
  }

  spawn("./worker", ["reference"]);
}

function testErrAndRestart() {
  var worker;
  var didrestart;

  uncaughtException = function(err) {
    shutdown(new Error("Worker pool leaked exception."))
  }
  
  worker = spawn("./worker", "keepalive", ["subworker-startup"]);
  worker.on("restart", function() {
    if (!didrestart) {
      didrestart = true;
    } else {
      worker.kill();
      process.nextTick(testSubErrAfterTimeout);
    }
  });
}

function testSubErrAfterTimeout() {
  
  // This test should not leak exceptions
  uncaughtException = function(err) {
    shutdown(new Error("Worker leaked exception."));
  }
  
  spawn("./worker", "noerror", ["subworker-timeout"]).on("exit", function(code) {
    process.nextTick(testSubErrOnStartup);
  }); 
}

function testSubErrOnStartup() {

  // Error should be caught by global handle
  uncaughtException = function (err) {
    process.nextTick(testSubErrOnStartup2);
  }

  spawn("./worker", ["subworker-startup"]);
}

function testSubErrOnStartup2() {
  var pool = null;

  // This test should not leak exceptions
  uncaughtException = function(err) {    
    shutdown(new Error("Worker pool leaked exception."));
  }

  spawn("./worker", ["subworker-startup"]).on("error", function(err) {
    notEqual(err, undefined);
    process.nextTick(testSubErrReference);
  });  
}

function testSubErrReference() {
  
  // Error should be caught by global handle
  uncaughtException = function (err) {
    process.nextTick(testSubErrAndRestart);
  }

  spawn("./worker", ["subworker-ref"]);
}

function testSubErrAndRestart() {
  var worker;
  var didrestart;

  uncaughtException = function(err) {
    shutdown(new Error("Worker pool leaked exception."))
  }
  
  worker = spawn("./worker", "keepalive", ["subworker-startup"]);
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