/**
 * Needs jquery.
 * Can be required with commonjs or require.js
 */


(function() {

    var conf = {};
    var sessionRefreshTimeout = undefined;

    function myAjax(method,url,creds,data) {

            var headers = getAuthHeaders(creds);
            var opts = { 
                crossDomain: true,
                xhrFields: { withCredentials: true },
                type : method,
                headers : headers,
                url:url
            };

            if (data !== undefined) {

                headers['Content-Type'] = 'application/json';
                opts.processData = false;
                opts.data = data;

            }
        
            return $.ajax(opts);

    }

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

            return { 'Cookie': creds.cookie };

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

        return myAjax('GET',getUrl('session'))
            .done(setSessionRefresh);

    }

    var libcatconf = {

        getAuthHeaders : getAuthHeaders,

        /** return an array of user and domain nodeIds */
        getUsersAndDomains : function (options) {

            if (options === undefined) options = {};

            return myAjax('GET',getUrl('node'),options.creds);

        },

        getUsers : function (options) {

            if (options === undefined) options = {};

            return myAjax('GET',getUrl('node?users=1'),options.creds);

        },

        getDomainMembers : function (domain,options) {

            if (options === undefined) options = {};

            var url = getUrl('node?in-domain=' + encodeURIComponent(domain))

            return myAjax('GET',url,options.creds);

        },

        getDomains : function (options) {

            if (options === undefined) options = {};

            return myAjax('GET',getUrl('node?domains=1'),options.creds);

        },

        putNode : function (node,options) {

            if (options === undefined) options = {};

            var query = options.singleLevel ? '?single-level=1' :'';
            var nodeId = options.nodeId || node.metadata.nodeId;

            return myAjax('PUT',getUrl('node/'+nodeId+query),options.creds,
                JSON.stringify(node));

        },

        deleteNode : function (nodeId,options) {

            if (options === undefined) options = {};

            return myAjax('DELETE',getUrl('node/'+nodeId),options.creds);

        },

        getNode : function (nodeId,options) {

            if (options === undefined) options = {};

            var query = options.singleLevel ? '?single-level=1' : '';

            return myAjax('GET',getUrl('node/'+nodeId+query),options.creds);

        },

        getMyNode : function (options) {

            if (options === undefined) options = {};

            var nodeId = libcatconf.getUserName(options.creds);
            var def = $.Deferred();

            if (nodeId) {
                
                return libcatconf.getNode(nodeId,options);

            } else {

                myAjax('GET',getUrl('session'),options.creds)
                    .done(gotMySession)
                    .fail(failGetMyNode);
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

            return myAjax('POST',getUrl('session'),creds)
                .done(setSessionRefresh);

        },

        logout : function (creds) {

            clearSessionRefresh();

            return myAjax('DELETE',getUrl('session'),creds)

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


