var doc = "Usage:\n" +
" manage.js [-Dfhqv] deploy\n" +
" manage.js [-Dfhqv] world <filename>\n" +
" manage.js [-Dfhqv] install [<world>]\n" +
" manage.js [-Dfhqv] uninstall <really>\n" +
" manage.js [-Dfhqv] status\n" +
" manage.js [-Dfhqv] list-users\n" +
" manage.js [-Dfhqv] list-domains\n" +
" manage.js [-Dfhqv] add-domain <domain> <admin> [...]\n" +
" manage.js [-Dfhqv] remove <nodeId>\n" +
" manage.js [-Dfhqv] add-user <username>\n" +
" manage.js [-Dfhqv] password <username>\n" +
"\n" +
"-h --help       show this\n" +
"--version       show version\n" +
"-f --force      proceed with destructive actions\n" +
"-q --quiet      less output}n";

var VERBOSE = true;

var conf = require('./conf');
var opts = require('docopt').docopt(doc);
var storage = require('./' + conf.storageModule);
var bcrypt = require('bcrypt');

if (require.main === module) { main (); }

function main() {

    var domain = opts['<domain>'];
    var username = opts['<username>'];
    var really = opts['<really>'];
    var world = opts['<world>'];

    if (opts['--quiet']) { VERBOSE = false; }

    if (opts['status']) serverStatus();
    else if (opts['uninstall']) uninstall(really);
    else if (opts['install']) install(world);
    else if (opts['deploy']) deploy();
    else if (opts['world']) world(opts['<filename>']);
    else if (opts['list-users']) listDB();
    else if (opts['list-domains']) listDB();
    else if (opts['remove']) removeNode(username);
    else if (opts['add-domain']) addDomain(domain);
    else if (opts['add-user']) addUser(username);
    else if (opts['password']) password(username);
    else console.log('Should not happen.');
}

function addDomain(domain,admins) {

    var node = {
        metadata : {
            nodeId: domain,
            nodeAdmins: admins,
            parents: []
        }
    };
    storage.putNode (node)
        .done(commandOk)
        .fail(commandFail);
}

function removeNode(node) {

    storage.deleteNode(node);

}

function getPassword(callback) {
    var password = process.env.CATCONF_PASSWORD;

    if (password !== undefined) {
        if (VERBOSE) console.log('Got password from environment.');
        callback(password);
    } else {
        promptPassword(callback);
    }
}

// Get a password from the console, printing stars while the user types
function promptPassword (callback) {
    var stdin = process.openStdin();
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    process.stdin.setRawMode(true);
    var password = '';
    process.stdout.write('Password: ');
    process.stdin.on('data', function (ch) {
        var ch = ch + "";

        switch (ch) {
            case "\n": case "\r": case "\u0004":
                // They've finished typing their password
                process.stdin.setRawMode(false);
                stdin.pause();
                callback(password);
                break;

            case "\u0003":
                // Ctrl C
                console.log('Cancelled');
                process.stdin.setRawMode(false);
                stdin.pause();
                callback(undefined);
                break;

            default:
                // More passsword characters
                process.stdout.write('*');
                password += ch;
                break;
        }
    });
}

function deploy() {

    console.log('deploy is deprecated. install does everything.');

}

function world(filename) {

    console.log('world is deprecated. install does everything.');

}

function addUser(username) {

    getPassword( function (password) {

        if (password === undefined) return commandFail();

        var node = {
            metadata: {
                nodeId: username,
                parents: [],
                authorization: {
                    type: 'password',
                    password: password
                }
            }
        };
        storage.putNode (node)
            .done(commandOk)
            .fail(commandFail);
    
    });

}

function password(username) {
    console.log('figuring out whose password to change.');
    db.get(username,function(err,body,header) {
        if (err) {
            console.log("Error.");
            if (VERBOSE) console.log(err);
        } else {
            var rev = body._rev;
            if (VERBOSE) console.log(body);
            else console.log('revision: ' + rev);
            getPassword(function (password) {
                if (password === undefined) return;
                bcrypt.genSalt(10, function(err, salt) {
                    bcrypt.hash(password, salt, function(err, crypted) {

                        var authorization = {
                            type : 'bcrypt',
                            crypted : crypted,
                        }
                        body.metadata.authorization = authorization;
                        console.log(authorization);
                        if (err) {
                            console.log(err);
                        } else {
                            writeObject(db, body);
                        }
                    });
                });

            });
        }
    });
}

function serverStatus() {

    storage.status()
        .done( function (data) {

            if (VERBOSE) { console.log(data); }
            commandOk();

        })
        .fail(commandFail);

}

function uninstall(arg) {

    var reqArg = 'i-know-this-destroys-my-data';

    if (arg != reqArg) {
        
        console.log('Please use this command as follows:');
        console.log('manage uninstall ' + reqArg);

        return commandFail();

    }

    console.log('Attempting to destroy database');
    storage._WARNING_destroyDB()
        .done( commandOk )
        .fail( commandFail);

}

function install(world) {

    if (VERBOSE) console.log('Attempting to create database'
        + (world !== undefined ?  'and populate it with initial nodes.' : '')
        );

    storage.createDB(world)
        .done( commandOk )
        .fail( commandFail);

}


function listDB() {
    db.list(function(err,body,header) {
        if (err) {
            console.log('Error.');
            console.log(err);
            process.exit(1);
        } else {
            body.rows.forEach(function (row) {
                if (row.id.indexOf('_design') !== 0) {
                    db.get(row.id,function(err,body) {
                        if (err) {
                            console.log(err);
                            process.exit(1);
                        } else {
                            if (VERBOSE) {
                                console.log(body);
                            } else {
                                console.log(body.name);
                            }
                        }
                    });
                }
            });
            process.exit(0);
        }
    });
}

function commandOk() {

    if (VERBOSE) console.log('Ok');

    process.exit(0);

}

function commandFail(err) {
    
    if (VERBOSE) console.log(err);

    process.exit(1);

}

