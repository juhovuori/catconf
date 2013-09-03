var conf = require("../conf");
var libcatconf = require("../libcatconf");
var $ = require("jquery");
var utils = require("./utils");
var data = require("./data");
var http = require("http");
var _ = require("underscore");

libcatconf.configure({ urlBase:conf.catconfUrl, });

describe('session', function() {

    var cookieCreds; // Save cookie data here to be used between tests

    beforeEach(utils.initializeTestDBBeforeTest);

    it('- correct password returns ok', function (done) {
    
        utils.nodeEquals(done,
            utils.getCreds(data.testUser1),
            utils.getNodeId(data.testUser1) )

    });

    it('- correct password with bcrypted password ok', function (done) {
    
        utils.nodeEquals(done,
            {"user":"juho","pass":"koe"},
            utils.getNodeId(data.testJuho) )

    });

    it('- wrong password returns error', function (done) {

        var creds = utils.getWrongCreds(data.testUser1);
        getNodeForbidden(done,creds,utils.getNodeId(data.testUser1));

    });

    it('- authenticating with a non-user node fails', function (done) {
    
        var creds = { user: utils.getNodeId(data.testDomain),pass: '...'};
        getNodeForbidden(done,creds,utils.getNodeId(data.testDomain));

    });

    it('- invalid authorization header 1 fails', function (done) {

        var creds = { 'authorization': 'xxx'};
        getNodeForbidden(done,creds,utils.getNodeId(data.testDomain));

    });

    it('- invalid authorization header 2 fails', function (done) {

        var creds = { 'authorization': 'Basic ' + btoa(':')};
        getNodeForbidden(done,creds,utils.getNodeId(data.testDomain));

    });

    it('- (1) user can login ', function (done) {

        myLogin(utils.getCreds(data.testUser1)).
            fail( function (err) { done(utils.handleError(err)); } ).
            done( function (response) {

                var cookie = response.headers['set-cookie'][0];
                cookie = cookie.substring(0,cookie.indexOf('; '));
                cookieCreds = {cookie: cookie};
                done();
                
            } );

    });

    it('- (2) logged in user can read his node ', function (done) {

        myGetNode( utils.getNodeId(data.testUser1), {creds:cookieCreds} )
            .done( function () { done(); } )
            .fail( function (err) { done(utils.handleError(err)); } );

    });

    it ('- (3) user can logout', function (done) {

        myLogout(cookieCreds)
            .done( function () { done(); } )
            .fail( function (err) { done(utils.handleError(err)); } );

    });

    it ('- (4) logged out user cannot read his node', function (done) {

        var nodeId = utils.getNodeId(data.testUser1);
        myGetNode( nodeId, {creds:cookieCreds} )
            .done(function(data){console.log(data);done(new Error(nodeId + ' loaded'));})
            .fail(function(err){

                if ((err.status == 401) || (err.status == 403)) done();
                else done(new Error('Wrong error: ' + err.status));

            });

    });

    it('- password changing with HTTP authentication', function (done) {
    
        var node = data.testUser1;
        var nodeId = utils.getNodeId(node);
        var creds = utils.getCreds(node);
        var newNode = JSON.parse(JSON.stringify(node));
        newNode.metadata.authorization = data.testUser1Auth2;
        var newCreds = utils.getCreds(newNode);
        libcatconf.getNode( nodeId, {creds:creds} )
            .done(changePassword)
            .fail(function(err) {done(err);});

        function changePassword() {
            libcatconf.putNode(newNode,{creds:creds})
                .done(failToReadNewNode)
                .fail(function(err) {done(err);});
        }

        function failToReadNewNode() {
            libcatconf.getNode(nodeId,{creds:creds})
                .done(function(node) {
                    console.log(node);
                    done( new Error(nodeId + ' loaded'));
                })
                .fail(function(err) {
                    if (err.status == 401) readNewNode();
                    else done(new Error('Wrong error: ' + err.status));
                });
        }

        function readNewNode() {
            libcatconf.getNode(nodeId,{creds:newCreds})
                .done(function() {done();})
                .fail(function(err) {done(err);});
        }

    });

});

function getNodeForbidden(next,creds,nodeId) {

    libcatconf.getNode(nodeId,{creds:creds}).
        done(function(data){next(new Error(nodeId + ' loaded'));}).
        fail(function(err){

            if ((err.status = 401) || (err.status = 403)) next();
            else next(new Error('Wrong error: ' + err.status));

        });

}

function myRequest(options) {

    var def = $.Deferred();

    var req = http.request(options, function (res) {

        var data = []

        res.on('data', function (chunk) {

            data.push(chunk);

        });

        res.on('end', function () {

            var options = {
                headers: res.headers,
                status: res.statusCode,
                data: data.join('')
            };

            if (options.status == 200) {

                def.resolve(options);

            } else {

                def.reject(options);

            }

        });

    });

    req.on('error',function (e) { def.reject(e); });

    req.end();

    return def;

};

/**
 * Similar to libcatconf.login, but we need a custom version, jquery
 * cannot handle cookies for testing purposes
 */
function myLogin(creds) {

    var options = {
        hostname: 'localhost',
        port: conf.catconfPort,
        path: '/session',
        method: 'POST',
        headers: libcatconf.getAuthHeaders(creds)
    }

    return myRequest(options);

}

/**
 * Similar to libcatconf.login, but we need a custom version, jquery
 * cannot handle cookies for testing purposes
 */
function myLogout(creds) {

    var options = {
        hostname: 'localhost',
        port: conf.catconfPort,
        path: '/session',
        method: 'DELETE',
        headers: libcatconf.getAuthHeaders(creds)
    }

    return myRequest(options);

}

/**
 * Similar to libcatconf.getNode, but we need a custom version, jquery
 * cannot handle cookies for testing purposes
 */
function myGetNode (nodeId,opts) {

    var options = {
        hostname: 'localhost',
        port: conf.catconfPort,
        path: '/node/' + nodeId,
        method: 'GET',
        query: opts.singleLevel ? '?single-level=1' :'',
        headers: libcatconf.getAuthHeaders(opts.creds)
    }

    return myRequest (options);

}

