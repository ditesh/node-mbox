/*

   node-mbox library
   Copyright (C) 2011 Ditesh Shashikant Gathani <ditesh@gathani.org>

   Permission is hereby granted, free of charge, to any person obtaining a copy of
   this software and associated documentation files (the "Software"), to deal in
   the Software without restriction, including without limitation the rights to
   use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies
   of the Software, and to permit persons to whom the Software is furnished to do
   so, subject to the following conditions:

   The above copyright notice and this permission notice shall be included in all
   copies or substantial portions of the Software.

   THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
   IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
   FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
   AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
   LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
   OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
   SOFTWARE.

*/

var fs = require("fs");
var util = require("util");
var events = require("events"); 
var unixlib = require("unixlib");

this.mbox = function(fd, options) {

    if (options === undefined) options = {};

    // Private members follow
    var self = this;
    options.init = false;
    options.bufsize = (options.bufsize === undefined) ? 4096: options.bufsize; // Read/write buffer size
    options.tmppath = (options.tmppath === undefined) ? "/tmp": options.tmppath; // Temp buffer size

    var debug = options.debug || false;

    // This structure is the original data structure
    var omessages = {
        size: 0,
        count: 0,
        sizes: [],
        deleted:  [],
        offsets:  [],
    };

    // This structure can be manipulated (thru message deletion)
    var messages = {
        size: 0,
        count: 0,
        sizes: [],
        deleted: [],
        offsets: [],
    };

    // Priviledged methods follow
    this.count = function() {
        return messages.count;
    };

    this.get = function(msgnumber) {

        var self = this;

        if (options.init === false) {

            self.emit("error", "Specified mboxrd has not been fully parsed yet or there was an error parsing it (trap 'init' event for more details)");
            return false;

        }

        if (msgnumber > omessages.count || messages.deleted[msgnumber] !== undefined) { 

            self.emit("get", false, msgnumber);
            return false;

        } else {

            var buffer = new Buffer(messages.sizes[msgnumber]);

            fs.read(fd, buffer, 0, messages.sizes[msgnumber], messages.offsets[msgnumber], function(err, bytesRead, buffer) {
                self.emit("get", true, msgnumber, buffer.toString());
            });

        }
    };

    this.reset = function() {

        var self = this;

        if (options.init === false) {

            self.emit("error", "Specified mboxrd has not been fully parsed yet or there was an error parsing it (trap 'init' event for more details)");
            return false;

        }

        messages = omessages;
        self.emit("reset", true);

    };

    this.delete = function(msgnumber) {

        var self = this;

        if (options.init === false) {

            self.emit("error", "Specified mboxrd has not been fully parsed yet or there was an error parsing it (trap 'init' event for more details)");
            return false;

        }

        if (msgnumber > omessages.count || messages.deleted[msgnumber] !== undefined) { 

            self.emit("delete", false, msgnumber);
            return false;

        }

        var messagesize = messages.sizes[msgnumber]
        delete messages.offsets[msgnumber];
        delete messages.sizes[msgnumber];

        messages.count -= 1;
        messages.size -= messagesize;

        // We take advantage of implicity JS hashing to avoid O(n) lookups
        messages.deleted[msgnumber] = 1;
        self.emit("delete", true, msgnumber);

    };

    // Note that this closes fd
    this.write = function(filename) {

        unixlib.mkstemp(options.tmppath + "/mboxXXXXXX", function(err, tmpfd, tmpfilename) {
            syncToTmp(tmpfd, 1, function() {
                fs.close(fd, function() { // This should automagically release any locks
                    fs.close(tmpfd, function() {
                        fs.rename(tmpfilename, filename, function() {
                            self.emit("write", true);
                        });
                    });
                });
            });
        });
    }; // Don't you love the chain of closing function calls? :)

    // Private methods follow
    // Write modifications to temp file
    function syncToTmp(tmpfd, msgnumber, cb) {

        // Pass the last msg
        if (msgnumber > messages.offsets.length) cb();

        // Skip deleted messages
        else if (messages.offsets[msgnumber] === undefined) syncToTmp(tmpfd, msgnumber + 1, cb);
        else {

            var buffer = new Buffer(omessages.sizes[msgnumber]);

            fs.read(fd, buffer, 0, omessages.sizes[msgnumber], messages.offsets[msgnumber], function(err, bytesRead, buffer) {

                fs.write(tmpfd, buffer, 0, bytesRead, null, function(err, written, buffer) {

                    syncToTmp(tmpfd, msgnumber + 1, cb);

                });
            });
        }
    }

    function read(position, previousbuf, cb) {

        var i = 0;
        var minlen = 0;
        var msgsize = 0;
        var buffer = new Buffer(options.bufsize);

        fs.read(fd, buffer, 0, options.bufsize, position, function(err, bytesRead, buffer) {

            var previousbuflen = 0;

            if (err) cb(err);
            else {

                // This combines previous buffer with the newly read buffer
                if (previousbuf !== null) {

                    if (position > 0) previousbuflen = previousbuf.length;

                    var newbuffer = new Buffer(previousbuf.length + buffer.length)

                    // Fast memcpy()'s for the win
                    previousbuf.copy(newbuffer);
                    buffer.copy(newbuffer, previousbuf.length);
                    buffer = newbuffer;
                    previousbuf = null;
                    delete newbuffer;

                }

                i = 0;
                minlen = (bytesRead === buffer.length) ? buffer.length : bytesRead;
                while (i < minlen) {

                    // Match for newline (\n), ASCII code 10
                    if (buffer[i] === 10) {

                        // We're at the end of the buffer
                        if (i === buffer.length-1) break;

                        // \nFrom may be split between the buffers
                        else if (i+5 > buffer.length-1) {

                            previousbuf = new Buffer(buffer.length-i-1);
                            buffer.copy(previousbuf, 0, i+1);
                            break;

                        // \nFrom is within buffer 
                        } else if (buffer.slice(i+1, i+6).toString() === "From ") {

                            messages.offsets.push(position + (i+1)-previousbuflen);

                        }
                    }

                    i++;

                }

                // There is more to read!
                if (bytesRead === options.bufsize) read(position + options.bufsize + 1, previousbuf, cb);
                else {

                    i = 0;

                    while (i < messages.offsets.length - 1) {

                        msgsize = messages.offsets[i+1] - messages.offsets[i];
                        messages.size += msgsize;
                        messages.sizes.push(msgsize);
                        i++;

                    }

                    if (messages.offsets.length > 0) {

                        msgsize = position + bytesRead - messages.offsets[i];
                        messages.sizes.push(msgsize);
                        messages.size += msgsize;
                        messages.count = messages.offsets.length;

                    }

                    // Make a copy
                    // JS seriously needs a good, fast and built-in object clone() method
                    omessages.size = messages.size;
                    omessages.count = messages.count;

                    for (var i in messages.sizes) omessages.sizes.push(messages.sizes[i]);
                    for (var i in messages.offsets) omessages.offsets.push(messages.offsets[i]);

                    cb(null);

                }
            }
        });
    }

    // Constructor code follows
    read(-1, new Buffer("\n"), function(err) {

        if (err) self.emit("init", false, err);
        else {

            options.init = true;
            self.emit("init", true);

        };
    });

};

util.inherits(this.mbox, events.EventEmitter);
