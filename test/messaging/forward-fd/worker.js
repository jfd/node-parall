const Stream            = require("net").Stream
    , createChannel     = require("../../../lib").createChannel
    , send              = require("../../../lib/").send
    , mmatch            = require("../../../lib/").mmatch
    , when              = require("../../../lib/").when
    , Fd                = require("../../../lib/").Fd

var worker = null

worker = createChannel("worker");
worker.encoding = "json";
worker.connect("proc://worker-pool");
worker.on("message", mmatch(  
 
  when ("hook-fd", Fd) (
    function(args) {
      var fd = args[0];
      var stream = new Stream(fd);
      stream.on("data", function(data) {
        this.write(data);
      });
      stream.resume();
      return args;
    },
    send('OK')
  )
  
));