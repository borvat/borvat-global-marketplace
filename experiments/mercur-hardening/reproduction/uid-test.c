#include <unistd.h>
#include <dlfcn.h>
/* Disposable test host has only uid 0 mapped. First-call shim is limited
   to initdb/postgres test processes; never used with marketplace code. */
uid_t geteuid(void) { static unsigned calls=0; return calls++ == 0 ? 65534 : 0; }
