setTimeout(function() {
  throw new Error("WorkerError");
}, 100);