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

var SERVICE = "boot_loader";


//
//  ### bootloader.start(options)
//
//  Spawns a new `bootloader` nodule and returns the `Ref`. 
//
exports.start = function(opts) {

  if (whereis(SERVICE)) {
    throw new Error(SERVICE + " already running");
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

  register(SERVICE, self());

  require("./log_serv").start(opts.verbose);
  log = require("./log_serv").getLog(SERVICE);

  log("kernel version %s", kernel.version);
  log("init");

  if (opts.name) {
    log("start networking...");

    require("./net_serv").start( opts.name
                               , opts.port
                               , opts.hidden);
  } else {
    log("networking disabled, set `--name` to start automatically...");
  }

  if (opts.startup && opts.startup[1]) {
    log("spawn `%s:%s(%s)`", basename(opts.startup[0])
                                     , opts.startup[1]
                                     , opts.startup[2].length);

    spawn.apply(null, opts.startup);
  } else if (opts.startup) {
    log("loading main module `%s`", basename(opts.startup[0]));

    require(opts.startup[0]);
  }

  log("shutdown");

  unregister(SERVICE);
}