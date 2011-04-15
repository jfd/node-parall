

var bind    = require("../../index").bind;

bind("test");

for (;;) {
  receive(
    function ping(a, sender) {
      send(sender, ["pong"]);
    },

    function shutdown() {
      process.exit();
    }
  );
}