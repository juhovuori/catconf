Quickstart
----------

Following steps are required to get catconf up and running on a freshly
installed Linux system. The procedure is tested on freshly installed CentOS 6
box, but should work on any Unix-like system with minor modifications. 
The author has no idea how to install catconf on Windows.


1. Install git to get the code from https://github.com/juhovuori/catconf.git
2. Install and start couchdb (from EPEL repository on CentOS)
3. Create a couchdb admin with password
4. cp conf.js.dist to conf.js and edit it to reflect your couchdb settings
5. Install node.js, npm and make
6. Install js dependencies: npm install && npm update
7. node manage.js install
8. node catconf.js

That's it. You should now have catconf running. There is a file named
install\_test.sh that performs exactly the steps above. It is used to test the
installation procedure. It is not guaranteed to work on any particular
system, but you can take a look at it as an additional documentation if
something goes wrong.


Overview
--------

Catconf is an inheriting configuration database.

Configuration is stored as a set of nodes that represent configuration of some sort. Each node is a JSON document. Each node can have parent nodes. Child nodes inherit configuration values of its parents.

Catconf implements an authorization scheme that effectively divides nodes into
two classes: domain nodes and user nodes. Domain nodes are the nodes that can
be inherited from. User nodes contain possibly secret configuration values of
individual users and can only be read by respective users.

Currently catconf uses CouchDB as its storage backend and implements a REST
API for its applications.


Inheritance
-----------

Catconf distinguishes between _full nodes_ and _single-level nodes_. Full
nodes are the JSON documents that are read from and written to catconf.
Single-level nodes are the JSON documents stored internally.

Inheritance is the construction of full nodes from a set of single-level
nodes. Intuitively, inheritance means that the properties of nodes
parents are also node's properties unless explicitly overridden by
node itself.

Given a single-level node:

    {
        "fullname": "Pekka Pikkanen",
        "enable": {
            "tooltips": true,
            "sounds": false
        },
        "metadata": {
            "nodeId": "pekka",
            "parents": ["myDomain"],
            "authorization": {
                "type" : "bcrypt",
                "crypted": "xxxxxxxxxxxxxxx"
            }
        }
    }

And it's parent:

    {
        "extra":"data",
        "enable": {
            "sounds":true,
            "magic":true
        },
        "metadata": {
            "nodeId": "myDomain",
            "parents": [],
        }
    }

The full node, when read from the database will turn out as follows:

    {
        "fullname": "Pekka Pikkanen",
        "extra":"data",
        "enable": {
            "tooltips": true,
            "sounds": false,
            "magic":true
        },
        "metadata": {
            "nodeId": "pekka",
            "parents": ["myDomain"],
            "authorization": {
                "type" : "bcrypt",
                "crypted": "xxxxxxxxxxxxxxx"
            }
        }
    }

There is a special property `metadata` that is never inherited. `metadata`
of a full node is (almost) always the same as the metadata of a single-level
node. Other properties are constructed as follows.

