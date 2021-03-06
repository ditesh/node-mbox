# node-mbox

node-mbox is an evented wrapper around mbox files for Node.js. It offers the following capabilities:

* mboxrd support (see http://qmail.org/man/man5/mbox.html for information on mboxrd)
* read messages
* delete messages
* sync to disk

# Usage

See `demo.js`

# Does this actually work?

Yep. Parsed a 2.2GB mbox file on a slow disk in under a minute with 4KB buffers. It works but it could certainly be faster :)

# License

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
