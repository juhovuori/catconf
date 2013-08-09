#!/usr/bin/env node

var express = require('express');
var app = express();
var conf = require('./conf');
var $ = require('jquery');
var btoa = require('btoa');
var atob = require('atob');
var bcrypt = require('bcrypt');
var libcatconf = require('./libcatconf');

var DEBUG_DELETE = false;
var DEBUG_AUTH = false;
var DEBUG_VIEW = false;
var DEBUG_LIST = false;
var DEBUG_GET = false;
var DEBUG_PUT = false;
var DEBUG_QUEUE = false;
var DEBUG_CONSTRUCTION = false;
var DEBUG = false;

var logI = 0;

function log(level,message) {

    logI++;

    if (level) {

        console.log(logI,message);

    }

}

function parseDBJSON (data) {

    // Used as dataFilter to couch request
    // TODO: Error checking ? In theory everything coming out of couchdb
    // should be valid
    return JSON.parse(data);

}

function getUserId(req) {

    return req.user;

}

function authorizeAgainstNode(node,user,pass,compared) {

    var def = $.Deferred();

    if (typeof node !== 'object') {

        def.reject( "Not an object" );

    } else if (typeof node.metadata !== 'object') {

        def.reject( "No proper metadata property" );

    } else if (node.metadata.nodeId !== user) {

        def.reject( "nodeId does not match" );

    } else if (typeof node.metadata.authorization !== 'object') {

        def.reject( "No proper authorization property" );

    } else {

        var auth = node.metadata.authorization;

        if (auth.type == 'bcrypt') {

            bcrypt.compare (pass,auth.crypted,compared);

        } else if (auth.type == 'password') {

            compared (null, (auth.password == pass));

        } else {

            def.reject ('Cannot figure out how to authenticate');

        }

    }
    
    return def;


    function compared (err,results) {
        
        if (err) {

            def.reject(err);

        } else if (results) {

            def.resolve();

        } else {

            def.reject('Password doesn\'t match');

        }

    }

}

exports.authorizeAgainstNode = authorizeAgainstNode;

function catconfAuthentication(req, res, next) {

    var auth = req.headers.authorization;
    var user,pass,clearText,i;
    log(DEBUG,"REQUEST: " + req.method + " " + req.path);
    delete req.user; // Remove if anything here.

    if (auth) {

        log(DEBUG_AUTH, "Start HTTP authentication");
        clearText = atob(auth.substring("Basic ".length));
        var i = clearText.indexOf(":");

        if (i == -1) {

            log(DEBUG_AUTH, "Invalid authorization header " + auth);
            unauthorized('Invalid authorization header');

        } else {

            user = clearText.substring(0,i);
            pass = clearText.substring(i+1);
            log(DEBUG_AUTH, user + "/" + pass);

            if (!user) {

                log(DEBUG_AUTH, "Authentication failed, no user");
                unauthorized('No user in authorization header');

            } else {

                getSingleLevelNode(user,user).
                    done (nodeLoaded).
                    fail (nodeLoadFailed);

            }

        }

    } else if (req.session && req.session.user) {

        req.user = req.session.user;
        log(DEBUG_AUTH, "Set user from session. " + req.user);
        next();

    } else {

        log(DEBUG_AUTH, "No session or authorization header, " +
                        "proceeding as unauthenticated");
        delete req.user;
        next();

    }

    function nodeLoaded (node) {

        authorizeAgainstNode(node,user,pass).
            done(compareOk).
            fail(compareFail);

    }

    function nodeLoadFailed (err) {

        log(DEBUG_AUTH, "Cannot load user node");
        unauthorized();

    }

    function compareOk () {

        log(DEBUG_AUTH, "Password comparison succeeded");
        req.user = user;
        next();

    }

    function compareFail (err) {

        log(DEBUG_AUTH, "Error: " + err);
        unauthorized(err);

    }

    function unauthorized (msg) {
        res.statusCode = 401;
        if (msg === undefined) msg = 'Unauthorized';
        res.end(msg);
        // don't call next here, request handling stops.
    }

}

