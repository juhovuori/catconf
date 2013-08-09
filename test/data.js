var _ = require('underscore');

exports.testUser1 = {
    "metadata": {
        "nodeId": "testuser1",
        "parents": ["fennica"],
        "authorization": {
            "type": "password",
            "password": "koekoe"
        }
    },
    "testsetting1": "true",
    "testsetting2": "false",
    "advancedSettings": "true",
    "systems": {},
    "testsetting3": "false"
};
exports.testUser1Full = {
    "metadata": {
        "nodeId":"testuser1",
        "parents":["fennica"]
    },
    "language":"fi",
    "enableTooltips":"true",
    "mode":"marc",
    "systems":{
        "fennica_t": {
            "name": "fennica_t",
            "username": "metiva",
            "password": "Voyager8?"
        }
    },
    "testsetting1":"true",
    "testsetting2":"false",
    "advancedSettings":"true",
    "testsetting3":"false"
};

exports.testUser1NoMetadata = _.omit(exports.testUser1,"metadata");
exports.testUser1UnderscoreProperty = _.extend({},exports.testUser1,
    {"_koe":"koe"});

exports.testUser1NoNodeId = _.extend({},exports.testUser1,
    {
        "metadata": {
            "parents": ["fennica"],
            "authorization": {
                "type": "password",
                "password": "koekoe"
            }
        }
    });

exports.testUser1InvalidNodeId = _.extend({},exports.testUser1,
    {
        "metadata": {
            "nodeId": [123],
            "parents": ["fennica"],
            "authorization": {
                "type": "password",
                "password": "koekoe"
            }
        }
    });

exports.testUser1NonObjectAuthorization = _.extend({},exports.testUser1,
    {
        "metadata":{
            "nodeId": "testuser1",
            "parents": ["fennica"],
            "authorization": "koe"
        }
    });

exports.testUser1InvalidBcrypt = _.extend({},exports.testUser1,
    {
        "metadata": {
            "nodeId": "testuser1",
            "parents": ["fennica"],
            "authorization": {
                "type": "bcrypt",
                "password": 2
            }
        }
    });

exports.testUser1InvalidPassword = _.extend({},exports.testUser1,
    {
        "metadata": {
            "nodeId": "testuser1",
            "parents": ["fennica"],
            "authorization": {
                "type": "password",
                "password": true
            }
        }
    });

exports.testUser1InvalidAuthorizationType = _.extend({},exports.testUser1,
    {
        "metadata": {
            "nodeId": "testuser1",
            "parents": ["fennica"],
            "authorization": {
                "type": "koe",
                "password": "koekoe"
            }
        }
    });

exports.testUser1InheritsFromUser = _.extend({},exports.testUser1,
    {
        "metadata": {
            "nodeId": "testuser1",
            "parents": ["fennica","testuser2"],
            "authorization": {
                "type": "password",
                "password": "koekoe"
            }
        }
    });

exports.testDomainLoop1Stage1 = _.extend({},exports.testUser1,
    {
        "metadata": {
            "nodeId": "domainloop1",
            "nodeAdmins": ["testuser1"],
            "parents": []
        },
    });

exports.testDomainLoop1Stage2 = _.extend({},exports.testUser1,
    {
        "metadata": {
            "nodeId": "domainloop1",
            "nodeAdmins": ["testuser1"],
            "parents": ["domainloop2"]
        },
    });

exports.testDomainLoop2 = _.extend({},exports.testUser1,
    {
        "metadata": {
            "nodeId": "domainloop2",
            "nodeAdmins": ["testuser1"],
            "parents": ["domainloop1"]
        },
    });


exports.testUser2 = {
    "metadata": {
        "nodeId": "testuser2",
        "parents": ["fennica"],
        "authorization": {
            "type": "password",
            "password": "koe2"
        }
    },
};

exports.testDomain = {
    "metadata": {
        "nodeId": "dummydomain",
        "nodeAdmins": ["testuser2"],
        "parents": ["global"]
    },
    "setting1": true
};

// This should come out after inheritance
exports.testDomainFull = {
    "metadata":{
        "nodeId":"dummydomain",
        "nodeAdmins":["testuser2"],
        "parents":["global"]
    },
    "setting1": true,
    "language":"fi",
    "enableTooltips":"true",
    "mode":"marc"
};

exports.testUser3 = {
    "metadata": {
        "nodeId": "test",
        "parents": ["libtest","fennica"],
        "authorization": {
            "type": "password",
            "password": "passT"
        }
    },
    "systems":{},
    "testsetting1": "true",
    "testsetting2": "false",
    "advancedSettings": "true",

    "testsetting3": "false"
};

// This should come out after inheritance
exports.testUser3Full = {
    "metadata": {
        "nodeId":"test",
        "parents":["libtest","fennica"]
    },
    "language":"fi",
    "enableTooltips":"true",
    "mode":"marc",
    "systems": {
        "libtest": {
            "name": "libtest",
            "username": "aleph",
            "password": "aleph"
        },
        "fennica_t": {
            "name": "fennica_t",
            "username": "metiva",
            "password": "Voyager8?"
        }
    },
    "testsetting1":"true",
    "testsetting2":"false",
    "advancedSettings":"true",
    "testsetting3":"false"
};

exports.testJuho = {
    "_id": "juho",
    "_rev": "29-f348ce4f36355fc2521c2f3a1e39452a",
    "name": "juho",
    "f3": "saller",
    "metadata": {
        "parents": [ "fennica" ],
        "nodeId": "juho",
        "authorization": {
            "type": "bcrypt",
            "crypted": "$2a$10$YkBpx9q6lLN9TL.0WM74I.qIkjF2DsF2FWHlQ.2tDcQuLKQ1KXJqm"
        }
    },
    "f1": "rittesrrwe",
    "f2": "latio",
    "configuration": "laari"
};

exports.testWorld = [

    exports.testUser1,

    exports.testUser2,

    exports.testDomain,

    exports.testUser3,

    exports.testJuho,

    {
        "metadata": {
            "nodeId": "libtest",
            "parents": ["global"]
        },
        "systems": {
            "libtest": {
                "name": "libtest",
                "username": "aleph",
                "password": "aleph"
            }
        }
    },

    {
        "metadata": {
            "nodeId": "fennica",
            "nodeAdmins": ["testuser1"],
            "parents": ["global"]
        },
        "systems": {
            "fennica_t": {
                "name": "fennica_t",
                "username": "metiva",
                "password": "Voyager8?"
            }
        }
    },

    {
        "metadata": {
            "nodeId": "global",
            "parents": []
        },
        "language": "fi",
        "enableTooltips": "true",
        "mode": "marc"
    }
];

