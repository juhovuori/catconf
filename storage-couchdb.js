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


// function getSingleLevelNode (userId,nodeId) {
exports.getNode = function (userId,nodeId) {

    /* TODO: remove authorization from here */
    /* TODO: _prop-handling must be here */

    var options = {
        dataFilter: parseDBJSON,
        url : getUrl(nodeId),
    };
    var def = $.Deferred();
    log('storage','Requesting ' + options.url);

    $.ajax( options ).done(dataReadDone).fail(dataReadFailed);

    return def;

    function dataReadFailed (err) {def.reject(err);}

    function dataReadDone (data) {

        if (data.metadata.authorization !== undefined) {

            if (data.metadata.nodeId == userId) def.resolve(data);

            else def.reject({status:403,
                        statusText: "Cannot read other users\' nodes"});

        } else {

            def.resolve(data);

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


function deleteNode (req,res) {

    var nodeId = req.params.id;
    var oldNode;
    var children = [];

    log ('delete','Attempting to delete ' + nodeId);
    getSingleLevelNode ( getUserId(req), nodeId ).
        done(deleteNodeLoaded).
        fail(deleteFail);

    function deleteFail (err) {

        log('delete',JSON.stringify(err));
        log('delete', 'Delete failed ' + err.status||500 + ' ' + err.statusText);
        res.send(err.statusText+'\n',err.status||500);

    };

    function deleteOk (data) { res.send(data); }

    function authorizeDelete (userId) {

        if (typeof oldNode != 'object') return "Invalid node";

        if (typeof oldNode.metadata != 'object') return "Invalid node";

        if (typeof oldNode.metadata.authorization == 'object') {

            // Users can only delete their own nodes.

            if (oldNode.metadata.nodeId != userId) {

                return "Cannot delete other users\' nodes";

            }

        } else if (oldNode.metadata.nodeAdmins instanceof Array) {

            // Only admins can delete domain nodes
            if (oldNode.metadata.nodeAdmins.indexOf(req.user) == -1) {

                return userId + " is not a node admin of node " +
                        oldNode.metadata.nodeId;
            }

        }

        if (children.rows.length != 0) {

            // Cannot delete a node that has children
            return "Parent of other nodes cannot be deleted."

        }

        // All checks passed
        return undefined;

    }

    function deleteNodeLoaded (data) {

        oldNode = data;
        getView('in-domain',nodeId).
            done(childrenLoaded).
            fail(deleteFail);

    }

    function childrenLoaded(data) {

        children = data;
        var error = authorizeDelete(getUserId(req));

        if (error === undefined) {

            var options = {
                url : getUrl(nodeId) + '?rev='+oldNode._rev,
                type : 'DELETE'
            };

            $.ajax( options ).
                done(deleteOk).
                fail(deleteFail);

        } else {

            deleteFail({status:403,statusText:error});

        }

    }

}

function putNode (req,res) {

    // TODO: Implement put queue to get rid of race conditions

    var newNode = req.body;
    var nodeId = req.params.id;
    var nodes;
    var singleLevel = req.query['single-level'] !== undefined;

    log('put','Start writing node '+nodeId);
    var error = validateNodeForm(newNode,nodeId);

    if (error) {

        validationFail(error);

    } else {

        log('put','Node validated ok');
        queueNodeLoad (getUserId(req),nodeId,singleLevel,
                        newNode.metadata.parents,true).
            done(putDataLoaded).
            fail(putDataLoadFailed);

    }

    function recursiveUnmergeWithSideEffects (node,unmergable) {

        for (var key in unmergable) {

            if ((typeof(unmergable[key]) == 'object') &&
                (typeof(node[key]) == 'object')) {

                recursiveUnmergeWithSideEffects(node[key],unmergable[key]);

            } else if (node[key] == unmergable[key]) {

                node[key] = undefined;

            }

        }

    }

    function putFail (err) {

        log('put', 'Put failed: ' + err.statusText + '(' +
            (err.status||500) + ')');
        log('put',JSON.stringify(err));
        res.send(err.statusText+ '\n',err.status||500);

    }

    function validationFail (msg) { putFail({statusText: msg, status:400}); }

    function putOk (data) {

        log('put','Node written succesfully');
        res.send(data);

    }

    function validateNodeForm (node,nodeId) {

        var metadata = node.metadata;

        if (typeof metadata !== 'object') {

            return 'Node must have metadata object.';

        }

        if (typeof nodeId !== 'string') {

            return 'Node id must be a string.';

        } 

        if (nodeId != metadata.nodeId) {

            return 'Node id must match nodeId property in metadata object.';

        }

        for (var k in node) {

            if (typeof k !== 'string') {

                return 'Invalid property ' + k;

            } else if (k[0] == '_') {

                return 'Property names may not begin with _';

            }

        }

        if (metadata.nodeAdmins !== undefined) {

            if (!(metadata.nodeAdmins instanceof Array)) {

                return 'nodeAdmins must be an array.';

            }

        };

        if (metadata.authorization !== undefined) {

            if (typeof metadata.authorization != 'object') {

                return 'invalid authorization property';

            } else if (metadata.authorization.type === 'bcrypt') {

                if (typeof metadata.authorization.crypted != 'string') {

                    return 'invalid authorization property';

                }

            }

            else if (metadata.authorization.type === 'password') {

                if (typeof metadata.authorization.password !== 'string') {

                    return 'invalid password property.';

                }

            } else {

                return 'invalid password type';

            }

        }

    }

    function isThereALoopOrMissingParent(currentNodeId,nodesSoFar) {

        // Recursively check if there are loops

        if (nodes[currentNodeId] === undefined) {

                return "Parent " + currentNodeId + " does not exist.";
                
        }

        var parents = nodes[currentNodeId].metadata.parents;
        for (var i in parents) {

            var parent = parents[i];

            // If this node would create a loop, stop here
            if (nodesSoFar.indexOf(parent) != -1) {
                
                return "This would create an inheritance loop.";
                
            }

            // Cannot just push because of multiple inheritance
            var newNodesSoFar = nodesSoFar.concat([parent]);

            var parentError = isThereALoopOrMissingParent(parent,newNodesSoFar);

            if (parentError) return parentError;

        }

        // None of the parent lines created a loop, nice.
        return null;
    }

    function validateAndTransform () {

        var oldNode = nodes[nodeId];

        if (oldNode !== undefined) {

            newNode._rev = nodes[nodeId]._rev;

        }

        nodes[nodeId] = newNode; // loop detection needs this

        var error = isThereALoopOrMissingParent(nodeId,[]);
        if (error) {

            validationFail(error);

        } else {

            // construct a version of node with non-inherited properties only

            var stubNode = { metadata: {parents : newNode.parents }};
            nodes[nodeId] = stubNode;
            var unmergable = constructWithSideEffects(nodeId,nodes,{});

            // preserve special properties
            delete unmergable.metadata;

            recursiveUnmergeWithSideEffects(newNode, unmergable);

            // transform authorization and write

            var auth = newNode.metadata.authorization;

            if ((typeof auth == 'object') && (auth.type == 'password')) {

                transformAuthorizationAndWrite(newNode);

            } else {

                log('put','Not transforming authorization');
                writeFinally(newNode);

            }

        }

    }

    function transformAuthorizationAndWrite(singleLevelNode) {

        log('put','Start transforming node authorization');
        var password = singleLevelNode.metadata.authorization.password;

        bcrypt.genSalt(10, function(err, salt) {

            if (err) {

                validationFail('Unable to generate password salt.');

            } else {

                bcrypt.hash(password, salt, function(err, crypted) {

                    if (err) {

                        validationFail('Unable to crypt password.');

                    } else {

                        var auth = { type : 'bcrypt', crypted : crypted }
                        singleLevelNode.metadata.authorization = auth;
                        log('put','Transformed authorization to ' + JSON.stringify(auth));
                        writeFinally(singleLevelNode);

                    }

                });

            }

        });
    }

    function writeFinally (singleLevelNode) {

        var options = {
            url : getUrl(nodeId),
            contentType: "application/json",
            data: JSON.stringify(singleLevelNode),
            dataFilter: parseDBJSON,
            processData: false,
            type : 'PUT'
        };

        log('put','Finally writing node "' + nodeId + '"');
        log('put',options.data);

        $.ajax( options ).
            done( putOk ).
            fail( putFail );

    }

    function putDataLoaded (loadedNodes) {

        nodes = loadedNodes;
        authorizePut();

    }

    function putDataLoadFailed (err) {

        if (err.status == 404) {

            // the node didn't exist
            nodes = {};
            authorizePut();

        } else putFail(err);

    }

    function authorizePut() {


        var userId = getUserId(req);
        var oldNode = nodes[nodeId];

        if (oldNode !== undefined) {

            // There was an earlier node here.
            log('put','Authorizing rewrite of existing node.');

            if (oldNode.metadata.authorization !== undefined) {

                if (userId == oldNode.metadata.nodeId) {

                    validateAndTransform();

                } else {
                    
                    putFail( {status:403, statusText:
                        'User nodes can only be edited by respective users'});

                }

            } else if (oldNode.metadata.nodeAdmins) {

                if (oldNode.metadata.nodeAdmins.indexOf(userId) != -1) {

                    validateAndTransform();

                } else {

                    putFail({status:403,statusText:'Not a node admin'});

                }

            } else {

                putFail({
                    status:403,
                    statusText:'Cannot figure out node authorization'
                });

            }

        } else {

            log('put','Authorizing creation of a new node');
            validateAndTransform();

        }

    }

}


