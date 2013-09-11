/** @module catconf */

var $ = require('jquery');

var conf = require('./conf');
var log = require('./logging').log;
var async = require("async");

function getCouchDesignJSON() {

    var fs = require("fs");
    var json = fs.readFileSync('couch-design.json').toString('utf-8');
    return json;

}

/**
 * Parse and validate data read from backend.
 * @param {string} data Must be a valid JSON object
 */
function parseDBJSON (data) {

    // Used as dataFilter to couch request
    // TODO: Error checking ? In theory everything coming out of couchdb
    // should be valid
    return JSON.parse(data);

}

function getUrl (nodeId) {

    var suffix = conf.couchDB.db;

    if (nodeId !== undefined) suffix += '/' + nodeId;

    return conf.couchDB.url + '/' + suffix;

}

function getViewUrl (view) {

    return getUrl('_design/catconf/_view/' + view);

}

function listNodes(view,params) {

    var def = $.Deferred();
    var options =  {
        type : 'GET',
        url : getViewUrl(view),
        dataFilter: parseDBJSON,
        processData: false
    };

    if (params) {

        options.type = 'POST';
        options.contentType = "application/json";
        options.data = params ? JSON.stringify(params) : {};

    }

    log('storage',JSON.stringify(options));
    $.ajax( options ).done( listLoadOk ).fail( listLoadFail );

    return def;

    function listLoadOk(ob) {

        log('storage','View loaded');

        if ((ob instanceof Object) && (ob.rows instanceof Array)) {

            var array = ob.rows.map(function (x) {return x.id;});
            def.resolve(array);

        } else {

            def.reject({"error":"invalid data"});

        }

    }
    
    function listLoadFail (err) {

        log('storage','View load failed: ' + JSON.stringify(err));
        def.reject(err);

    }

}

exports.getNode = function (nodeId, rawData) {

    var options = {
        dataFilter: parseDBJSON,
        url : getUrl(nodeId),
    };
    var def = $.Deferred();
    log('storage','Requesting ' + options.url);
    $.ajax( options ).done(dataReadDone).fail(dataReadFailed);

    return def;

    function dataReadFailed (err) {def.reject(err);}

    function dataReadDone (node) {

        log('storage','Node loaded ' + nodeId);

        if (node.metadata.nodeId === undefined) {

            node.metadata.nodeId = node._id;
            log ('storage','Warning: no explicit nodeId in ' +
                node.metadata.nodeId);

        }

        if (!rawData) {

            for (var key in node) {

                if ((typeof(key) == 'string') && (key[0] == '_')) {

                    delete node[key];

                }

            }

        }

        def.resolve (node);

    }

}

exports.listAllNodes = function () {
    
    return listNodes('all');

}

exports.listUserNodes = function () {
    
    return listNodes('users');

}

exports.listDomainNodes = function () {

    return listNodes('domains');

}

exports.listInDomainNodes = function (nodeId) {

    return listNodes('in-domain',{'keys':[nodeId]});

}

exports.deleteNode = function (nodeId) {

    var def = $.Deferred();

    exports.getNode ( nodeId, true )
        .done(oldNodeLoaded)
        .fail(deleteFail);

    return def;

    function oldNodeLoaded (oldNode) {

        var options = {
            url : getUrl( oldNode.metadata.nodeId ) + '?rev=' + oldNode._rev,
            type : 'DELETE'
        };

        $.ajax( options )
            .done( deleteOk )
            .fail( deleteFail );

    }

    function deleteOk (data) {

        def.resolve(data);

    }

    function deleteFail (err) {
        
        def.reject(err);

    }


}

exports.putNode = function (node) {

    var def = $.Deferred();

    exports.getNode ( node.metadata.nodeId, true )
        .done(setRevisionInfo)
        .fail(writeNewNode);

    return def;


    function setRevisionInfo (oldNode) {

        node._rev = oldNode._rev;
        writeNewNode();

    }

    function writeNewNode () {

        var options = {
            url : getUrl(node.metadata.nodeId),
            contentType: "application/json",
            data: JSON.stringify(node),
            dataFilter: parseDBJSON,
            processData: false,
            type : 'PUT'
        };

        log('storage','Start writing node.');
        log('storage',options.data);

        $.ajax( options ).
            done( putOk ).
            fail( putFail );

    }

    function putFail (err) {

        log('storage',JSON.stringify(err));
        def.reject(err);

    }

    function putOk (data) {

        log('storage','Node written succesfully');
        def.resolve(data);

    }

}

/**
 * Needed for manage and testing
 */
exports.dbExists = function() {

    var dbUrl = conf.couchDB.url+'/'+conf.couchDB.db;
    var headers = {
        'Authorization': conf.couchDB.authorization,
    };

    return $.ajax({ url:dbUrl, type:'GET', headers:headers });

}

/**
 * Needed for manage and testing
 */
exports._WARNING_destroyDB = function() {
    var dbUrl = conf.couchDB.url+'/'+conf.couchDB.db+'/';
    var headers = {
        'Authorization': conf.couchDB.authorization,
    };
    return $.ajax({ url:dbUrl, type:'DELETE', headers:headers })
}

/**
 * Needed for manage and testing
 */
exports.createDB = function (world) {

    var dbUrl = conf.couchDB.url+'/'+conf.couchDB.db;
    var def = $.Deferred();
    var headers = {
        'Authorization': conf.couchDB.authorization,
    };
    $.ajax({ url:dbUrl, type:'PUT', headers:headers })
        .done(putDesignDoc)
        .fail(createFail);

    return def;

    function putDesignDoc() {

        var options = {
            url:dbUrl + '/_design/catconf',
            type:'PUT',
            headers:headers,
            contentType: "application/json",
            data: getCouchDesignJSON(),
            processData: false
        };

        return $.ajax(options).
            done(putWorld).
            fail(createFail);

    }

    function putWorld() {

        if (!world) {
            
            createOk();

        } else {

            async.map(world,sendDoc,results);

        }

        function sendDoc (doc,myDone) {

            exports.putNode(doc)
                .done( function() { myDone(null,null); } )
                .fail( function() { myDone('error',null); } );

        }

        function results (err,results) {

            if (err) createFail(new Error(msg));
            else createOk();

        }

    }

    function createFail(err) { def.reject(err); }

    function createOk(data) { def.resolve(data); }

}

exports.status = function () {

    var headers = {
        'Authorization': conf.couchDB.authorization,
    };
    var serverUrl = conf.couchDB.url;
    var dbUrl = conf.couchDB.url+'/'+conf.couchDB.db;
    var rv = {}
    var def = $.Deferred();

    $.ajax({ url:serverUrl, type:'GET', headers:headers })
        .done(serverUp)
        .fail( fail );

    return def;

    function serverUp(data) {

        rv.server = data;
        $.ajax({ url:dbUrl, type:'GET', headers:headers })
            .done(dbOk)
            .fail(fail);

    }

    function dbOk(data) {

        rv.db = data;
        def.resolve(rv);

    }

    function fail(err) {

        rv.error = err;
        def.reject(rv);

    }

}
