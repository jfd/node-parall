/** 
 *        Copyright 2010 Johan Dahlberg. All rights reserved.
 *
 *  Redistribution and use in source and binary forms, with or without 
 *  modification, are permitted provided that the following conditions 
 *  are met:
 *
 *    1. Redistributions of source code must retain the above copyright notice, 
 *       this list of conditions and the following disclaimer.
 *
 *    2. Redistributions in binary form must reproduce the above copyright 
 *       notice, this list of conditions and the following disclaimer in the 
 *       documentation and/or other materials provided with the distribution.
 *
 *  THIS SOFTWARE IS PROVIDED ``AS IS'' AND ANY EXPRESS OR IMPLIED WARRANTIES, 
 *  INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY 
 *  AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL 
 *  THE AUTHORS OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, 
 *  SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED 
 *  TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR 
 *  PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF 
 *  LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING 
 *  NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, 
 *  EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 *
 */

function ChainBuilder(context) {
  if (context) {
    for (var key in context) {
      this[key] = context[key];
    }
  }
  
  this.chain = [];
}

exports.ChainBuilder = ChainBuilder;

ChainBuilder.prototype.bindAdd = function() {
  var self = this;
  return function() {
    var args = Array.prototype.slice.call(arguments);
    var index = 0;
    var length = args.length;

    for(;index < length; index++) {
      if (typeof args[index] !== "function") {
        throw new Error("Excepted function");
      }
      self.chain.push(args[index]);
    }
    return self;
  }
}

ChainBuilder.prototype.bindExecute = function() {
  return bindExecute(this.chain);
}

function bindExecute(chain) {
  return function() {
    var context = Array.prototype.slice.call(arguments);
    var chainlength = chain.length;
    var originalContext = this;
    var index = 0;
    var chainfnargs;
    var result;
    
    function execCallback(ctx) {
      var result;
      
      if (index == chainlength) {
        return;
      }

      result = chain[index].apply(ctx, chainfnargs);
      
      index++;

      return (typeof result != "undefined" && execCallback(result)) || false;
    }
    
    chainfnargs = [originalContext, execCallback];
    
    execCallback(context);
  }
}