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

const RANGE_START = 0xFF000000;
const RANGE_END = 0xFFFFFFFF;

var proxies = {};
var fds = {};


function IOWatcher() {
  this._notifying = false
};
exports.IOWatcher = IOWatcher;

IOWatcher.prototype.start = function() {
  var self = this;
  
  if (this.fd && this.prop) {
    fds[this.fd][this.prop] = this;
  }
  
  if (this.incomming && this.incomming.length) {
    self.notify();
  }
};

IOWatcher.prototype.stop = function() {
  
  if (fds[this.fd] && fds[this.fd][this.prop] == this) {
    fds[this.fd][this.prop] = null;
  }
  
  this.fd = null;
  this.prop = null;
};

IOWatcher.prototype.set = function(fd, readable, writable) {
  this.fd = fd;

  if (readable) {
    this.prop = "readwatcher";
  }
  if (writable) {
    this.prop = "writewatcher";
  }
};

IOWatcher.prototype.notify = function() {
  var self = this;
  
  if (this._notifying) {
    return;
  }
  
  this._notifying = true;
  
  process.nextTick(function() {
    self._notifying = false;
    self.callback && self.callback();
    self.rcallback && self.rcallback();
    if (self.incomming && self.incomming.length) {
      self.notify();
    }
  });
  
};

exports.write = function(fd, buf, off, len) {
  var host
  var conn;
  
  if (!(host = fds[fd])) {
    throw new Error("Invalid fd");
  }
  
  if (!(conn = fds[host.remotefd])) {
    return 0;
  }

  if (conn.incomming) {
    conn.incomming.push(buf.slice(off, len));
  } else {
    conn.incomming = [buf.slice(off, len)];
  }

  if (conn["readwatcher"]) {
    conn["readwatcher"].notify();
    return len;
  } else {
    conn.rcallback = function() {
      this.rcallback = null;
      host.notify();
    }
    return 0;
  }

};

exports.read = function(fd, buf, off, len) {
  var count = 0;
  var host;
  var data;
  var pos;
  var end;
  
  if (!(host = fds[fd])) {
    throw new Error("Invalid fd");
  }
  
  if (!host.incomming || !host.incomming.length) {
    throw new Error("Invalid callback");
  }
  
  while (len > 0 && (data = host.incomming.shift())) {
    end = Math.min(len, data.length);
    data.copy(buf, off, 0, end);
    
    count += end;
    len -= end;
    off += end;
    
    if (data.length > end) {
      host.incomming.unshift(data.slice(end));
    }
    
  }
  
  if (host.incomming.length) {
    host["readwatcher"] && host["readwatcher"].notify();
  }

  return count;
};

exports.socket = function() {
  var keys = Object.keys(fds);
  
  for (var i = RANGE_START; i < RANGE_END; i++) {
    if (fds[i] == null) {
      fds[i] = { fd: i
               , remotefd: null
               , readwatcher: null
               , writewatcher: null
               , name: null
               };
      return i;
    }
  }
  
  throw new Error("No free Memsock slots");
};

exports.connect = function(fd, name) {
  var conn;
  var host;
  var proxy;
  
  if (!(conn = fds[fd])) {
    throw new Error("Invalid fd");
  }

  if (!(proxy = proxies[name])) {
    throw new Error("Proxy not found");
  }
    
  if (!(host = fds[proxy.fd])) {
    throw new Error("Proxy host error");
  }

  if (host.incomming) {
    host.incomming.push(conn);
  } else {
    host.incomming = [conn];
  }
  
  process.nextTick(function() {
    host.readwatcher && host.readwatcher.notify();    
  });

};

exports.close = function(fd) {
  var host;
  var conn;
  var proxy;
  
  if (!(host = fds[fd])) {
    throw new Error("Invalid fd");
  }

  if (proxies[host.name].fd == fd) {
    proxies[host.name] = null;
  }
  
  if ((conn = fds[host.remotefd])) {
    if (conn.incomming) {
      conn.incomming.push(new Buffer(0));
    } else {
      conn.incomming = [new Buffer(0)];
    }
    conn.readwatcher && conn.readwatcher.notify();
  }
  
  conn.name = null;
  conn.remotefd = null;
};

exports.accept = function(fd) {
  var host;
  var conn;
  var proxy;
  var newfd;
  
  if (!(host = fds[fd])) {
    throw new Error("Invalid fd");
  }

  if (host.incomming && (conn = host.incomming.pop())) {
    newfd = exports.socket();
    conn.name = host.name;
    conn.remotefd = newfd
    fds[newfd].remotefd = conn.fd;
    fds[newfd].name = host.name;

    process.nextTick(function() {
      conn["writewatcher"] && conn["writewatcher"].notify();
    });
    return fds[newfd];
  }
};

exports.bind = function(fd, name) {
  var host;
  
  if (!(host = fds[fd])) {
    throw new Error("Ivanlid fd");
  }
  
  if (host.name) {
    throw new Error("Memsocket already bound");
  }
  
  if (proxies[name]) {
    throw new Error("Address already in use");
  }
  
  host.name = name;
  
  proxies[name] = { fd: fd };
};