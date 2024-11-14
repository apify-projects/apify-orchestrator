# Apify Orchestrator

**0.4.1**

An opinionated library built around `apify` and `apify-client`, aiming at providing a nice tool for calling several external Actors in the same Run and gathering their results.

Differently from other solutions, this library does not force you to run a fixed bunch of Actors in parallel:
instead, it allows you to trigger one or more new Runs from everywhere in your code, at any moment, giving you maximum flexibility.

## Contributing

1. Please, take a look at existing issues and submit your pull requests to: https://github.com/apify-projects/apify-orchestrator.
2. Before starting to work on some topic, make sure to create/assign the corresponding issue to yourself.
3. Remember to bump the patch/minor/major version number:
- at the top of this README;
- in the `index.ts` file;
- in the `package.json` file.
4. This project is still to be considered in *alpha* state, and it follows the [semantic versioning](https://semver.org/) rules. This means that:
    - the major version number is `0`;
    - breaking changes are allowed on different minor versions.
4. If you are working on minor features or patches, ask to merge your work directly into the `main` branch.
5. If you are working on some feature which introduces breaking changes or is planned for the next major version, ask to merge it into the next major development branch, e.g., `dev/0.5.0`.
6. Remember to add/fix **unit tests**:
    - [`vitest`](https://vitest.dev/) is used;
    - take a look at existing tests in the `test` folder and follow the same organization/naming conventions;
    - the `package.json` includes scripts for testing.

### About the codebase

- All public objects are exported from the `index.ts` file. This includes all the types in `types.ts`:
    - if you want to create a new public interface, put it in `types.ts`, give it a meaningful name and add some `js-doc` to it, if necessary;
    - no internal interface should be in `types.ts`, because it would be exported to the user.

Thanks for your contributions!

## Main features

Most of the following features are opt-in: you can use just the ones you need.

- Automatic **resources management**: start a Run when there is enough memory and Actor jobs available on the selected account.

- Store the Runs in progress in the Key Value Store and **resume** them after a resurrection, avoiding starting a new, redundant Run.

- Abort all the Runs in progress, triggered by the orchestrator, when the latter is gracefully aborted *(opt-in)*.\
  In this way, you have at your disposal a **kill switch** to stop all the Runs at once, for instance, to keep scraping costs under control.

- Avoid to incur in errors due to **too large strings**, e.g., due to JavaScript or Apify API limits.

- Log all the events that occur (a Run starts, finishes, fails...) in a format that is **easy to read and debug**.

## Installation

```sh
npm install apify-orchestrator
```

## Quick-start

Normally, to call an Actor you would use the Apify client.
This is one way to do it **without** the Orchestrator library:

```js
import { Actor } from 'apify';

// Create a client
const client = Actor.newClient({ token });

// Generate the Actor's input
const urls = ['...', '...', ...];
const actorInput = { startUrls: urls.map((url) => ({ url })) };

// Call an Actor, creating a new Run, an wait for it to finish
const run = await client.actor(actorId).call(actorInput);

// Read the default dataset
const itemList = await client.dataset(run.defaultDatasetId).listItems();

// Process the items
for (const item of itemList.items) {
    console.log(item.value);
}
```

With the Orchestrator library:

```js
import { Orchestrator } from './orchestrator/index.js'

// Create the main orchestrator object and pass some options
const orchestrator = new Orchestrator({
    enableLogs: true,
    statsIntervalSec: 300,
    persistSupport: 'kvs',
    persistPrefix: 'ORCHESTRATOR-',
    abortAllRunsOnGracefulAbort: true,
});

// Create a new client: you can optionally give it a name
const client = await orchestrator.apifyClient({ name: 'MY-CLIENT', token });

// Generate the Actor's input
const urls = ['...', '...', ...];
const actorInput = { startUrls: urls.map((url) => ({ url })) };

// Call an Actor, creating a new Run, an wait for it to finish
// Here you can give this Run a name, which will be used wether a resurrection takes place
const run = await client.actor(actorId).call('my-job', actorInput);

// Read the default dataset
const itemList = await client.dataset(run.defaultDatasetId).listItems({ skipEmpty: true });

// Process the items
for (const item of itemList.items) {
    console.log(item.value);
}
```

The two codes are very similar, but there are already a few advantages to using the Orchestrator:
you can benefit from logs and regular reports, and the status of the Run is saved into the Key Value Store under the key
`ORCHESTRATOR-MY-CLIENT-RUNS` with the name `my-job`, so if the Orchestrator times out, you can resurrect it, and it
will wait for the same Run you started initially.
Moreover, if you gracefully abort the orchestrator while the external Run is in progress, the latter will also be aborted.

## Avoiding size limits

There are two occasions when you could exceed some limit:

1. when starting a Run and providing an input that is too large, exceeding the API limit:
```
Status code 413: the POST payload is too large (limit: 9437184 bytes, actual length: 9453568 bytes)
```

2. when you try to read a dataset that is too large all at once, exceeding the JavaScript string limit.
```
Error: Cannot create a string longer than 0x1fffffe8 characters
```

To avoid both those cases, you can fix the previous code in this way:

```js
import { Orchestrator } from './orchestrator/index.js'

// Create the main orchestrator object and pass some options
const orchestrator = new Orchestrator({
    enableLogs: true,
    statsIntervalSec: 300,
    persistSupport: 'kvs',
    persistPrefix: 'ORCHESTRATOR-',
    abortAllRunsOnGracefulAbort: true,
});

// Create a new client: you can optionally give it a name
const client = await orchestrator.apifyClient({ name: 'MY-CLIENT', token });

// These are the sources for the Actor's input
const sourceUrls = ['...', '...', ...];

// A function to generate the input, from the sources
const inputGenerator = (urls) => ({ startUrls: urls.map((url) => ({ url }))});

// Automatically split the input in multiple parts, if necessary, and start multiple Runs
const runRecord = await client.actor(actorId).callBatch(
    'my-job',                             // the Run/batch name (if multiple Runs are triggered, it will become a prefix)
    sourceUrls,                           // an array used to generate the input
    inputGenerator,                       // a function to generate the input
    { respectApifyMaxPayloadSize: true }, // tell the Orchestrator to split the input respecting the API limit
);

// Create an iterator for reading the default dataset
const datasetIterator = client.iterateOutput(runRecord, {
    pageSize: 100,   // define a page size to use pagination and avoid exceeding the string limit
    skipEmpty: true, // you can use the same options used with dataset.listItems
})

// Process the items
for await (const item of datasetIterator) {
    console.log(item.value);
}
```

Notice that `runRecord` is an object of this kind:

```js
{
    'my-job-1': [object ActorRun],
    'my-job-2': [object ActorRun],
    ...
}
```

Also, notice the `for await` at the end: it is due to the fact that `datasetIterator` is an [`AsyncGenerator`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/AsyncGenerator),
which fetches the first 100 items, iterates over them, then fetches another 100, and so on.

Be aware that, with the current implementation, input splitting may be quite slow.
If you would prefer to split the input yourself, you can do it like this:

```js
const input1 = { ... }
const input2 = { ... }

// Use callRuns instead of callBatch, and provide the names and the inputs yourself
const runRecord = await client.actor(actorId).callRuns(
    { runName: 'my-job-a', input: input1 },
    { runName: 'my-job-b', input: input2 },
);
```

## How to iterate a locally generated dataset

```js
const myDataset = await Actor.openDataset('my-named-dataset');
await myDataset.push(aVeryLargeArray)

const client = await orchestrator.apifyClient();

// Create an iterator using the ad-hoc Orchestrator method
const datasetIterator = client.dataset(myDataset.id).iterate({ pageSize: 100 });

// Process the items
for await (const item of datasetIterator) {
    console.log(item.value);
}
```

## How to abort all the external Runs on timeout or normal abort

You can use the [Children Run Killer](https://github.com/apify-projects/triangle/tree/master/children-run-killer).

You will need to set it up on your Organization or personal account.
Then, you can create an Orchestrator with the following settings:

```js
import { Actor } from 'apify';

import { Orchestrator } from './orchestrator/index.js'

const CHILDREN_RUN_KILLER_INPUT_PARAMS = {
    __watched: {
        parentRunId: Actor.getEnv().actorRunId,
        apifyUserId: Actor.getEnv().userId,
    },
};

const orchestrator = new Orchestrator({
    fixedInput: CHILDREN_RUN_KILLER_INPUT_PARAMS,
});
```

The parameters defined in `fixedInput` will be added to *all* the Runs triggered using the orchestrator object.

## How to hide sensible information from the user

Sensible information, such as Run IDs, can be logged or stored into the Key Value Store,
depending on the Orchestrator's configuration.
If you would like to keep using logs and persistance, but you want to hide such information, set these options:

```js
import { Orchestrator } from './orchestrator/index.js'

const orchestrator = new Orchestrator({
    enableLogs: true,
    hideSensibleInformation: true, // will hide information such as Run IDs from logs
    persistSupport: 'kvs', // will enable persistance-related features, such as managing resurrections
    persistEncryptionKey: 'my-secret-key', // will make data written by the Orchestrator into the Key Value Store encrypted
});
```

## Orchestrator API

Each client provided by this library extends its corresponding client from `apify-client`, e.g., `ExtendedApifyClient`
extends `ApifyClient`, and you can use any method from its super-class.

For additional information, see [this file](./src/types.ts).

## Future improvements

See [issues](https://github.com/apify-projects/apify-orchestrator/issues).
