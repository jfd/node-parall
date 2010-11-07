const join            = require("path").join
    , stat            = require("fs").stat
    , writeFile       = require("fs").writeFile

const TMP_PATH      = require("../../common").TMP_PATH
console.log("worker: " + process.argv[2]);
switch (process.argv[2]) {

  case "after-timeout":
    setTimeout(function() {
      throw new Error("WorkerError");
    }, 100);
    break;
    
  case "at-startup":
    throw new Error("WorkerError");
    break;
}