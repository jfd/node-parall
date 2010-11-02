const Stream            = require("net").Stream
    , createChannel     = require("../../../lib").createChannel
    , send              = require("../../../lib/").send
    , mmatch            = require("../../../lib/").mmatch
    , when              = require("../../../lib/").when

var worker = null
var lastfd;

worker = createChannel("worker");
worker.encoding = "json";
worker.connect("proc://worker-pool");
worker.on("message", mmatch(  
 
  when ("hook-fd", Number) (
    function(args) {
      var fd = this._fd;
      var stream = new Stream(fd);
      lastfd = fd;
      console.log("fdadd_ " + fd);
      stream.on("data", function(data) {
        this.write(data);
      });
      stream.resume();
      return args;
    },
    send('OK')
  )
  
));

process.on("uncaughtException", function(err) {
  console.log("uncaughtException " + lastfd);
})