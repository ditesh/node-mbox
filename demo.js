var fs = require("fs");
var mboxrd = require("./main.js").mboxrd;
var filename = "mbox";

var count = 0;
var fd = fs.openSync(filename, "r+");
var box = new mboxrd(fd);

box.on("error", function(err) {

    console.log("Some error occured: " + util.inspect(err));
    console.log("Closing fd and quitting");
    fs.close(fd);
    process.exit(1);

});

box.on("init", function(status, err) {

    if (status) {

        count = box.count();
        console.log("Successfully read mboxrd file ("+count+" messages. Getting messaegs (if any).");

        if (count > 0) box.get(0);

    } else {

        console.log("Unable to read mboxrd file because " + util.inspect(err));
        console.log("Closing fd and quitting");
        fs.close(fd);
        process.exit(1);

    }

});

box.on("get", function(status, msgnumber, data) {

    if (status === true) {

        console.log("Successfully got msg " + msgnumber + " with data: " + data);

//        if (msgnumber + 1 < count) box.get(msgnumber+1);
//        else process.exit(0);
        box.delete(0);

    } else {

        console.log("Unable to get message "+msgnumber);
        console.log("Closing fd and quitting");
        fs.close(fd);
        process.exit(1);

    }
});

box.on("delete", function(status, msgnumber) {

    if (status === true) {

        console.log("Deleted message number " + msgnumber);
        console.log("Writing mboxrd to disk (this closes fd)");
        box.write(filename);

    } else {

        console.log("Unable to delete message number "+msgnumber);
        console.log("Closing fd and quitting");
        fs.close(fd);
        process.exit(1);

    }
});

