const NO_OF_MESSAGES = 10000;
const MESSAGE_SIZE   = 1024 * 50;


if (process.argv[2] == "subscriber") {
  var time;
  var count = 0;
  var ch = require("net").createConnection("/tmp/b");
  ch.on("data", function(data) {
    if (count == 0) {
      time = Date.now();
    }
    count += data.length;
    if (count == NO_OF_MESSAGES * MESSAGE_SIZE) {
      var elapsed = Date.now() - time;
      var mbsent = ((MESSAGE_SIZE * NO_OF_MESSAGES) / 1024) / 1024;
      var mbsec = mbsent / (elapsed / 1000);
      console.log("Test done, sent %s messages in %s secs (%s mb). %s mb/s", 
                  NO_OF_MESSAGES, elapsed / 1000, mbsent, 
                  Math.round(mbsec * 100) / 100);
      this.close();
    }
  });
} else {
  var buffer = new Buffer(MESSAGE_SIZE);
  var ch = require("net").createServer(function(sock) {
    
    setTimeout(function() {
      for (var i = 0; i < NO_OF_MESSAGES; i++) {
        sock.write(buffer);
      }
    }, 100);
    
    sock.on("close", function() {


      process.exit();
    });
  });
  ch.listen("/tmp/b");
  var worker = require("../lib").spawn(__filename, ["subscriber"], "pipe");
}
