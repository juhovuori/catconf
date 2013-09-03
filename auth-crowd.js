/** @module auth-crowd */

var conf = require('./conf');
var catconf = require('./catconf');
var atob = require('atob');
var bcrypt = require('bcrypt');
var libcatconf = require('./libcatconf');
var AtlassianCrowd = require('atlassian-crowd');
    
var log = require('./logging').log;

var logI = 0;

/**
 * Catconf authentication middleware
 */
function authentication(req, res, next) {
    
    var crowd = new AtlassianCrowd(conf.crowdConfig);
    var crowd_token = req.cookies[conf.crowdConfig.cookieName];
    log('auth', "Starting crowd authentication with token " + crowd_token);

    if (crowd_token !== undefined) {
      
        crowd.session.authenticate(crowd_token, '128.214.71.150', function(err, res) {
            if (err) {
            
                log('auth', "Authentication failed: " + err.message);
                unauthorized(err.message);
                return;
            }
            
            log('auth', "User successfully authenticated as: " + res.user.name);
            
            req.user = res.user.name;
            next();
           
        });

    } else {
        // no cookie set!
        unauthorized("SSO cookie missing: " + conf.crowdConfig.cookieName);
    }
    
    function unauthorized (msg) {
        res.statusCode = 401;
        if (msg === undefined) msg = 'Unauthorized';
        res.end(msg);
        // don't call next here, request handling stops.
    }
}

module.exports = authentication;

