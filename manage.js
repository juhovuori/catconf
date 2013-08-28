#!/usr/bin/env node

var doc = "Usage:\n" +
" manage.js [-Dfhqv] deploy\n" +
" manage.js [-Dfhqv] install\n" +
" manage.js [-Dfhqv] uninstall\n" +
" manage.js [-Dfhqv] status\n" +
" manage.js [-Dfhqv] list-users\n" +
" manage.js [-Dfhqv] list-domains\n" +
" manage.js [-Dfhqv] user-conf [-1]\n" +
" manage.js [-Dfhqv] domain-conf [-1]\n" +
" manage.js [-Dfhqv] list-domain-admins\n" +
" manage.js [-Dfhqv] add-domain-admin <domain> <username>\n" +
" manage.js [-Dfhqv] remove-domain-admin <domain> <username>\n" +
" manage.js [-Dfhqv] add-domain <domain>\n" +
" manage.js [-Dfhqv] remove-domain <domain>\n" +
" manage.js [-Dfhqv] add-user <username>\n" +
" manage.js [-Dfhqv] password <username>\n" +
" manage.js [-Dfhqv] remove-user <username>\n" +
"\n" +
"-h --help       show this\n" +
"--version       show version\n" +
"-f --force      proceed with destructive actions\n" +
"-v --verbose    more output\n" +
"-D --debug      still more output\n" +
"-q --quiet      no output\n";

var VERBOSE = false;
var DEBUG = false;
var QUIET = false;

if (require.main === module) { main () }

function main() {
    var conf = require('./conf');
    var nano = require('nano');
    var opts = require('docopt').docopt(doc);
    var domain = opts['<domain>'];
    var username = opts['<username>'];
    var server = nano(conf.couchUrl);
    var db = server.db.use(conf.db);

    //console.log(opts);
    if (opts['--debug']) { DEBUG = true; }
    if (opts['--debug'] || opts['--verbose']) { VERBOSE = true; }
    if (opts['--quiet']) { QUIET = true; }
    if (opts['status']) status(server,conf.db,conf.url);
    else if (opts['uninstall']) uninstall(server,conf.db);
    else if (opts['install']) install(server,conf.db);
    else if (opts['deploy']) deploy(db);
    else if (opts['list-users']) listDB(db);
    else if (opts['list-domains']) listDB(db);
    else if (opts['list-domain-admins']) listDomainAdmins(db);
    else if (opts['add-domain-admin']) addDomainAdmin(db,domain,username);
    else if (opts['remove-domain-admin']) removeDomainAdmin(db,domain,username);
    else if (opts['password']) password(db,username);
    else if (opts['add-user']) addUser(db,username);
    else if (opts['remove-user']) removeUser(db,username);
    else if (opts['add-domain']) addDomain(db,domain);
    else if (opts['remove-domain']) removeDomain(db,domain);
    else console.log('Should not happen.');
}

function listDomainAdmins(db,users) {
    return;
}

function addDomainAdmin(db,users,domain,username) {
    return;
}

function removeDomainAdmin(db,users,domain,username) {
    return;
}

function addDomain(db,domain) {
    writeObject(db, {
        _id: domain,
        name: domain,
        parents: []
    });
}

function removeDomain(db,domain) {
    removeObject(db,domain);
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

function deploy(db) {
    var fs = require('fs');
    var buf = fs.readFileSync('couch-design.json')
    var doc = JSON.parse(buf.toString('utf-8'));

    db.get(doc._id,function (err,body) {
        if ((body) && (body._rev !== undefined)) doc._rev = body._rev;
        writeObject(db, doc, function (err) {
            if (err) process.exit(1);
            else process.exit(0);
        });
    });

}

function addUser(db,username) {
    getPassword(function (password) {
        if (password === undefined) return;
        writeObject(db, {
            _id: username,
            name: username,
            metadata: {
                parents: [],
                authorization: {
                    type: 'password',
                    password: password
                }
            }
        });
    });
}

function password(db,username) {
    var bcrypt = require('bcrypt');
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

function removeUser(db,username) {
    removeObject(db,username);
}

function status(server,db,url) {
    console.log(url);
    server.db.get('',function(err,body,header) {
            if (err) {
                console.log("Server not up.");
                //console.log(err);
            } else {
                console.log("Server up.");
                if (VERBOSE) console.log(body);

                server.db.get(db,function(err,body,header) {
                    if (err) {
                        console.log("Database not found");
                        if (VERBOSE) console.log(err);
                    } else {
                        console.log( "Database found" );
                        //console.log(body);
                    }
                });
            }
    });
}

function uninstall(server,db) {
    console.log('Attempting to destroy db ' + db);
    server.db.destroy(db,function (err,body,header) {
        if (err) {
            console.log('ERROR: ' + err);
            process.exit(1);
        } else {
            console.log('Database removed.');
            console.log('CouchDB is still running though.');
            process.exit(0);
        }
        console.log(body); 
    });
}

function install(server,db) {
    console.log('Attempting to create db ' + db);
    server.db.create(db,function (err,body,header) {
        if (err) {
            console.log('Database creation failed: ' + err);
            process.exit(1);
        } else {
            console.log('Database created. You must still run deploy.');
            process.exit(0);
        }
    });
}


function listDB(db) {
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

function writeObject(db,ob,cb) {
    if (VERBOSE) {
        console.log('attempting to write object.');
        console.log(ob);
    } else {
        console.log('attempting to write object ' + ob._id + '.');
    }
    db.insert(ob,function (err,body,headers) {
        if(err) {
            console.log('Error.');
            console.log(err);
            if (cb) cb(err);
        } else {
            console.log('Ok.');
            if (cb) cb();
        }
    });
}

function removeObject(db,id) {
    console.log('querying revision of ' + id + '.');
    db.get(id,function (err,body) {
        var rev
        if(err) {
            console.log('Error.');
            console.log(err);
        } else {
            rev = body._rev;
            console.log('attempting to delete revision ' + rev + '.');
            db.destroy(id,rev,function (err,body) {
                if(err) {
                    console.log('Error.');
                    console.log(err);
                } else {
                    console.log('Ok.');
                }
            });
        }
    });
}


