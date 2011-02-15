const receive     = require("../../../lib").receive

var worker = null
  , rejectMode = false;


receive (
  
  "set-reject", Number, function(value) {
    rejectMode = value;
    this.send("ok", process.pid);
  },
  
  "ping", function() {
    if (rejectMode) {
      this.reject();
    } else {
      this.send("pong", process.pid);
    }
  }
  
);