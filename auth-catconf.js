#!/usr/bin/env node

var conf = require('./conf');
var catconf = require('./catconf');
var atob = require('atob');

var log = catconf.log;
console.log(JSON.stringify(Object.keys(catconf)));
var getSingleLevelNode = catconf.getSingleLevelNode;
var authorizeAgainstNode = catconf.authorizeAgainstNode;
var DEBUG_AUTH = catconf.DEBUG_AUTH;
var DEBUG = catconf.DEBUG;

function authentication(req, res, next) {

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


module.exports = authentication;
