var libcatconf = require("../libcatconf");
var conf = require("../conf");
var $ = require("jquery");
var fs = require("fs");
var data = require("./data.js");
var http = require("http");
var async = require("async");

var initialRetrys = 5;

if (process.env.CATCONF_TEST === undefined) {

    console.log("You must set CATCONF_TEST to run tests");
    process.exit(1);

}

libcatconf.configure({ urlBase:conf.catconfUrl, });

var couchDesignJSON = fs.readFileSync('couch-design.json').
                        toString('utf-8');

exports.initializeTestDBBeforeTest = function (next) {

    var dbUrl = conf.couchDB.url+'/'+conf.couchDB.db+'/';
    var headers = {
        'Authorization': conf.couchDB.authorization,
    };

    var retrys = initialRetrys; // Sometimes couch is too slow so just retry n times

    return dbExists().
        done(destroyAndCreateDB).
        fail(createDB);

    function dbExists() {

        return $.ajax({ url:dbUrl, type:'GET', headers:headers });

    }

    function destroyAndCreateDB() {

        if (retrys == 0) {
            
            initFail()

        } else {

            retrys --;

            return $.ajax({ url:dbUrl, type:'DELETE', headers:headers }).
                done(createDB).
                fail(initFail);

        }

    }

    function retryCreateDB() {

        console.log("Database initialization failed, retrying in a while. " +
                    "(This is not serious)");
        setTimeout(createDB,1000);

    }

    function createDB() {

        return $.ajax({ url:dbUrl, type:'PUT', headers:headers }).
            done(putDesignDoc).
            fail(retryCreateDB);

    }

    function putDesignDoc() {

        var options = {
            url:dbUrl + '/_design/catconf',
            type:'PUT',
            headers:headers,
            contentType: "application/json",
            data: couchDesignJSON,
            processData: false
        };

        return $.ajax(options).
            done(putWorld).
            fail(initFail);

    }

    function putWorld() {

        async.map(data.testWorld,sendDoc,results);

        function sendDoc (doc,myDone) {

            var nodeId = doc.metadata.nodeId;
            var url = dbUrl + '/'+nodeId;

            var options = {
                url:url,
                type:'PUT',
                headers:headers,
                contentType: "application/json",
                data: JSON.stringify(doc),
                processData: false
            };
            $.ajax(options).
                done(function() {myDone(null,null);}).
                fail(function() {myDone('error',null);});

        }

        function results (err,results) {

            if (err) next(new Error(msg));
            else next();

        }

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