function getSingleLevelNode (userId,nodeId) {

    var options = {
        dataFilter: parseDBJSON,
        url : getUrl(nodeId),
    };
    var def = $.Deferred();
    log(DEBUG_QUEUE,'Requesting ' + options.url);

    $.ajax( options ).done(dataReadDone).fail(dataReadFailed);

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
    return def;
}

function constructWithSideEffects (nodeId,nodes,mergedNode) {

    function mergeWithSideEffects (merged,node) {

        for (var key in node) {

            var t = typeof(node[key]);
            var tt = typeof(node[key]);

            if ((t == 'string') ||
                (t == 'number') ||
                (t == 'boolean') ||
                (t == 'null') ||
                ((t == 'object') && (tt != 'object'))) {

                log(DEBUG_CONSTRUCTION,'Merging key ' + key);
                merged[key] = node[key]

            } else if ((t == 'object') && (tt == 'object')) {

                log(DEBUG_CONSTRUCTION,'Recursively merging key ' + key);
                merged[key] = {};
                mergeWithSideEffects(merged[key],node[key]);

            } else {

                log(DEBUG_CONSTRUCTION,'Not merging key ' + key + ' (' +
                    node[key] + ')');

            } // skipping undefineds and functions

        }

    }

    if (nodes[nodeId] === undefined) {

        // This happens in inheritance loops or diamonds.
        // Things go just fine if we just stop here.
        // Loops might be worth giving an error though.
        return mergedNode;

    }

    var current = nodes[nodeId];
    nodes[nodeId] = undefined;

    for (var i in current.metadata.parents) {

        constructWithSideEffects(current.metadata.parents[i],nodes,mergedNode);

    }

    log(DEBUG_CONSTRUCTION,'Merging ' + JSON.stringify(current) + ' to ' + 
        JSON.stringify(mergedNode));
    mergeWithSideEffects(mergedNode,current);

    // Metadata properties won't inherit.
    // Because they were just inherited, we undo this by just
    // overwriting the inherited property with the exact copies
    // from current node. 

    mergedNode.metadata = current.metadata;

    return mergedNode;

}

function queueNodeLoad (userId,nodeId,singleLevel,parentsOverRide,dieOnError) {

    function rQueueNodeLoad (userId,nodeId,singleLevel,loadBuffer,
                             defBuffer,wholeQueueDef,parentsOverRide) {

        function possiblyAllDone() {

            log(DEBUG_QUEUE,'Maybe load is done.');

            for (var key in loadBuffer) {

                var singleLoadDef = defBuffer[key];

                if (singleLoadDef.state() == "rejected") {

                    log(DEBUG_QUEUE,'Load done and failed');
                    wholeQueueDef.reject({
                        statusText:'node not found.\n',
                        status:404
                    });

                    return;

                } else if (singleLoadDef.state() == "resolved") {

                    ;

                } else { // == "pending"

                    return;

                }

            }

            log(DEBUG_QUEUE,'Yes, loaded ' +
                JSON.stringify(Object.keys(loadBuffer)));
            // if we got this far, all is done.
            wholeQueueDef.resolve(loadBuffer);

        }

        function singleLoadDone(data) {

            if (parentsOverRide !== undefined) {

                data.metadata.parents = parentsOverRide;

            }

            loadBuffer[nodeId] = data;

            if (!singleLevel) {

                if (typeof data.metadata !== 'object') {

                    log(true,'Node has no metadata property!');
                    log(true,JSON.stringify(data));
                    wholeQueueDef.reject({
                        statusText: 'invalid data encountered',
                        status: 500
                    });

                } else {

                    queueMoreLoads(data.metadata.parents);

                }

            }

            possiblyAllDone();
            // BUG? check when alldone should be called

        }

        function singleLoadFailed(err) {

            log(DEBUG_QUEUE,'Load failed: ' + JSON.stringify(err));

            if (parentsOverRide !== undefined) {

                // This happens during creation of a new node.
                // We need to recreate deferred and resolve it.
                // This is all a bit messy, maybe a rewrite needed.

                loadBuffer[nodeId] = undefined;
                defBuffer[nodeId] = $.Deferred().resolve();

                queueMoreLoads(parentsOverRide);

            }

            if (err.status == 404) {

                possiblyAllDone();

            } else {

                wholeQueueDef.reject(err);

            }

        }

        function queueMoreLoads(nodeIds) {

            for (var i in nodeIds) {

                var nodeId = nodeIds[i];
                rQueueNodeLoad(userId,nodeId,singleLevel,loadBuffer,
                            defBuffer,wholeQueueDef);

            }

        }

        log(DEBUG_QUEUE,'Queuing load ' + nodeId);
        // Only load a node once.

        if (loadBuffer[nodeId] !== undefined) return;

        var singleLoadDef = getSingleLevelNode(userId,nodeId);
        defBuffer[nodeId] = singleLoadDef;
        loadBuffer[nodeId] = {};

        singleLoadDef.fail(singleLoadFailed);
        singleLoadDef.done(singleLoadDone);

    }

    var wholeQueueDef = $.Deferred();
    rQueueNodeLoad (userId,nodeId,singleLevel,{},{},
                    wholeQueueDef,parentsOverRide);

    return wholeQueueDef;

}

