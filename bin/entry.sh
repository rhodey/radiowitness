#!/bin/bash
set -e

echoerr() { echo "$@" 1>&2; }

cd $HOME

if [ "$1" == "npmall" ]; then
  for libjs in $(find lib/js -name package.json -type f | grep -v node_modules | sed s/package.json//); do
    cd $libjs && npm install && cd $HOME
  done
else
  ldconfig || true
  node lib/js/rw-peer/index.js "$@"
fi
