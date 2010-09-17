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
 *  THIS SOFTWARE IS PROVIDED BY HYDNA AB ``AS IS'' AND ANY EXPRESS 
 *  OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED 
 *  WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE 
 *  ARE DISCLAIMED. IN NO EVENT SHALL HYDNA AB OR CONTRIBUTORS BE LIABLE FOR 
 *  ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL 
 *  DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR 
 *  SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) 
 *  HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT 
 *  LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY 
 *  OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF 
 *  SUCH DAMAGE.
 *
 */


exports.compile = function() {
  
}

exports.build = function() {
  var patterns = Array.prototype.slice.call(arguments);
  var pattern = null;
  var patternresult = null;
  var src = ["function("];
  var defs = [];
  var fnargs = [];
  var match = [];
  var maxargs = 0;
  
  for (var pi = 1, pl = patterns.length; pi <= pl; pi++) {
    pattern = patterns[pi - 1];
    maxargs = Math.max(pattern.length, maxargs);
    patternresult = buildPattern(pattern, pi);
    defs.push(patternresult.defs || []);
    match.push(patternresult.match);
  }

  for (var iarg=0; iarg < maxargs; iarg++) {
    fnargs.push("$" + iarg);
  }

  src.push(fnargs.join(","), "){return ", match.join("||"), "}");

  return src.join("");
}

function buildPattern(pattern, index) {
  var comp = null;
  var plength = pattern.length;
  var result = [];
  
  for (var i = 0, l = pattern.length; i < l; i++) {
    comp = pattern[i];

    if (typeof comp == "string") {
      result.push('$' + i + '===' + "'" + comp + "'");
    }
    
  }
  
  return {
    match: "((" + result.join("&&") + ")&&" + index + ")"
  } 
}

