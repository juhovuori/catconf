var conf = require("../conf");
var libcatconf = require("../libcatconf");
var utils = require("./utils");
var data = require("./data");

libcatconf.configure({ urlBase:conf.catconfUrl, });

var expUsers = ["test","testuser1","testuser2","juho"];
var expDomains = ["dummydomain","fennica","global","libtest"];
var expUsersAndDomains = expUsers.concat(expDomains);
var expDomainMembers = ["test"];

describe('list', function() {    

    beforeEach(utils.initializeTestDBBeforeTest);

    it('returns proper error when couchdb fails wierdly',function (done) {

        // Just delete the whole database
        var dbUrl = conf.couchUrl+'/'+conf.db+'/';
        var headers = { 'Authorization': conf.authorization };
        $.ajax({ url:dbUrl, type:'DELETE', headers:headers }).
            done(step2).
            fail(function (err) { done(utils.handleError(err)); } );


        function step2 () {

            // wait for it to complete
            setTimeout(step3,500);

        }
        function step3 () {

            // and then try listing, hehe
            listFail( done, libcatconf.getDomains, [404] );

        }

    });

    it('users returns users',function (done) {

        listOk(done,libcatconf.getUsers,expUsers);

    });

    it('domainsandusers returns domainsandusers',function (done) {

        listOk(done,libcatconf.getUsersAndDomains,expUsersAndDomains);

    });

    it('domains returns domains',function (done) {

        listOk(done,libcatconf.getDomains,expDomains);

    });

    it('domainmembers returns domainmembers',function (done) {

        listOk(
            done,
            function () { return libcatconf.getDomainMembers('libtest');},
            expDomainMembers);

    });

});

function listOk (done, method, expected) {

    method().
        done(checkResults).
        fail(function (err) { done(utils.handleError(err));});

    function checkResults(data) {

        data = data.sort();
        expected = expected.sort();

        if (data.length != expected.length) return myError();

        for (var i in data) {

            if (data[i] != expected[i]) {

                return myError();

            }

        }

        done();

        function myError () {

            done(new Error("Expected " + JSON.stringify(expected) +
                    " got " + JSON.stringify(data)));

        }

    }
}



function listFail (done, method, acceptedFailures) {

    method().
        done(function () { done("Error: listing succeeded."); } ).
        fail(function (err) { 
            if (acceptedFailures.indexOf(err.status) != -1) done();
            else done(new Error("Wrong error: " + err.status));

        });

}



