/** @module logging */

var conf = require('./conf');
var fs = require('fs');
var moment = require('moment');

var settings = conf.logging.aspects;
var logfile = undefined;

exports.log = log;

/**
 * log server operation to console
 * @param {boolean} logOrNot Use one of the predefined names: DEBUG_PUT, etc.
 * @param {string} message
 */

if (conf.logging.logfile) {

    var options = {flags: 'a', encoding: null, mode: 0755};
    logfile = fs.createWriteStream(conf.logging.logfile, options);

}

function actuallyLog(ts,aspect,message) {

    var message = ts + ' [' + aspect + '] ' + message + '\n';

    if ( conf.logging.logOnScreen ) {

        process.stdout.write ( message );

    }

    if ( logfile !== undefined ) {

        logfile.write ( message );

    }
}

function log(aspect,message) {

    if (settings[aspect] != false) {

        var ts = moment().format(conf.logging.timestamp);

        if (settings[aspect] != true) {

            actuallyLog(ts, 'log','Invalid log type \'' + aspect + '\'');

        }

        actuallyLog ( ts, aspect, message );

    }

}

exports.log = log;

