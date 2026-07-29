#!/bin/sh
set -e

mkdir -p /sockets
chown appuser:appuser /sockets

exec gosu appuser "$@"