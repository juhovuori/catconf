/**
 * Needs jquery.
 * Can be required with commonjs or require.js
 */


(function() {

    var conf = {};
    var sessionRefreshTimeout = undefined;

    function getUrl (suffix) { return conf.urlBase + suffix; }

    function getAuthHeaders (creds) {

        if (creds && creds.user && creds.pass) {

            return {
                'Authorization':
                'Basic ' + btoa(creds.user + ':' + creds.pass)
            };

        } else if (creds && creds.cookie) {

            // For testing purposes, sending a custom cookie is supported
            // This does not work on standard browsers

            return { 'Cookie': creds.cookie};

        } else if (creds && creds.authorization) {
            
            // For testing purposes, sending a custom authorization
            // header is supported.

            return {'Authorization': creds.authorization};

        } else {

            return {};

        }

    }

    function clearSessionRefresh(data) {

        if (sessionRefreshTimeout) {
            clearTimeout(sessionRefreshTimeout);
            sessionRefreshTimeout = undefined;
        }

    }

    function setSessionRefresh(data) {

        sessionRefreshTimeout = setTimeout(refreshSession,data.refresh);

    }

    function refreshSession(data) {

        return $.ajax({
            url: getUrl('session')
        }).done(setSessionRefresh);

    }

    var libcatconf = {

        getAuthHeaders : getAuthHeaders,

        /** return an array of user and domain nodeIds */
        getUsersAndDomains : function (options) {

            if (options === undefined) options = {};
            var headers = getAuthHeaders(options.creds);
            return $.ajax({
                headers:headers,
                url: getUrl('node')
            });

        },

        getUsers : function (options) {

            if (options === undefined) options = {};
            var headers = getAuthHeaders(options.creds);
            return $.ajax({
                headers:headers,
                url: getUrl('node?users=1')
            });

        },

        getDomainMembers : function (domain,options) {

            if (options === undefined) options = {};
            var headers = getAuthHeaders(options.creds);
            return $.ajax({
                headers: headers,
                url: getUrl('node?in-domain=' + encodeURIComponent(domain))
            });

        },

        getDomains : function (options) {

            if (options === undefined) options = {};
            var headers = getAuthHeaders(options.creds);
            return $.ajax({
                headers: headers,
                url: getUrl('node?domains=1')
            });

        },

        putNode : function (node,options) {

            if (options === undefined) options = {};
            var headers = getAuthHeaders(options.creds);
            var query = options.singleLevel ? '?single-level=1' :'';
            var nodeId = options.nodeId || node.metadata.nodeId;
            headers['Content-Type'] = 'application/json';
            return $.ajax({
                url : getUrl('node/'+nodeId+query),
                type : 'PUT',
                headers : headers,
                processData: false,
                data : JSON.stringify(node)
            });

        },

        deleteNode : function (nodeId,options) {

            if (options === undefined) options = {};
            var headers = getAuthHeaders(options.creds);
            return $.ajax({ 
                type : 'DELETE',
                headers : headers,
                url:getUrl('node/'+nodeId)
            });

        },

        getNode : function (nodeId,options) {

            if (options === undefined) options = {};
            var headers = getAuthHeaders(options.creds);
            var query = options.singleLevel ? '?single-level=1' :'';
            return $.ajax({
                headers : headers,
                url:getUrl('node/'+nodeId+query)
                });

        },

        getMyNode : function (options) {

            if (options === undefined) options = {};
            var headers = getAuthHeaders(options.creds);
            var nodeId = libcatconf.getUserName(options.creds);
            var def = $.Deferred();

            if (nodeId) {
                
                return libcatconf.getNode(nodeId,options);

            } else {

                $.ajax({ headers : headers, url:getUrl('session') }).
                    done(gotMySession).
                    fail(failGetMyNode);
                return def;

            }

            function gotMySession (data) {

                nodeId = data.user;
                return libcatconf.getNode(nodeId,options).
                    done(gotMyNode).
                    fail(failGetMyNode);

            }

            function gotMyNode (data) { def.resolve(data); }
            function failGetMyNode (err) { def.reject(err); }

        },

        login : function (creds) {

            var headers = getAuthHeaders(creds);
            return $.ajax({
                url:getUrl('session'),
                type:'POST',
                headers: headers,
            }).done(setSessionRefresh);

        },

        logout : function (creds) {

            var headers = getAuthHeaders(creds);
            clearSessionRefresh();
            return $.ajax({
                url:getUrl('session'),
                headers: headers,
                type:'DELETE'
            });

        },

        isSpecialProperty : function (key) {

            return (key == 'metadata')

        },

        configure : function (newConf) {

            conf = newConf;

        },

        getUserName : function (creds) {

            return creds ? creds.user : undefined;

        },

    };


    if ((typeof module !== 'undefined') && (module.exports)) {

        // this is node.js

        $ = require('jquery');
        btoa = require('btoa');

        module.exports = libcatconf;


    } else if (typeof define == "function") {

        // this is require.js

        define([],libcatconf);

    } else {

        // this is just a plain html script-tag.

        window.libcatconf = libcatconf;

    }


})()