1. As a starting point: set `fullNode = singleLevelNode.metadata.parents[0];` (Suppose there is exactly one parent, we'll deal with multiple parents later)
2. For each non-object property `prop` set `fullNode[prop] = singleLevelNode[prop];`
3. For each object-property `prop` of single-level node recursively use the same process to overwrite each subproperty of the parent with corresponding subproperty of the single-level node `fullNode[prop][subProp] = singleLevelNode[prop][subProp]`

If there are no parents, then `fullNode = singleLevelNode`. If there are more
than one parent then inheritance works 'left to right'. First begin with
parents[0] and construct intermediate node by adding properties of parents[1],
etc. And finally, when all parents are combined, add properties of
the single-level node itself.

Parent-nodes may contain parents of their own. Inheritance loops are
not allowed.

Arrays are considered objects and inherit in the same way as objects.
Array indexes are interpreted as property names, the way javascript does it.
Array inheritance is sometimes not so intuitively appealing, so use
arrays with care or not at all.

A node cannot _remove_ properties of it's parents. It can however set
value of a property `null` and then it is up to the application to
interpret what this means. Once defined, property names however will
stay until the bottom of the inheritance chain.

Construction of a full node is done at read time. Thus, modifying a parent
node might cause full child nodes to change as well.

When writing a node, the inheritance process is reversed. The properties
that would be inherited anyway are removed from the single-level node being
written.


Nodes
-----

Each node in configuration database is a JSON-serializable document that
contain arbitrary properties and one special property `metadata`.
Inheritance does not apply to `metadata`.
Property names may not begin with underscore.

`metadata` is an object that has following structure:

    node.metadata = {
        "nodeId": "" // ID. This is guaranteed to be unique.
        "authorization": { } // Controls who can read node. Read below for more.
        "parents": [ ] // Parents of the node. Array of userIds.
        "nodeAdmins": [] // Array of nodeIds who can change this node. See below.
    }


Authorization datastructures and API
------------------------------------

Normally nodes can be read, written and created by anyone, including
unauthenticated users.

If a node contains `metadata.authorization` property, it is an _user node_.
Access to it is restricted. Authorization property is.

    node.metadata.authorization = {
        "type" : "bcrypt",
        "crypted" : "bcrypted-pasword-here"
    }

To read or write an user node, request must either

    1. contain HTTP Authorization header with value <nodeId>:<password> or
    2. contain a cookie that identifies the request with that node. See
       below how sessions are created.

If a node contains `metadata.nodeAdmins` property, writing it is restricted.
`nodeAdmins` is an array of `nodeId`s. Each request to write to that node
must authorize to corresponding nodes by HTTP Authorization header or
a session cookie.

Currently, there is no concept of _admin_- or _root_-users. Modifications
requiring such access must be done to the underlying database manually.

API
---

Access to catconf is done by HTTP-requests. The API follows RESTful principles.
Below is a description of allowed requests.


**GET /node**

Returns all nodeIds.  `{results:["juho","pekka",...]}`

May contain query.

- `?users` returns only user-nodes.
- `?domains` returns only non-user-nodes.
- `?in-domain=<nodeId>` return only nodes that directly inherit
    from specified node.


**GET /node/<nodeId>**

Returns the specified node.

May contain query.

- `?raw` returns internal \_-prefixed properties also.
- `?single-level` returns single-level instead of full node 

Authorization:

1. OK, if `node.metadata.nodeId == session.nodeId`
2. OK, if `node.metadata.authorization === undefined`
3. REJECT otherwise


**PUT /node/<nodeId>**

Write the specified node. Reverse inheritance is performed before actually
writing data.

Authorization:

1. REJECT, if new node would contain a parent with
  `parent.metadata.authorization !== undefined`
2. OK, if node does not exits.
3. OK, if `session.nodeId ∈ oldNode.metadata.nodeAdmins`
4. REJECT otherwise.


**DELETE /node/<nodeId>**

Deletes the specified node. If some other node inherits from this node, it
cannot be deleted.

Authorization:

1. OK, if `session.nodeId == node.metadata.nodeId`
2. OK, if `session.nodeId ∈ node.metadata.nodeAdmins`
3. REJECT otherwise


**GET /session**

Returns nodeId the current session is associated with. Also, this request
refreshes session expiration time and returns next proposed session refresh
time.


**PUT /session**

Creates a session and returns a cookie that identifies it. Login.

This request must contain `Authorization` header that identifies the node
this session will be associated with. 


**DELETE /session**

Destroys current session. Logout.


Installation, configuration and development notes
-------------------------------------------------

Check quickstart for installation instructions. Currently there is no
rc.d-scripts or the like included. Starting servers must be handled
by system administrators themselves. Also, installation by default places
all files in catconf directory, that may reside anywhere on system.
Neither installation nor running catconf requires root privileges.

`conf.js` contains all configuration. It is self documenting.

Use `nodemon` for development. Start server with
`node_modules/nodemon/nodemon.js catconf.js`.

Use `make test` to run tests. This starts up a new catconf server and creates
a test database for it. Sometimes it is nice to have test server running
continuously and perform only some tests on it. Do this:

1. `CATCONF_TEST=1 node catconf.js` # starts server in test configuration.
2. `CATCONF_TEST=1 mocha test/getnode.js` runs test in that particular
    file. Environment variable CATCONF_TEST must be set when running
    tests so that all components know to use test configuration and not
    production configuration.

`make coverage` creates test coverage reports using istanbul.js. Coverage
reports will be created in `coverage`-directory.

`make jsdoc` creates jsdoc documentation in `jsdoc` directory.


Crowd-integration
-----------------

There is an experimental crowd authentication integration, but it is
known to contain problems currently.