function getUrl (nodeId) {

    var suffix = conf.db;

    if (nodeId !== undefined) suffix += '/' + nodeId;

    return conf.couchUrl + '/' + suffix;

}

function getViewUrl (view) {

    return getUrl('_design/catconf/_view/' + view);

}

function listNodes (req,res) {

    function listLoaded(ob) {

        log(DEBUG_LIST,'List loaded');

        if ((ob instanceof Object) && (ob.rows instanceof Array)) {

            var response = ob.rows.map(function (x) {return x.id;});
            res.send(response);

        } else {

            res.send({},500);

        }

    }
    
    function listFail (err) {

        log(DEBUG_LIST,'List load failed: ' + JSON.stringify(err));
        res.send(err.responseText,err.status || 500);

    }

    var params = undefined

    if (req.query['domains'] !== undefined) {

        view = 'domains';

    } else if (req.query['users'] !== undefined) {

        view = 'users';

    } else if (req.query['in-domain']) {

        view = 'in-domain';
        params = encodeURIComponent(req.query['in-domain']);

    } else {

        view = 'all';

    }

    getView(view,params).
        done(listLoaded).
        fail(listFail);
}

function getView(view,params) {

    var body = {};

    if (params) { body = {keys : [params] } };

    var options =  {
        type : 'POST',
        url : getViewUrl(view),
        contentType: "application/json",
        data: JSON.stringify(body),
        dataFilter: parseDBJSON,
        processData: false
    };
    log(DEBUG_VIEW,options);

    return $.ajax( options );

}

function getNode (req,res) {

    var nodeId = req.params.id;
    var singleLevel = req.query['single-level'] !== undefined;
    var rawData = req.query['raw'] !== undefined;

    log(DEBUG_GET,'Start getting node ' + nodeId);
    queueNodeLoad(getUserId(req),nodeId,singleLevel).
        done(getDataLoaded).
        fail(getFail);

    function getFail (err) {

        log(DEBUG_GET,'Node loading failed');
        res.send(err.statusText,err.status);

    };

    function getDataLoaded (nodesLoaded) {

        // All authentication is already done in getSingleLevelNode

        log(DEBUG_CONSTRUCTION,'Start constructing node ' + nodeId);
        var merged = constructWithSideEffects(nodeId,nodesLoaded,{});
        log(DEBUG_CONSTRUCTION,'Constructed ' + JSON.stringify(merged));
        merged.metadata.nodeId = merged._id;

        if (!rawData) {

            for (var key in merged) {

                if ((typeof(key) == 'string') && (key[0] == '_')) {

                    delete merged[key];

                }

            }

        }

        res.send(merged);
    }

}

