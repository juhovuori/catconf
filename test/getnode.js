var _ = require("underscore");
var conf = require("../conf");
var libcatconf = require("../libcatconf");
var utils = require("./utils");
var data = require("./data");

libcatconf.configure({ urlBase:conf.catconfUrl, });

describe('GET', function() {    

    beforeEach(utils.initializeTestDBBeforeTest);

    it('user fails for unauthenticated',function (done) {
        utils.nodeLoadForbidden(done,{}, utils.getNodeId(data.testUser1));
    });
    it('user fails for wrong users',function (done) {
        utils.nodeLoadForbidden(done,
                          utils.getCreds(data.testUser2),
                          utils.getNodeId(data.testUser1));
    });
    it('user ok for correct user',function (done) {
        utils.nodeEquals (done,
                        utils.getCreds(data.testUser1),
                        utils.getNodeId(data.testUser1),
                        data.testUser1Full);
    });
    it('user with diamond inheritance turns out fine',function (done) {
        utils.nodeEquals (done,
                        utils.getCreds(data.testUser3),
                        utils.getNodeId(data.testUser3),
                        data.testUser3Full);
    });
    it('domain ok for unauthenticated',function (done) {
        utils.nodeEquals (done, {}, utils.getNodeId(data.testDomain),
                    data.testDomainFull);
    });
    it('domain ok for some authenticated user',function (done) {
        utils.nodeEquals (done, utils.getCreds(data.testUser2),
                    utils.getNodeId(data.testDomain), data.testDomainFull);
    });
    
});

