//
//        Copyright 2010 Johan Dahlberg. All rights reserved.
//
//  Redistribution and use in source and binary forms, with or without
//  modification, are permitted provided that the following conditions
//  are met:
//
//    1. Redistributions of source code must retain the above copyright notice,
//       this list of conditions and the following disclaimer.
//
//    2. Redistributions in binary form must reproduce the above copyright
//       notice, this list of conditions and the following disclaimer in the
//       documentation and/or other materials provided with the distribution.
//
//  THIS SOFTWARE IS PROVIDED ``AS IS'' AND ANY EXPRESS OR IMPLIED WARRANTIES,
//  INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY
//  AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL
//  THE AUTHORS OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT,
//  INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT
//  NOT LIMITED, TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
//  DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
//  THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
//  (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF
//  THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
//

var basename = require("path").basename;


//
//  ### bootloader.start(options)
//
//  Spawns a new `bootloader` nodule and returns the `Ref`. 
//
exports.start = function(opts) {

  if (whereis("bootloader")) {
    throw new Error("bootloader already running...");
  }

  return spawn(bootloader, [opts]);
};



//
//  The `bootloader` nodule. Starts requested services and
// startup module.
//
function bootloader(opts) {
  var kernel = require("./kernel");
  var module;
  var fn;
  var logger;

  log = opts.verbose ? createLogger() : function() {};

  log("bootloader: init");

  register("bootloader", self());

  if (opts.name) {
    log("bootloader: Starting networking...");
    log("bootloader: Searching for `master:%s` in %s", opts.port, opts.path);

  } else {
    log("bootloader: Networking disabled, set `--name` to start...");
  }

  if (opts.startup && opts.startup[1]) {
    log("bootloader: Starting module `%s:%s(%s)`", basename(opts.startup[0])
                                                 , opts.startup[1]
                                                 , opts.startup[2].length);

    spawn.apply(null, opts.startup);
  } else if (opts.startup) {
    log("bootloader: Loading main module `%s`", basename(opts.startup[0]));

    require(opts.startup[0]);
  }

  log("bootloader: Shutdown");

  unregister("bootloader");
}



//
//  A logger for verbose-mode
//
function createLogger() {
  return function() {
    console.log.apply(console, arguments);
  };
}