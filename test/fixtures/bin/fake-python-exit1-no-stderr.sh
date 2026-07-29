#!/usr/bin/env bash
# Closes stdin immediately (without reading it) before exiting with the worker's
# "unprocessable input" code and no stderr output — deterministically triggers an EPIPE on the
# Node side's write into this process's stdin, exercising the guard against that becoming an
# unhandled 'error' event (see docs/DECISIONS.md), regardless of how small the piped file is.
exec 0<&-
exit 1
