function DemoCtrl($scope) {
    $scope.conf = [];
    $scope.loggedIn = false;
    $scope.message = ""
    
    $scope.showConf = function () {

        function loginOk (data) {
            $scope.$apply(function () {
                console.log('login: ' + JSON.stringify(data));
                $scope.myCreds = data;
                $scope.message = "OK " + JSON.stringify( data );
                $scope.loggedIn = true;
                $scope.passWord = "";
                libcatconf.getMyNode().
                    done(myNodeLoaded).
                    fail(myNodeLoadFail);

                libcatconf.getDomains().
                    done(myDomainsLoaded).
                    fail(myDomainsLoadFail);
            });
        }

        function myNodeLoaded (conf) {
            $scope.$apply(function () {
                $scope.fullConf = conf;
                $scope.conf = []
                var i = 0;
                for (var k in conf) {
                    if ( ! libcatconf.isSpecialProperty(k) )
                    $scope.conf[i++]={key:k,value:conf[k]};
                }
            });
        }

        function myNodeLoadFail (err) {
            $scope.$apply(function () {
                $scope.message = "Conf fetch error "+ err.status + ": " +
                                err.statusText ;
            });
        }

        function myDomainsLoaded (data) {
            $scope.$apply(function () {
                $scope.domains = data;
            });
        }
        function myDomainsLoadFail (err) {
            $scope.$apply(function () {
                $scope.domains ='err: ' + err;
            });
        }

        function loginFail (data) {
            $scope.$apply(function () {
                if (data.status == 401) {
                    $scope.message = "Username / password wrong.";
                } else {
                    $scope.message = "Error " + data.status;
                }
            });
        };

        $scope.message = "authenticating in..."
        libcatconf.login({ user:$scope.userName, pass:$scope.passWord }).
            done(loginOk).
            fail(loginFail);

    };

    $scope.saveConf = function (x) {

        function saveOk(data) {
            $scope.$apply(function () {
                $scope.message = "Conf saved " + JSON.stringify(data)
            });
        }

        function saveFail(err) {
            $scope.$apply(function () {
                $scope.message = "Save error " + JSON.stringify(err);
            });
        }

        for (var i in $scope.conf) {
            var entry = $scope.conf[i]
            $scope.fullConf [entry.key] = entry.value;
        }

        libcatconf.putNode($scope.fullConf).
            done(saveOk).
            fail(saveFail);

    };

    $scope.signup = function () {

        $scope.loggedIn = true;
        $scope.userName = "new-" + $scope.userName + '/' + $scope.passWord;
        $scope.passWord = "";

    };

    $scope.logout = function () {

        libcatconf.logout();
        $scope.loggedIn = false;
        $scope.myCreds = undefined;

    };

    /* debug:
    */
    $(document).ready(function(){
        $scope.userName = "juho";
        $scope.passWord = "koe";
        $("#ok-button").click()
    });
}

libcatconf.configure({
    urlBase:'/catconf/',
});

