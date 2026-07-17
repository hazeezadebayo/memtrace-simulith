```bash
$ git add api/simulith_server.js simulith/public/app.js project_report.md
$ git commit -m "fix: branch resimulation array corruption & 402 error masking"
[main bc05582] fix: branch resimulation array corruption & 402 error masking
 3 files changed, 12 insertions(+), 11 deletions(-)
$ git push
To github.com:hazeezadebayo/memtrace-simulith.git
   010074c..bc05582  main -> main
```
To github.com:hazeezadebayo/memtrace-simulith.git
   bc05582..598960f  main -> main
To github.com:hazeezadebayo/memtrace-simulith.git
   598960f..c9e4096  main -> main
To github.com:hazeezadebayo/memtrace-simulith.git
   8245175..20e7bdb  main -> main
To github.com:hazeezadebayo/memtrace-simulith.git
   20e7bdb..1e6d5b0  main -> main
To github.com:hazeezadebayo/memtrace-simulith.git
   1e6d5b0..455705c  main -> main

$ npm test
Test Suites: 5 passed, 5 total
Tests:       92 passed, 92 total
Snapshots:   0 total
Time:        15.316 s
Ran all test suites.
Force exiting Jest: Have you considered using `--detectOpenHandles` to detect async operations that kept running after all tests finished?
Exit code: 0

$ npm test
Test Suites: 5 passed, 5 total
Tests:       92 passed, 92 total
Snapshots:   0 total
Time:        15.59 s, estimated 16 s
Ran all test suites.
Force exiting Jest: Have you considered using `--detectOpenHandles` to detect async operations that kept running after all tests finished?
Exit code: 0
