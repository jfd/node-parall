


exports.start = function() {
  receive(
    function ping(a, sender) {
      console.log("received pong");
      // send(sender, ["pong"]);
    },

    function shutdown() {
      process.exit();
    }
  );
}



// 
// for (;;) {
// }