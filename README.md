# Apify Orchestrator

*Last update: 2024-06-28*

An opinionated library built around `apify` and `apify-client`, aiming at providing a nice tool for calling several external Actors in the same Run and gathering their results.

Differently from other solutions, this library does not force you to run a fixed bunch of Actors in parallel:
instead, it allows you to trigger one or more new Runs from everywhere in your code, at any moment, giving you maximum flexibility.

## Disclaimer!

This is a proof of concept, meaning that it could be removed (or moved somewhere else) at any moment.

Ideally, I would like to make this tool easily available for everyone in one of these ways:

- Integrate the code into the Apify SDK.
- Integrate the code into [`apify-extra`](https://github.com/apify-projects/apify-extra-library).
- Make this an independent npm package.

Each approach has its pros and cons.

## Main features

Most of the following features are opt-in: you can use just the ones you need.

- Automatic **memory management**: start a Run when there is enough memory available on the selected account.

- Store the Runs in progress in the Key Value Store and **resume** them after a resurrection, avoiding starting a new, redundant Run.

- Abort all the Runs in progress, triggered by the orchestrator, when the latter is gracefully aborted *(opt-in)*.\
  In this way, you have at your disposal a **kill switch** to stop all the Runs at once, for instance, to keep scraping costs under control.

- Avoid to incur in errors due to **too large strings**, e.g., due to JavaScript or Apify API limits.

- Log all the events that occur (a Run starts, finishes, fails...) in a format that is **easy to read and debug**.

- Periodically log a **report** listing the Runs and their status.

## Installation

For the time being, you can copy the content of `src` into a directory in your project of your choice.

```bash
mkdir PATH_TO_MY_PROJECT/src/orchestrator
cp -r src/* PATH_TO_MY_PROJECT/src/orchestrator/
```

The dependencies of these libraries are:

- `apify`
- `apify-client`
- `crawlee` (for `got-scraping`)

```bash
npm install apify apify-client crawlee
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
const run = await client.actor(actorId).call('my-job', actorInput); // here you can give a name to this Run!

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

Finally, if you want to split the input yourself, you can do it like this:

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

// Create an iterator using the ad-hoc Orchestrator method
const datasetIterator = orchestrator.iterateDataset(myDataset, { pageSize: 100 });

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
    __watchedRun: {
        parentRunId: Actor.getEnv().actorRunId,
        apifyUserId: Actor.getEnv().userId,
    },
};

const orchestrator = new Orchestrator({
    fixedInput: CHILDREN_RUN_KILLER_INPUT_PARAMS,
});
```

The parameters defined in `fixedInput` will be added to *all* the Runs triggered using the orchestrator object.

## Orchestrator API

Each client provided by this library extends its corresponding client from `apify-client`, e.g., `ScheduledApifyClient`
extends `ApifyClient`, and you can use any method from its super-class.

For additional information, see [this file](./src/types.ts).

## Limitations and future improvements

- Set a custom memory limit
- Set a limit for the number of concurrent Runs
- Implement other split input options
- Improve the report
- Add the number of items currently in the dataset to the report
