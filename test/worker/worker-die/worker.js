

setTimeout(function() {
  throw new Error("Errror");
}, 1000);

throw new Error("das");