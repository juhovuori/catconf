var conf = require("../conf");
var libcatconf = require("../libcatconf");
var utils = require("./utils");
var data = require("./data");

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

        libcatconf.login(utils.getCreds(data.testUser1)).
            fail( function () { done(utils.handleError(err)); } ).
            done( function (res,stat,jqxhr) {

                var cookie = jqxhr.getResponseHeader('set-cookie')
                cookie = cookie.substring(0,cookie.indexOf('; '))
                cookieCreds = {cookie: cookie};
                done();
                
            } );

    });

    it('- (2) logged in user can read his node ', function (done) {

        utils.nodeEquals (done,
            cookieCreds,
            utils.getNodeId(data.testUser1),
            data.testUser1Full);

    });

    it ('- (3) user can logout', function (done) {

        libcatconf.logout(cookieCreds).
            done( function () { done(); } ).
            fail( function () { done(utils.handleError(err)); } );

    });

    it ('- (4) logged out user cannot read his node', function (done) {

        utils.nodeLoadForbidden(
            done,
            cookieCreds,
            utils.getNodeId(data.testUser1));

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

