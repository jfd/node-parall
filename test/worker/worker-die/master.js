const ok                = require("assert").ok
    , equal             = require("assert").equal
    , spawn             = require("../../../lib").spawn

var master  = null
  , pool  = null
  , timer = null

pool = spawn("./worker.js", 1);
pool.on("stop", function() {
  clearTimeout(timer);
  process.exit();
});

timer = setTimeout(function() {
  throw new Error("Timeout reached");
}, 5000);