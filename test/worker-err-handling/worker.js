const join            = require("path").join
    , stat            = require("fs").stat
    , writeFile       = require("fs").writeFile
    , spawn           = require("../../lib").spawn

switch (process.argv[2]) {

  case "after-timeout":
    setTimeout(function() {
      throw new Error("WorkerError");
    }, 100);
    break;

  case "reference":
    setTimeout(function() {
      a
    }, 100);
    break;
    
  case "at-startup":
    throw new Error("WorkerError");
    break;
    
  case "subworker-ref":
    spawn("./worker", "reference");
    break;

  case "subworker-startup":
    spawn("./worker", "at-startup");
    break;

  case "subworker-timeout":
    spawn("./worker", "after-timeout");
    break;
    
}