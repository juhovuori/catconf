var conf = require("../conf");
var libcatconf = require("../libcatconf");
var data = require("./data");
var utils = require("./utils");

libcatconf.configure({ urlBase:conf.catconfUrl, });

describe('PUT', function() {    

    beforeEach(utils.initializeTestDBBeforeTest);


    it('created object does not contain properties inherited from parents',
        function(done) {

            var creds = utils.getCreds(data.testUser2)
            libcatconf.getNode(utils.getNodeId(data.testDomain))
                      .done(domainRead)
                      .fail(fail);

            function domainRead (node) {

                if (node.setting1 !== true) {

                    return done(new Error('Wrong "setting1".'));

                }

                putNode(childWritten, creds, data.testDomainChild);

            }

            function childWritten (err) {
                if (err) return fail(err);
                libcatconf.getNode( utils.getNodeId(data.testDomainChild))
                    .done(childRead)
                    .fail(fail);
            }

            function childRead (node) {

                if (node.setting2 !== true) {
                    var msg = 'Read wrong node early ' + JSON.stringify(node);
                    return done(new Error(msg));
                }
                putNode(childWrittenAgain, creds, node);

            }

            function childWrittenAgain (err) {
                if (err) return fail(err);
                libcatconf.getNode( utils.getNodeId(data.testDomainChild),
                                    {singleLevel:true} )
                    .done(childReadAgain)
                    .fail(fail);
            }

            function childReadAgain (node) {

                if ((Object.keys(node).length != 2) ||
                    (node.setting2 !== true)) {
                        var msg = 'Read wrong node ' + JSON.stringify(node);
                        return done(new Error(msg));
                }
                
                done();

            }

            function fail (err) {
                var msg = err.responseText || err;
                done (new Error("Parent load failed: " + msg));
            }

        });

    it('new domain succeeds by unauthenticated',function(done) {
        putNode (done,{},newDomain);
    });

    it('new user succeeds by unauthenticated',function(done) {
        putNode (done,{},newUser);
    });

    it('existing user node fails by unauthenticated',function(done) {
        putNodeForbidden (done,{},data.testUser1);
    });

    it('existing user node fails by another user',function(done) {
        putNodeForbidden (done,utils.getCreds(data.testUser2),data.testUser1);
    });

    it('existing user node succeeds by correct user',function(done) {
        putNode (done,utils.getCreds(data.testUser1),data.testUser1);
    });

    it('existing domain fails by unauthenticated',function(done) {
        putNodeForbidden (done,{},data.testDomain);
    });

    it('existing domain fails by non-admin',function(done) {
        putNodeForbidden (done,utils.getCreds(data.testUser1),data.testDomain);
    });

    it('existing domain succeeds by admin',function(done) {
        putNode (done,utils.getCreds(data.testUser2),data.testDomain);
    });

    it('non-object fails',function(done) {
        putNodeFails (done,{creds:utils.getCreds(data.testUser1),nodeId:"something"},"liirum",[400]);
    });

    it('object with no metadata fails',function(done) {
        putNodeFails (done,{creds:utils.getCreds(data.testUser1),nodeId:"something"},
            data.testUser1NoMetadata,[400]);
    });

    it('object with invalid nodeId fails',function(done) {
        putNodeFails (done,{creds:utils.getCreds(data.testUser1),nodeId:"something"},
            data.testUser1InvalidNodeId,[400]);
    });

    it('object without metadata.nodeId property fails',function(done) {

        putNodeFails(done,{creds:utils.getCreds(data.testUser1),
            nodeId:"something"},data.testUser1NoNodeId,[400]);

    });

    it('object with non-matching nodeId fails',function(done) {
        putNodeFails (done,{creds:utils.getCreds(data.testUser1),nodeId:"something"},
            data.testUser1NoMetadata,[400]);
    });

    it('object with a underscore-property fails',function(done) {
        putNodeFails (done,{creds:utils.getCreds(data.testUser1)},
            data.testUser1UnderscoreProperty,[400]);
    });

    it('object with a non-object authorization fails',function(done) {
        putNodeFails (done,{creds:utils.getCreds(data.testUser1)},
            data.testUser1NonObjectAuthorization,[400]);
    });

    it('object with a bcrypt auth but invalid crypted fails',function(done) {
        putNodeFails (done,{creds:utils.getCreds(data.testUser1)},
            data.testUser1InvalidBcrypt,[400]);
    });

    it('object with a password auth but invalid password fails',function(done) {
        putNodeFails (done,{creds:utils.getCreds(data.testUser1)},
            data.testUser1InvalidPassword,[400]);
    });

    it('object with a invalid authorization type fails',function(done) {
        putNodeFails (done,{creds:utils.getCreds(data.testUser1)},
            data.testUser1InvalidAuthorizationType,[400]);
    });

    it('object that inherits from an user fails',function(done) {
        putNodeForbidden (done,{creds:utils.getCreds(data.testUser1)},
            data.testUser1InheritsFromUser);
    });

    it('object that would create an inheritance loop fails',function(done) {

        var creds = utils.getCreds(data.testUser1)
        putNode (next, creds, data.testDomainLoop1Stage1);

        function next (err) {

            if (err) {

                done (err);

            } else {

                putNode (nextnext, creds, data.testDomainLoop2);

            }

        }

        function nextnext (err) {

            if (err) {

                done (err);

            } else {

                putNodeFails (done, {creds:creds},
                    data.testDomainLoop1Stage2,[400]);

            }

        }

    });

    it('too big node fails',function(done) {

        var myNode = JSON.parse(JSON.stringify(newDomain));

        // construct enough elements so that JSON serialization of the node
        // becomes larger than allowed.
        var nElements = conf.nodeSizeLimit / 7;
        for (;nElements > 0; nElements--) {
            myNode[nElements] = true;
        }
        putNodeFails (done,{},myNode,[400]);

    });

    // TODO: non-array nodeAdmins

    // TODO: non-existing nodeAdmins

    // TODO: either authorization or nodeAdmins must exist

    // TODO: new node must have authorization if old node had it or
    // nodeAdmins if old node had it

    // TODO: all parents must exist

});

function putNode (next,creds,myNode) {

    libcatconf.putNode(myNode,{creds:creds}).
        done(function(data){next();}).
        fail(function (err) {next(utils.handleError(err));});

}

function putNodeForbidden (done,creds,myNode) {

    return putNodeFails (done,{creds:creds},myNode,[401,403]);

}

function putNodeFails (done,options,myNode,codes) {

    libcatconf.putNode(myNode,options).
        done(function(data) {

            done(new Error(data.id + ' created'));

        } ).
        fail(function(err) {

            if (codes.indexOf(err.status) == -1) {

                done(new Error('Wrong error: ' + err.status));

            } else {

                done();

            }

        });

}

var newUser = {
    "metadata": {
        "nodeId": "newuser1",
        "parents": ["fennica"],
        "authorization": {
            "type": "password",
            "password": "koekoe"
        }
    },
    "testsetting1": "true",
};

var newDomain = {
    "metadata": {
        "nodeId": "newdomain",
        "nodeAdmins": ["testuser2"],
        "parents": ["global"]
    },
    "setting1": true
};