function deleteNode (req,res) {

    var nodeId = req.params.id;
    var oldNode;
    var children = [];

    function deleteFail (err) {

        log(DEBUG_DELETE,JSON.stringify(err));
        log(DEBUG_DELETE, 'Delete failed ' + err.status||500 + ' ' + err.statusText);
        res.send(err.statusText,err.status||500);

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

    log (DEBUG_DELETE,'Attempting to delete ' + nodeId);
    getSingleLevelNode ( getUserId(req), nodeId ).
        done(deleteNodeLoaded).
        fail(deleteFail);

}

function putNode (req,res) {

    // TODO: Implement put queue to get rid of race conditions

    var newNode = req.body;
    var nodeId = req.params.id;
    var nodes;
    var singleLevel = req.query['single-level'] !== undefined;

    log(DEBUG_PUT,'Start writing node '+nodeId);
    var error = validateNodeForm(newNode,nodeId);

    if (error) {

        validationFail(error);

    } else {

        log(DEBUG_PUT,'Node validated ok');
        queueNodeLoad (getUserId(req),nodeId,singleLevel,
                        newNode.metadata.parents,true).
            done(putDataLoaded).
            fail(putDataLoadFailed);

    }

    function reduceWithSideEffects (nodeId,node,nodes) {

        // first construct a version of node with inherited properties only
        var stubNode = { metadata: {parents : node.parents }};
        nodes[nodeId] = stubNode;
        var unmergable = constructWithSideEffects(nodeId,nodes,{});

        // preserve special properties
        delete unmergable.metadata;

        recursiveUnmergeWithSideEffects(node, unmergable);

        return node;

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

        log(DEBUG_PUT, 'Put failed: ' + err.statusText + '(' +
            (err.status||500) + ')');
        log(DEBUG,JSON.stringify(err));
        res.send(err.statusText,err.status||500);

    }

    function validationFail (msg) { putFail({statusText: msg, status:400}); }

    function putOk (data) {

        log(DEBUG_PUT,'Node written succesfully');
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

            var singleLevelNode = reduceWithSideEffects(nodeId,newNode,nodes);

            var auth = singleLevelNode.metadata.authorization;

            if ((typeof auth == 'object') && (auth.type == 'password')) {

                transformAuthorizationAndWrite(singleLevelNode);

            } else {

                log(DEBUG_PUT,'Not transforming authorization');
                writeFinally(singleLevelNode);

            }

        }

    }

    function transformAuthorizationAndWrite(singleLevelNode) {

        log(DEBUG_PUT,'Start transforming node authorization');
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
                        log(DEBUG_PUT,'Transformed authorization to ' + JSON.stringify(auth));
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

        log(DEBUG_PUT,'Finally writing node "' + nodeId + '"');
        log(DEBUG_PUT,options.data);

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
            log(DEBUG_PUT,'Authorizing rewrite of existing node.');

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

            log(DEBUG_PUT,'Authorizing creation of a new node');
            validateAndTransform();

        }

    }

}

function getSession (req,res) {

    if (req.user) {

        res.send(200,{'user':req.user,'refresh':3600000});

    } else {

        res.send(404,'No session.');

    }

}

function deleteSession (req,res) {

    if (req.user) {

        req.session.destroy(
            function () {res.send(200,{'user':null});}
        );

    } else {

        res.send(404,'No session.');

    }
}

function createSession (req,res) {

    if (req.user) {

        // TODO: session timeout?
        req.session.user = req.user;
        getSession(req,res);

    } else {

        res.send('Forbidden',403);

    }

}

function main() {

    app.use(express.bodyParser());
    app.use(express.cookieParser(conf.cookieSecret));
    app.use(express.session({
        key: "catconf.sid",
        secret:conf.cookieSecret,
        cookie: { maxAge: 14400000 } // session lasts for 4 hours
    }));
    app.use(catconfAuthentication);

    app.get('/session',getSession);
    app.post('/session',createSession);
    app.delete('/session',deleteSession);

    app.get('/node',listNodes);
    app.get('/node/:id',getNode);
    app.put('/node/:id',putNode);
    app.delete('/node/:id',deleteNode);

    app.listen(conf.catconfPort);
    log(true,'listening on port ' + conf.catconfPort);

    if (conf.testConfiguration) {

        // activate special killing API to make coverage reports possible
        app.post('/kill', function (req,res) {

            res.send('ok.\n');
            res.end();
            process.exit(0);

        });

    }

}

if (require.main === module) {
    
    main();

}

