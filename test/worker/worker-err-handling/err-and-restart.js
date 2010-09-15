const join            = require("path").join
    , stat            = require("fs").stat
    , writeFile       = require("fs").writeFile

const TMP_PATH      = require("../../global").TMP_PATH

var parentpid = process.argv[2];
var tmpfile = join(TMP_PATH, "parall-test-" + parentpid + ".tmp");

stat(tmpfile, function(err, stats) {
  if (err) {
    writeFile(tmpfile, "test");
    setTimeout(function() {
      throw new Error("Restart");
    }, 100);
  } else {
    setTimeout(function() {
      process.exit();
    }, 100)
  }
});