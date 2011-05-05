var sendAfter   = require("../lib").sendAfter;

exports.start = function() {
  require("./tmp/test3");

  var ref = spawn("./tmp/test2", "start");

  register("test2", ref);

  console.log(node());

  link(ref);

  sendAfter(self(), ["pattern2"], 1000);
  sendAfter(self(), ["exitWorker"], 1001);

  for (;;) {
    receive(

      function pattern()      { this(15); },
      function pattern(a)     { this(a, 2); },
      function pattern(a, b)  { console.log("%s, %s", a, b); },

      function exitWorker() {
        exit("goodbye", "test2");
        // sendAfter(self(), ["shutdown"], 1000);
      },

      function shutdown() {
        exit("shutdown");
      },

      function (name) {
        console.log("no match for %s", name);
      }
    );
  }
};
