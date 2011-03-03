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
//  THE AUTHORS OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, 
//  SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED 
//  TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR 
//  PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF 
//  LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING 
//  NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE,
//  EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
//

const inherits              = require("util").inherits
    , normalize             = require("path").normalize
    , dirname               = require("path").dirname
    , join                  = require("path").join;

const parseDynamics         = require("./chaining").parseDynamics

const slice                 = Array.prototype.slice

const FORMAT_RE = /%[sdj]/g;

var stdmsg;


/**
 *  ## pass() _chainable_
 *
 *  Chainable "do-nothing" function.
 *
 *  Example:
 *
 *      match (
 *        when ('OK') (
 *          pass
 *        )
 *      )
 */
exports.pass = function(inargs) {
  return inargs;
}


/**
 *  ## fcall(fn, ...) _chainable_
 *
 *  Call specified `'fn´' with provided (optional) 'arguments'.
 */
exports.fcall = function() {
  var graph = slice.call(arguments);
  var fn = graph.shift();
  
  return function(inargs) {
    var args = parseDynamics(inargs, graph);
    fn.apply(this, args);
    return inargs;
  }
}


/**
 *  ## mcall(target, ...) _chainable_
 *
 *  Call specified `'member´' on provided ´'object'´.
 */
exports.mcall = function() {
  var graph = slice.call(arguments);
  var target = graph.shift();
  var member = graph.shift();
  
  return function(inargs) {
    var args = parseDynamics(inargs, graph);
    
    if (!target[member] || typeof target[member] !== "function") {
      throw new Error("mcall: Member is not a function '" + member + "'.");
    }
    
    target[member].apply(target, args);
    return inargs;
  }
}


/**
 *  ## format(string, ...) **chainable**
 *
 *  Format text
 */
exports.format = function() {
  var graph = slice.call(arguments);
  var str = graph.shift();
  
  return function(inargs) {
    var args = parseDynamics(inargs, graph);
    var i = 0;
    var result = String(str).replace(FORMAT_RE, function (x) {
      switch (x) {
        case '%s': return args[i++];
        case '%d': return +args[i++];
        case '%j': return JSON.stringify(args[i++]);
        default:
          return x;
       }
    });
    for (var len = args.length; i < len; ++i) {
       result += ' ' + args[i];
    }
    process.stdout.write(result + '\n');
    return inargs;
  }
} 
 

exports.createProcSockAlias = function(alias) {
  var mainpid = parseInt(process.env["PARALL_MAIN_PROCESS"]);
  var pid = isNaN(mainpid) && process.pid || mainpid;

  return ["/tmp/parall-", pid, "-", alias, ".sock"].join("");
}

exports.geturi = function(protocol) {
  var port = typeof arguments[1] == "number" && arguments[1] || arguments[2];
  var host = typeof arguments[1] == "string" && arguments[1] || "*";
  
  return protocol + "://" + host + ":" + port; 
}

exports.findEventListener = function(emitter, event, owner) {
  var all;
  var index;
  
  all = emitter.listeners(event);
  index = all.length;
  
  while (index--) {
    if (all[index].owner == owner) {
      return all[index];
    }
  }
  
};

exports.parseUrl = function(expr, allowUndefinedPort) {
  var protocol;
  var resource;
  var port;
  var m;
  
  if (expr == null) {
    return null;
  }
  
  m = /^(proc|sock|mem|tcp)\:\/\//(expr);
  
  if (m) {
    protocol = m[1];
  } else {
    return null;
  }
  
  m = /\:\/\/((.+)\:(\d+)|(.+))$/(expr);
  
  if (m) {
    if (m[4]) {
      resource = exports.resolveRelativePath(m[4]);
    } else {
      if (protocol !== "tcp") {
        return null;
      } else {
        resource = m[2];
        port = parseInt(m[3]) || undefined;
        
        if (port == null && !allowUndefinedPort) {
          return null;
        }
      }
    }
  } else {
    return null;
  }
  
  if (resource == "*") {
    if (protocol !== "tcp") {
      return null;
    } else {
      resource = null;
    }
  }
  
  return { protocol: protocol
         , resource: resource
         , port: port
         };
};

// Try to resolve a path expression.   
exports.resolveRelativePath = function(path, rootdir) {
  var ep = rootdir || process.env["PARALL_ENTRY_POINT"] || process.argv[1];
  var root = dirname(ep);

  switch (path[0]) {
    default:
    case "/": return path;
    case "~": return join(process.env["HOME"], path.substr(1));
    case ".": return join(root, path);
  }
};

exports.getProcessUrl = function(pid) {
  
  if (typeof pid !== "number" || pid < 1) {
    throw new Error("Expected valid `pid`.");
  }
  
  return "sock:///tmp/parall-process-" + pid;
};

exports.openStdMsg = function() {
  
  if (stdmsg) {
    return stdmsg;
  }

  stdmsg = new require("./channel").createChannel("resp");
  stdmsg.listen(exports.getProcessUrl(process.pid));
  
  return stdmsg;
};
