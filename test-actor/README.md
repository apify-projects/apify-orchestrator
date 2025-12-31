# Test Apify Orchestrator

An Actor that spawns itself multiple times using the Apify Orchestrator from the same repository.

This actor was designed to run totally or partially on the platform.
To use it, push it to the platform with the command:

```sh
npm run push
```

If you want to develop this test Actor after some changes to the Apify Orchestrator, run:

```sh
npm run cp
```

to copy the updated code. The copy will not be included in the repository.

## End-to-end tests

You can set:

```json
{
    "role": "e2e-test"
}
```

in the Actor input to run the e2e test suite.

You can run the test suite both **locally** or on the **platform**, but you need to run `npm run push` at least once,
and after every change, because the **child runs** will be executed on the platform.
