var conf = require("../conf");
var libcatconf = require("../libcatconf");
var utils = require("./utils");
var data = require("./data");

libcatconf.configure({ urlBase:conf.catconfUrl, });

describe('DELETE', function() {    

    beforeEach(utils.initializeTestDBBeforeTest);

    it('domain fails by unauthenticated', function (done) {
        deleteNodeForbidden(done,{},'dummydomain');
    });
    it('domain fails by authenticated non-admin', function (done) {
        deleteNodeForbidden(done,utils.getCreds(data.testUser1),'dummydomain');
    });
    it('domain succeeds by an authenticated admin',function (done) {
        deleteNode(done,utils.getCreds(data.testUser2),'dummydomain');
    });
    it('domain with children fails',function (done) {
        deleteNodeForbidden(done,utils.getCreds(data.testUser1),'dummydomain');
    });
    it('user node fails by unauthenticated',function (done) {
        deleteNodeForbidden(done,{},'testuser2');
    });
    it('user node succeeds by correct authentication',function (done) {
        deleteNode(done,utils.getCreds(data.testUser1),'testuser1');
    });
    it('someone else\'s user node fails',function (done) {
        deleteNodeForbidden(done,utils.getCreds(data.testUser2),'testuser1');
    });
    it('makes node disappear',function (done) {
        deleteNode(nextStep,utils.getCreds(data.testUser2),'testdomain');
        function nextStep() {
            utils.nodeDoesNotExist(done,utils.getCreds(data.testUser1),
                'testdomain');
        }
    });


});


function deleteNode (done,creds, nodeId) {
    libcatconf.deleteNode(nodeId,{creds:creds}).
        done(function(data){done();}).
        fail(function (err) {done(utils.handleError(err));});
}

function deleteNodeForbidden (done,creds,nodeId) {
    libcatconf.deleteNode(nodeId,{creds:creds}).
        done(function(data) { done(new Error(nodeId + ' deleted')); }).
        fail(function(err) {

            if ((err.status == 401) || (err.status == 403)) done();
            else done(new Error('Wrong error: ' + err.status));

        });
}

