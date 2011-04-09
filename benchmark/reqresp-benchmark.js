const NO_OF_MESSAGES = 10000;
const MESSAGE_SIZE   = 1024 * 50;


if (process.argv[2] == "subscriber") {
  var count = 0;
  var ch = require("../index").createChannel("resp");
  ch.listen("tcp://127.0.0.1:7000");
  ch.recv = function(msg, data) {
    msg.ok();
  };
} else {
  var time;
  var buffer = new Buffer(MESSAGE_SIZE);
  var worker = require("../index").spawn(__filename, ["subscriber"], "pipe");
  var ch = require("../index").createChannel("req");
  ch.connect("tcp://127.0.0.1:7000");
  ch.on("connect", function() {
    time = Date.now();
    var count = 0;
    for (var i = 0; i < NO_OF_MESSAGES; i++) {
      var req = this.send(buffer);
      req.recv = function ok() {
        count++;
        
        if (count == NO_OF_MESSAGES) {
          var elapsed = Date.now() - time;
          var mbsent = ((MESSAGE_SIZE * NO_OF_MESSAGES) / 1024) / 1024;
          var mbsec = mbsent / (elapsed / 1000);
          console.log("Test done, sent/recevied %s messages in %s secs (%s mb). %s mb/s", 
                      NO_OF_MESSAGES, elapsed / 1000, mbsent, 
                      Math.round(mbsec * 100) / 100);
                      
          ch.close();
          process.exit();
        }
      };
    }
  });
}
