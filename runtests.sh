#!/bin/sh

export CATCONF_TEST=1


## Start catconf and arrange it to be closed after the script exits

node catconf.js &
CATCONF_PID=$!

if [ -z "$CATCONF_PID" ]
then
    echo failed to run catconf
    exit 1
fi

echo catconf process $CATCONF_PID started
trap "echo killing catconf \($CATCONF_PID\);kill $CATCONF_PID" INT TERM EXIT


sleep 1 # to let catconf boot up
node_modules/mocha/bin/mocha --reporter list $*


##

exit 0

