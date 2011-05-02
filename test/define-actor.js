// require("v8-profiler");

// var fd      = require("../index").fd
//   , bind    = require("../index").bind
//
//
// var myworker = spawn("./tmp/test2");

// bind("me");

var sendAfter   = require("../lib").sendAfter;

ref = spawn("./tmp/test2");

register("test2", ref);

// register("myserver", ref);
//
// send("myserver", ["ok", 123]);
//
// unregister("myserver");

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
      console.log("exit");
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




//
// var job2 = spawn(function() {
//   var runme = true;
//   while (runme) {
//     receive(
//       function ping(a, b, c) {
//         switch (a) {
//           case "ping":
//             send(b, ["pong", c + 1]);
//             break;
//           case "exit":
//             runme = false;
//             break;
//         }
//       }
//     );
//   }
// });
//
// var job1 = spawn(function() {
//   var me = self();
//   var runme = true;
//   send(job2, ["ping", me, 1]);
//   while (runme) {
//     receive(
//       function ping(a, b, c) {
//         switch (a) {
//           case "pong":
//             if (b == 3) {
//               console.time("sendtest");
//             } else if (b == 100000) {
//               console.timeEnd("sendtest");
//               send(job2, ["exit"]);
//               runme = false;
//               return;
//             }
//             send(job2, ["ping", me, b]);
//             break;
//         }
//       }
//     );
//   }
// });
//
//



console.time("spawn")
var refs = [];
for (var i = 0; i < 1000; i++) {
  refs.push(spawn(function() {
    // send(null, ["ping", self()]);
    receive (
      function pong(r) {
        // console.log("Received '%s' from %s", r, myworker);
      }
    );
  }));
}
console.timeEnd("spawn");

setTimeout(function() {
  console.time("send");
  refs.forEach(function(ref) {
    send(ref, ["pong"]);
  });
  console.timeEnd("send");
},4000);
// var c = 0;
// console.log("Here!");
// function dostuff() {
//   // console.time("workerstartup");
//   for (var i = 0; i < 4; i++) {
//     spawnWorker();
//   }
//   if (c++ < 1000) {
//     setTimeout(dostuff, 10);
//   } else {
//     console.log("-------------------------->                No more timeouts!");
//   }
//   // console.timeEnd("workerstartup")
// }
//
// setTimeout(dostuff, 10);
