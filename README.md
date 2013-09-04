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


Tietorakenne
------------

Konfiguraatiotietokanta koostuu nodeista. Kukin node on JSON-serialisoituva olio, joka sisältää vapaavalintaisia propertyjä, sekä konfiguraatiojärjestelmän oman metadata-propertyn \_. Metadata-property ei periydy.

    node.metadata = {
        nodeId: "" // Tämä on sama kuin käyttäjätunnus tai URL-osoitteen pala.
        authorization: {type:"bcrypt", crypted:"xx..."} // Jos tämä != undefined, tämä on käyttäjänode. Kirjoitettaessa voi olla myös {type:"password", password:"cleartextpassword"}
        parents: [] // Array of nodeIds
        nodeAdmins: [] // Array of userIds who can write
        nodeCreator: "" // userId of node creator
        nodeCtime: 0 // unix time of creation
    }

Periytyminen
------------

Koko node rakennetaan seuraavasti:

    function construct_node (node_id) {
        var single_level_node = get_single_level_node(node_id);
        var merged_parents = _.reduce(single_level_node.parents, function (node, parent_id) {
            var parent = construct_node(parent_id);
            return merge_properties(node, parent);
        },{});
        return merge_properties(merged_parents,single_level_node);
    }

Nodet tallennetaan single-level nodeina ja yhdistetään lennosta luettaessa koko nodeiksi.

Propertyt yhdistetään niin, että jokainen lapsen lehtiproperty kirjoitetaan vanhemman ko. lehtipropertyjen päälle. Puuttuvia propertyjä varten luodaan uudet propertyt. Vanhempien propertyt eivät voi poistua.

Myös Arrayt periytyvät näin. Noudatellaan javascriptin array-tulkintaa: Array on olio siinä missä muutkin, arrayn propertyt ovat sen indeksit 0, 1, 2, ... Arrayn käyttö on mahdollista, mutta tsekattava, että periytymisen semantiikka on se, mitä halutaan.


Termejä
-------

* *nodeId* String. javuori, petuomin, domain\_helka, jne.

* *user-node* Node, joka sisältää käyttäjän oman konfiguraation.
* *global-node* Node, jolla ei ole parentteja. Luettelointiohjelma-spesifi termi.
* *domain-node* User-noden ja global-noden välissä olevat nodet. Tämä on luettelointiohjelma-spesifi termi.
* *node* "Konfiguraatiotietue". JSON-serialisoituva data. Ilman erillistä tarkennusta node tarkoittaa aina koko nodea. Kts koko node ja single-level node.
* *single-level node* Noden oma data, josta parenteilta periytetyt propertyt on suodatettu pois.
* *koko node* Node, mukaanlukien noden oma data ja parenteilta periytetyt propertyt. Normaalisti sanotaan vain node.

* *property* noden property.
* *authenticatedUserId* Kirjautuneen käyttäjän userId. (=käyttäjän noden node\_id)

API
===

Kaikki requestit https:n yli. Kaikki requestit sisältävät Authorization-headerin, josta voi päätellä käyttäjän user\_id:n (Onko tämä pakko?)

Alla olevien autentikointispeksien lisäksi on lista admin-käyttäjiä, joille kaikki requestit passaavat autentikoinnin. Validointi tehdään myös admin-requesteille.

 

**GET /node**

  - Palauttaa kaikki nodeidt:
    - `{results:["juho","pekka",...]}`
  - Query:
    - domains palauttaa kaikki domain-nodet
    - in-domain=palauttaa kaikki nodet, joiden parentteihin(...) kuuluu
    - users palauttaa kaikki user-nodet

**GET /node/**

  - Palauttaa noden.
  - Autentikointi:
   
    - OK, jos oma node (nodeId = authenticatedUserId).
    - OK, jos node.authorization == undefined
    - REJECT muuten.
  - Query:
   
    - raw => palauttaa myös \_-alkuiset couchdb:n sisäiset propertyt.
    - single-level => Palauttaa periytymättömän noden.

   

**PUT /node/**

  - Autentikointi:
   
    - REJECT, jos nodella on sellainen parent, jonka metadata.authorization != undefined. (Muuten password valuu)
    - OK, jos nodea ei ole. (=kaikki (myös autentikoitumattomat) voivat luoda uuden noden, mm. uuden käyttäjän)
    - OK, jos (authenticatedUser.nodeId ∈ old\_node.node\_admins) and (authenticatedUser.nodeId ∈ newNode.nodeAdmins).
    - REJECT muuten.
    - Eli käyttäjä ei välttämättä voi editoida omaa nodea esimerkiksi.
  - Validointi
   
    - REJECT, jos nodeId -propertyn != URL:n nodeId.
    - REJECT, jos konfiguraatiotietokannassa on muita nodeja, joiden parent tämä node on, ja uudelle nodelle tulisi .authorization != undefined.
    - REJECT, jos node.parents-ketju sisältää loopin.
    - REJECT, jos noden data rikkoo peritymissääntöjä. Täytyy siis olla niin, että välittömästi tämän PUT:n jälkeen suoritettava GET palauttaa täsmälleen saman noden kuin mitä PUT sinne kirjoittaa. 
    - OK muuten

**DELETE /node/**

  - Autentikointi:
   
    - OK, jos authenticatedUser.node\_id ∈ nodeAdmins.
    - REJECT muuten
  - Validointi:
   
    - REJECT, jos tietokannasta löytyy node jonka parent poistettava node on.
    - OK muuten

 

