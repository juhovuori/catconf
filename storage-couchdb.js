/** @module catconf */

var $ = require('jquery');

var conf = require('./conf');
var log = require('./logging').log;

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

    var suffix = conf.db;

    if (nodeId !== undefined) suffix += '/' + nodeId;

    return conf.couchUrl + '/' + suffix;

}

function getViewUrl (view) {

    return getUrl('_design/catconf/_view/' + view);

}

exports.getNode = function (userId, nodeId, rawData) {

    /* TODO: remove authorization from here */

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

        if (node.metadata.authorization === undefined) {

            def.resolve(node);

        } else if (node.metadata.nodeId == userId) {
            
            def.resolve(node);

        } else {
            
            def.reject({
                status:403,
                statusText: "Cannot read other users\' nodes"
            });

        }

    }

}

exports.deleteNode = function (userId,nodeId) {

    var options = {
        url : getUrl(nodeId) + '?rev='+oldNode._rev,
        type : 'DELETE'
    };

    $.ajax( options ).
        done(deleteOk).
        fail(deleteFail);

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

exports.deleteNode = function (userId, nodeId) {

    var def = $.Deferred();

    exports.getNode ( userId, nodeId, true )
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

exports.putNode = function (userId, node) {

    var def = $.Deferred();

    exports.getNode ( userId, node.metadata.nodeId, true )
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

