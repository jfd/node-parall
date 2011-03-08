const NO_OF_MESSAGES = 10000;
const MESSAGE_SIZE   = 1024 * 50;

process.on("uncaughtException", function(err) {
  console.log(err.stack);
});
if (process.argv[2] == "subscriber") {
  var count = 0;
  var ch = require("../lib").createChannel("sub");
  ch.subscribe(new Buffer(0));
  ch.connect("tcp://127.0.0.1:7000");
  ch.receive = function(msg, data) {
    if (++count == NO_OF_MESSAGES) {
      ch.close();
    }
  };
} else {
  var time;
  var buffer = new Buffer(MESSAGE_SIZE);
  var worker = require("../lib").spawn(__filename, ["subscriber"], "pipe");
  var ch = require("../lib").createChannel("pub");
  ch.listen("tcp://127.0.0.1:7000");
  ch.on("subscribe", function() {
    var c = 0;
    time = Date.now();
    function send() {
      ch.send(buffer);
      if (++c < NO_OF_MESSAGES) {
        process.nextTick(send);
      }
    }
    send();
    // for (var i = 0; i < NO_OF_MESSAGES; i++) {
    //   this.send(buffer);
    // }
  });
  ch.on("disconnect", function() {
    var elapsed = Date.now() - time;
    var mbsent = ((MESSAGE_SIZE * NO_OF_MESSAGES) / 1024) / 1024;
    var mbsec = mbsent / (elapsed / 1000);
    console.log("Test done, sent %s messages in %s secs (%s mb). %s mb/s", 
                NO_OF_MESSAGES, elapsed / 1000, mbsent, 
                Math.round(mbsec * 100) / 100);
                  
                
    process.exit();
  });
}
