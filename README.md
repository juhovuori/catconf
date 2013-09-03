catconf
=======

To install from scratch:

1. Install and start couchdb
2. Create a couchdb admin with password
3. cp conf.js.dist to conf.js
4. Edit conf.js to reflect your couchdb settings
5. npm install
6. ./manage.js install
6. ./manage.js deploy





Termejä
=======

* *nodeId* String. javuori, petuomin, domain\_helka, jne.

* *user-node* Node, joka sisältää käyttäjän oman konfiguraation.
* *global-node* Node, jolla ei ole parentteja. Luettelointiohjelma-spesifi termi.
* *domain-node* User-noden ja global-noden välissä olevat nodet. Tämä on luettelointiohjelma-spesifi termi.
* *node* "Konfiguraatiotietue". JSON-serialisoituva data. Ilman erillistä tarkennusta node tarkoittaa aina koko nodea. Kts koko node ja single-level node.
* *single-level node* Noden oma data, josta parenteilta periytetyt propertyt on suodatettu pois.
* *koko node* Node, mukaanlukien noden oma data ja parenteilta periytetyt propertyt. Normaalisti sanotaan vain node.

* *property* noden property.
* *authenticatedUserId* Kirjautuneen käyttäjän userId. (=käyttäjän noden node\_id)

Tietorakenne
============

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

 

