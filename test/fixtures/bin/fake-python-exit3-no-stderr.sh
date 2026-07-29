#!/usr/bin/env bash
# Same EPIPE-forcing shape as fake-python-exit1-no-stderr.sh, but with an arbitrary non-zero,
# non-1 exit code and no stderr — exercises the generic internal_error fallback message.
exec 0<&-
exit 3
