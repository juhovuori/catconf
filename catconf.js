/** @module catconf */

exports.authorizeAgainstNode = authorizeAgainstNode;

var express = require('express');
var app = express();
var conf = require('./conf');
var $ = require('jquery');
var btoa = require('btoa');
var atob = require('atob');
var bcrypt = require('bcrypt');
var log = require('./logging').log;

var package_json = require('./package.json');
var authentication = require('./'+conf.authenticationModule);
var storage = require('./' + conf.storageModule);


/**
 * Return nodeId of the user performing
 * @param req Express.js request object
 */
function getUserId(req) {

    return req.user;

}

function authorizeAgainstNode(node,user,pass) {

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


/**
 * Merge two single-level nodes during inheritance
 */
function mergeWithSideEffects (merged,node) {

    log('construction','Keys to merge: ' +
        JSON.stringify(Object.keys(node)));

    for (var key in node) {

        var nodeT = typeof(node[key]);
        var mergedT = typeof(merged[key]);

        if ((nodeT == 'string') ||
            (nodeT == 'number') ||
            (nodeT == 'boolean') ||
            (nodeT == 'null') ||
            ((nodeT == 'object') && (mergedT != 'object'))) {

            log('construction','Merging key ' + key);
            merged[key] = node[key];

        } else if ((nodeT == 'object') && (mergedT == 'object')) {

            log('construction','Recursively merging key ' + key);
            mergeWithSideEffects(merged[key],node[key]);

        } else {

            log('construction','Not merging key ' + key + ' (' +
                node[key] + ')');

        } // skipping undefineds and functions

    }

}

function constructWithSideEffects (nodeId,nodes,mergedNode,parentsOverRide) {
    // Recursively merge node with its parents
    // nodeId == nodeId to merge to
    // nodes == object of nodes
    // mergedNode == object to write properties to
    // parentsOverRide == use these in construction instead of real ones

    if (!mergedNode) mergedNode = {};
    if (nodes[nodeId] === undefined) {

        // This happens in inheritance loops or diamonds.
        // Things go just fine if we just stop here.
        // Loops might be worth giving an error though.
        return mergedNode;

    }

    var current = nodes[nodeId];
    delete nodes[nodeId];

    for (var i in current.metadata.parents) {

        constructWithSideEffects(current.metadata.parents[i],nodes,mergedNode);

    }

    log('construction','Merging ' + JSON.stringify(current) + ' to ' + 
        JSON.stringify(mergedNode));

    mergeWithSideEffects(mergedNode,current);

    // Metadata properties won't inherit.
    // Because they were just inherited, we undo this by just
    // overwriting the inherited property with the exact copies
    // from current node. 

    mergedNode.metadata = current.metadata;
    log('construction','Merged a new node: ' + JSON.stringify(mergedNode));

    return mergedNode;

}

function queueNodeLoad (userId,nodeId,singleLevel,parentsOverRide,dieOnError) {

    function rQueueNodeLoad (userId,nodeId,singleLevel,loadBuffer,
                             defBuffer,wholeQueueDef,parentsOverRide) {

        function possiblyAllDone() {

            log('queue','Maybe load is done.');

            for (var key in loadBuffer) {

                var singleLoadDef = defBuffer[key];

                if (singleLoadDef.state() == "rejected") {

                    log('queue','Load done and failed');
                    wholeQueueDef.reject({
                        statusText:'node not found.\n',
                        status:404
                    });

                    return;

                } else if (singleLoadDef.state() == "resolved") {

                } else { // == "pending"

                    return;

                }

            }

            log('queue','Yes, loaded ' +
                JSON.stringify(Object.keys(loadBuffer)));
            // if we got this far, all is done.
            wholeQueueDef.resolve(loadBuffer);

        }

        function singleLoadDone(data) {

            if ( (typeof data.metadata.authorization == 'object') &&
                 (data.metadata.nodeId !== userId) ) {
                
                wholeQueueDef.reject({
                    statusText: 'About to read unallowed node.',
                    status:403
                });

                return;

            }

            
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

            log('queue','Load failed: ' + JSON.stringify(err));

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

        log('queue','Queuing load ' + nodeId);
        // Only load a node once.

        if (loadBuffer[nodeId] !== undefined) return;

        var singleLoadDef = storage.getNode(nodeId);
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

function listNodes (req,res) {

    /*jshint sub:true*/    
    
    if (req.query['domains'] !== undefined) {

        storage.listDomainNodes().done(listOk).fail(listFail);

    } else if (req.query['users'] !== undefined) {

        storage.listUserNodes().done(listOk).fail(listFail);

    } else if (req.query['in-domain']) {

        storage.listInDomainNodes(req.query['in-domain'])
            .done(listOk).fail(listFail);

    } else {

        storage.listAllNodes().done(listOk).fail(listFail);

    }


    function listOk(array) {

        log('list','List loaded');
        res.send({"results":array});

    }
    
    function listFail (err) {

        log('list','List load failed: ' + JSON.stringify(err));
        res.send(err.responseText+'\n',err.status || 500);

    }

}

function getNode (req,res) {

    /*jshint sub:true*/    

    var nodeId = req.params.id;
    var singleLevel = req.query['single-level'] !== undefined;
    var rawData = req.query['raw'] !== undefined;

    log('get','Start getting node ' + nodeId);
    queueNodeLoad(getUserId(req),nodeId,singleLevel).
        done(getDataLoaded).
        fail(getFail);

    function getFail (err) {

        log('get','Node loading failed');
        res.send(err.statusText+'\n',err.status);

    }

    function getDataLoaded (nodesLoaded) {

        // All authentication is already done in storage.getNode

        log('construction','Start constructing node ' + nodeId);
        var merged = constructWithSideEffects(nodeId,nodesLoaded);
        log('construction','Constructed ' + JSON.stringify(merged));

        res.send(merged);
    }

}

function deleteNode (req,res) {

    var nodeId = req.params.id;
    var oldNode;

    log ('delete','Attempting to delete ' + nodeId);

    storage.getNode ( nodeId ).
        done(deleteNodeLoaded).
        fail(deleteFail);

    function deleteNodeLoaded (data) {

        oldNode = data;
        storage.listInDomainNodes( nodeId )
            .done( childrenLoaded )
            .fail( deleteFail );

    }

    function childrenLoaded(data) {

        var error = authorizeDelete( getUserId( req ), data );

        if ( error !== undefined ) {

            deleteFail( { status : 403, statusText : error } );

        } else {

            storage.deleteNode( nodeId )
                .done( deleteOk )
                .fail( deleteFail );

        }

    }

    function authorizeDelete (userId,children) {

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

        if (children.length !== 0) {

            // Cannot delete a node that has children
            return "Parent of other nodes cannot be deleted.";

        }

    }

    function deleteFail (err) {

        log('delete',JSON.stringify(err));
        log('delete', 'Delete failed ' + err.status||500 + ' ' + err.statusText);
        res.send(err.statusText+'\n',err.status||500);

    }

    function deleteOk (data) { res.send(data); }

}

function putNode (req,res) {

    // TODO: Implement put queue to get rid of race conditions

    var newNode = req.body;
    var nodeId = req.params.id;
    var nodes;
    var singleLevel = req.query['single-level'] !== undefined;

    log( 'put', 'Start writing node ' + nodeId + ' ' + JSON.stringify(newNode));
    var error = validateNodeForm( newNode, nodeId );

    if (error) {

        validationFail( error );

    } else {

        log( 'put', 'Node validated ok' );
        queueNodeLoad (getUserId( req ), nodeId, singleLevel,
                        newNode.metadata.parents, true).
            done(putDataLoaded).
            fail(putDataLoadFailed);

    }

    function recursiveUnmerge (node,unmergable) {
        // Recursively remove every property in 'unmergable' from 'node'

        var overRidingElements = {};
        var child;

        for (var key in node) {

            if ((typeof(unmergable[key]) == 'object') &&
                (typeof(node[key]) == 'object')) {

                child = recursiveUnmerge(node[key],unmergable[key]);
                if (Object.keys(child).length !== 0) 
                    overRidingElements[key] = child;

            } else if (node[key] != unmergable[key]) {

                overRidingElements[key] = node[key];

            }

        }

        return overRidingElements;

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

        }

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

        if (tooBig(node)) {

            return 'Node too big. Size limit ' + conf.nodeSizeLimit + ' bytes';

        }

    }

    function tooBig(node) {

        // TODO: This should be checked in json parsing middleware.
        // Checking it here results in extra serialization step => slow

        if (conf.nodeSizeLimit === 0) return false;

        if (JSON.stringify(node).length > conf.nodeSizeLimit) return true;

        return false;

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
        nodes[nodeId] = newNode; // loop detection needs this
        log('reduction','Starting reduction with ' + JSON.stringify(nodes));
        log('reduction','nodeId ' + nodeId + ' parents: ' +
            JSON.stringify(((newNode||{}).metadata||{}).parents));
        log('reduction','Node to reduce ' + JSON.stringify(newNode));
        var error = isThereALoopOrMissingParent(nodeId,[]);

        if (error) return validationFail(error);

        // construct a version of node with non-inherited properties only
        for (var i in newNode.metadata.parents) {

            var parentId = newNode.metadata.parents[i];
            var parent = constructWithSideEffects(parentId,nodes,{});
            // preserve special properties
            delete parent.metadata;
            log('reduction','Unmerging ' + JSON.stringify(parent));
            newNode = recursiveUnmerge(newNode, parent);
            log('reduction','Unmerged node into ' + JSON.stringify(newNode));

        }

        log('reduction','Nodes now: ' + JSON.stringify(nodes));
        // transform authorization and write
        var auth = newNode.metadata.authorization;

        if ((typeof auth == 'object') && (auth.type == 'password')) {

            transformAuthorizationAndWrite(newNode);

        } else {

            log('put','Not transforming authorization');
            writeFinally(newNode);

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

                        var auth = { type : 'bcrypt', crypted : crypted };
                        singleLevelNode.metadata.authorization = auth;
                        log('put','Transformed authorization to ' + JSON.stringify(auth));
                        writeFinally(singleLevelNode);

                    }

                });

            }

        });
    }

    function writeFinally (singleLevelNode) {

        log('put','Finally writing node "' + nodeId + '"');

        storage.putNode(singleLevelNode)
            .done( putOk )
            .fail( putFail );

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

/**
 * Returns username and preferred refresh interval for session
 * GET /session
 */
function getSession (req,res) {

    // TODO: write to session storage
    if (req.user) {

        // BUG: does not actually refresh session
        res.send(200,{'user':req.user,'refresh':3600000});

    } else {

        res.send(404,{'user':null,'message':'No session.'});

    }

}

/**
 * Deletes a session. =logout
 * DELETE /session
 */
function deleteSession (req,res) {

    // TODO: write to session storage
    if (req.user) {

        req.session.destroy(
            function () {res.send(200,{'user':null});}
        );

    } else {

        res.send(404,'No session.\n');

    }
}

/**
 * Creates a session. =login
 * POST /session
 */
function createSession (req,res) {

    // TODO: write to session storage
    if (req.user) {

        // TODO: session timeout?
        req.session.user = req.user;
        getSession(req,res);

    } else {

        res.send('Forbidden\n',403);

    }

}

/**
 * CORS middleware
 */
function CORS(req, res, next) {

    var oneof = false;
    if(req.headers.origin) {
        res.header('Access-Control-Allow-Origin', req.headers.origin);
        oneof = true;
    }
    if(req.headers['access-control-request-method']) {
        res.header('Access-Control-Allow-Methods', req.headers['access-control-request-method']);
        oneof = true;
    }
    if(req.headers['access-control-request-headers']) {
        res.header('Access-Control-Allow-Headers', req.headers['access-control-request-headers']);
        oneof = true;
    }
    if(oneof) {
        res.header('Access-Control-Max-Age', 60 * 60 * 24 * 365);
        res.header('Access-Control-Allow-Credentials', true);
    }

    // intercept OPTIONS method
    if (oneof && req.method == 'OPTIONS') {
        res.send(200);
    }
    else {
        next();
    }
}

function myRequestMiddleware(req, res, next) {

    log('request',"REQUEST: " + req.method + " " + req.path);
    next();

}

function bodyParserErrorMiddleware(err, req, res, next) {

    // This is here to handle invalid json in request body.

    if (false) {

        res.send(err.status,err.message);

    } else {

        next();

    }

}



/**
 * Boot server.
 * First setup express middleware, then setup routing and finally
 * start listening to a port
 */
function main() {

    app.use(myRequestMiddleware);
    app.use(express.cookieParser(conf.cookieSecret));
    app.use(express.session({
        key: "catconf.sid",
        secret:conf.cookieSecret,
        cookie: { maxAge: 14400000 } // session lasts for 4 hours
    }));
    app.use(CORS);
    app.use(express.bodyParser());
    app.use(bodyParserErrorMiddleware);
    app.use(authentication);

    app.get('/session',getSession);
    app.post('/session',createSession);
    app.delete('/session',deleteSession);

    app.get('/node',listNodes);
    app.get('/node/:id',getNode);
    app.put('/node/:id',putNode);
    app.delete('/node/:id',deleteNode);

    /** When running under test configuration,
     * activate a special killing API to make coverage reports possible
     */

    if (conf.testConfiguration) {

        app.post('/kill', function (req,res) {

            res.send('ok.\n');
            res.end();
            process.exit(0);

        });

    }

    app.listen(conf.catconfPort);

    log('startup','catconf ' + package_json.version);
    log('startup','listening on port ' + conf.catconfPort);

}

if (require.main === module) {
    
    main();

}

