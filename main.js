/*

	node-mboxrd
	By Ditesh Shashikant Gathani (ditesh@gathani.org) Copyright 2011

	This program is free software: you can redistribute it and/or modify
	it under the terms of the GNU General Public License as published by
	the Free Software Foundation, either version 3 of the License, or
	(at your option) any later version.

	This program is distributed in the hope that it will be useful,
	but WITHOUT ANY WARRANTY; without even the implied warranty of
	MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
	GNU General Public License for more details.

	You should have received a copy of the GNU General Public License
	along with this program.  If not, see <http://www.gnu.org/licenses/>.

*/

var fs = require("fs");
var util = require("util");
var events = require("events"); 
var hashlib = require("hashlib"); 
var unixlib = require("unixlib");

this.mboxrd = function(fd, options) {

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

    this.top = function(msgnumber) {

        var self = this;

        if (options.init === false) {

            self.emit("error", "Specified mboxrd has not been fully parsed yet or there was an error parsing it (trap 'init' event for more details)");
            return false;

        }

		if (msgnumber > omessages.count || messages.deleted[msgnumber] !== undefined) { 

            self.emit("top", false, msgnumber);
            return false;

        }

        var i = 0;
        var lines = 0;
        var bodyend = 0;
        var headersearch = true;
        var message = this.get(msgnumber);

        while (i < message.length) {

            if (headersearch === true && message[i] === "\n" && message[i+1] === "\n") {

                bodyend = i;
                headersearch = false;

            } else if (headersearch === false && lines >= linesreq) {

                break;

            } else if (headersearch === false && message[i] === "\n") {

                lines++;

                if (lines >= linesreq) {

                    bodyend = i;
                    break;

                }
            }

            i += 1;

        }

        self.emit("top", true, msgnumber, message.slice(0, bodyend));

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
    }; // Don't you love the chain of closing braces? :)

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

util.inherits(this.mboxrd, events.EventEmitter);
