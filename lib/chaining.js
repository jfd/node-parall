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
 
/**
 *  ## Chaining
 *
 *  Chaining is a concept that let you execute commands in an asynchronous 
 *  serie. 
 */ 
 

/**
 *  ### chaining.createChain(retCallback)
 *
 *  Creates a new Chain instance.
 */
exports.createChain = function(retCallback) {
  var self = new Chain();
  
  return function() {
    var args = Array.prototype.slice.call(arguments);
    var index = 0;
    var length = args.length;

    for(;index < length; index++) {
      if (typeof args[index] !== "function") {
        throw new Error("Excepted function");
      }
      self.functions.push(args[index]);
    }
    
    return (retCallback && 
            typeof retCallback == "function" &&
            retCallback.call(self)) || self
  }
}

function Chain(context) {
  if (context) {
    for (var key in context) {
      this[key] = context[key];
    }
  }
  
  this.functions = [];
}

exports.Chain = Chain;

/**
 *  ### Chain.runInNewContext(context, [args])
 *
 *  Run chain in specified `'context'`.
 */
Chain.prototype.runInNewContext = function(context, args) {
  var functions = this.functions;
  var length = functions.length;
  var index = 0;
  var chainfnargs;

  function execCallback(fnargs) {
    var result;
    
    if (index == length) {
      return;
    }
    
    chainfnargs[0] = fnargs;

    try {
      result = functions[index++].apply(context, chainfnargs);
    } catch (err) {
      console.log(err.stack);
      return;
    }

    if (result !== undefined) {
      execCallback(result);
    } 
  }
  
  chainfnargs = [null, execCallback];
  
  execCallback(args || []);
}

/**
 *  ### chaining.createDynamic(fn)
 *  
 *  Creates a new dynamic argument. 
 */
exports.createDynamic = function(fn) {
  fn._dynamicarg = true;
  return fn;
}

/**
 *  ### chaining.isDynamic(fn)
 *
 *  Returns `true` if `'dn'` is a dynamic argument, else `false`.
 */
exports.isDynamic = function(fn) {
  return fn && typeof fn == "function" && fn._dynamicarg;
}

/**
 *  ### chaining.parseDynamics(ctx, list)
 *
 *  Returns a new `Array` where all `dynamic` arguments is parsed and 
 *  validated against the provided `'ctx'`.
 */
exports.parseDynamics = function(ctx, list) {
  var result = (list || []).slice(0);
  var item;
  for (var i = 0, l=result.length; i < l; i++) {
    item = result[i];
    if (typeof item == "function" && item._dynamicarg) {
      result[i] = item.call(ctx);
    } 
  }
  return result;
}