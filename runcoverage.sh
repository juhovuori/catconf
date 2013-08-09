#!/bin/sh

export CATCONF_TEST=1


## Start catconf and arrange it to be closed after the script exits

node_modules/istanbul/lib/cli.js cover catconf.js &
CATCONF_PID=$!

if [ -z "$CATCONF_PID" ]
then
    echo failed to run catconf
    exit 1
fi

echo catconf process $CATCONF_PID started
trap "echo nicely killing catconf \($CATCONF_PID\);curl -X POST http://localhost:3001/kill" INT TERM EXIT


sleep 1 # to let catconf boot up
mocha --reporter list $*


##

exit 0

