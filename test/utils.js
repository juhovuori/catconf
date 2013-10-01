var libcatconf = require("../libcatconf");
var conf = require("../conf");
var data = require("./data.js");
var storage = require('../' + conf.storageModule);

var initialRetrys = 5;

if (process.env.CATCONF_TEST === undefined) {

    console.log("You must set CATCONF_TEST to run tests");
    process.exit(1);

}

libcatconf.configure({ urlBase:conf.catconfUrl, });

exports.initializeTestDBBeforeTest = function (next) {

    // Sometimes couch is too slow so just retry n times
    var retrys = initialRetrys;

    return storage.dbExists()
        .done(destroyAndCreateDB)
        .fail(createDB);

    function destroyAndCreateDB() {

        storage._WARNING_destroyDB()
            .done(createDB)
            .fail(initFail);

    }

    function createDB() {

        if (retrys == 0) {
            
            initFail({
                responseText: '{"error":"Fail","reason":"Too many retries"}'
            });

        } else {

            retrys --;

            return storage.createDB(data.testWorld)
                .done(initOk)
                .fail(retryCreateDB);

        }

    }

    function retryCreateDB(err) {

        var dbUrl = conf.couchDB.url+'/'+conf.couchDB.db;

        if (err.status == 401) {

            next (new Error(err.responseText));

        }

        console.log("Retry DB creation (" + conf.couchDB.db + ")");
        setTimeout(createDB,100);

    }

    function initOk() {

        next();

    }

    function initFail(err) {

        var ob = JSON.parse(err.responseText);

        var msg = ob.error + ": " + ob.reason;
        next(new Error(msg));

    }

};

exports.getNode = function (next,creds,myNodeId) {

    libcatconf.getNode(myNodeId,{creds:creds}).
        done(function(data){next();}).
        fail(function(err){

            next(new Error(err.status + ": " +  err.statusText));

        });

};

exports.nodeDoesNotExist = function (next,creds,nodeId) {

    libcatconf.getNode(nodeId,{creds:creds}).
        done(function(data){next(new Error(nodeId + ' found'));}).
        fail(function(err){

            if (err.status == 404) next();
            else next(new Error('Wrong error: ' + err.status));

        });

};

exports.handleError = function (err) {

    var msg;

    try {

        var ob = JSON.parse(err.responseText);
        msg = ob.error + ": " + ob.reason + " (" + dbUrl + ")";

    } catch (e) {

        if (err.statusText == 'error') {

            msg = err.status + ": " +  err.responseText;

        } else if (err.status === undefined) {

            msg = JSON.stringify(err);

        } else {

            msg = err.status + ": " +  err.statusText;

        }

    }

    return new Error(msg);

};

exports.getNodeId = function (node) {

    return node.metadata.nodeId;

};

exports.getCreds = function (node) {

    return {
        user: node.metadata.nodeId,
        pass: node.metadata.authorization.password
    };

};

exports.getWrongCreds = function (node) {

    return {
        user: node.metadata.nodeId,
        pass: "liirumlaarum" + node.metadata.authorization.password
    };

};

exports.nodeEquals = function (next,creds,nodeId,node) {

    libcatconf.getNode(nodeId,{creds:creds})
        .done(function(data) {

            if (node === undefined) {

                // Don't compare, just be happy that received something
                next();

            } else {

                // Compare ->
                // Don't check authorization data, as it may
                // differ because of encryption
                delete data.metadata.authorization;
                delete node.metadata.authorization;

                if (deepEquals(data,node)) {

                    next();

                } else {

                    console.log('GOT: ' + JSON.stringify(data));

                    console.log('EXPECTED: ' + JSON.stringify(node));

                    next( new Error("Received wrong data."));

                }

            }

        })
        .fail(function (err) { next(exports.handleError(err)); });

};

exports.nodeLoadForbidden = function (next,creds,nodeId) {

    libcatconf.getNode(nodeId,{creds:creds}).
        done(function(data){next(new Error(nodeId + ' loaded'));}).
        fail(function(err){

            if ((err.status == 401) || (err.status == 403)) next();
            else next(new Error('Wrong error: ' + err.status));

        });

};

function deepEquals (ob1, ob2) {

    if ((typeof ob1 == 'object') && (typeof ob2 == 'object')) {

        // get combined keys
        var keys = {};
        for (var k in ob1) keys[k] = true;
        for (var k in ob2) keys[k] = true;

        // loop over them
        for (var k in keys) {

            // check if this key differs
            if (! deepEquals (ob1[k], ob2[k]) ) return false;

        }

        // nothing was different
        return true;


    } else {

        return ob1 === ob2;

    }

}

