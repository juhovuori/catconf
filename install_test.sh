#!/bin/sh

## This script is not a production installation script. It works on author's
# Centos virtual machine and is here for documentation purposes. There is
# no guarantee it won't fuck up your system if you run it, so don't.



# Work in home directory
cd

## Install git and get the source code.

sudo yum -y install git

git clone https://github.com/juhovuori/catconf.git


## First we need to enable EPEL-repository.

curl http://dl.fedoraproject.org/pub/epel/6/x86_64/epel-release-6-8.noarch.rpm -O
curl http://rpms.famillecollet.com/enterprise/remi-release-6.rpm -O
sudo rpm -Uvh remi-release-6*.rpm epel-release-6*.rpm


## Install couchdb

sudo yum -y install couchdb
sudo service couchdb start
sudo chkconfig --level 2 couchdb on


## Cp and edit conf.js

cd catconf
cp conf.js.dist conf.js
# We are lucky, the default configuration is ok for testing - no need to edit


## Install node.js and npm

sudo yum -y install nodejs npm make


## Install dependencies

npm install
npm update


## Create couchdb admin user

curl -X PUT http://localhost:5984/_config/admins/admin -d '"admin"'


## Setup database

node manage.js install

## Open a port from firewall
sudo iptables -I INPUT 5 -p tcp -m state --state NEW -m tcp --dport 3000 -j ACCEPT 

## Run tests
make test

# Run server

# node catconf.js


