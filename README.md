# Apify Orchestrator

*Last update: 2024-06-14*

An opinionated library built around the `apify` and `apify-client` packages aiming at providing a nice tool for running several Actors through the Apify's client.

Differently from other solutions, this library does not force you to run a fixed bunch of Actors in parallel:
instead, it allows you to trigger one or more new Runs from everywhere in your code, at any moment.

## Disclaimer

This is a proof of concept, meaning that it could be removed (or moved somewhere else) in any moment.

Ideally, I would like to make this tool easily available for everyone in one of these ways:

- Integrate the code into the Apify SDK.
- Integrate the code into [`apify-extra`](https://github.com/apify-projects/apify-extra-library).
- Make this an independent npm package.

Each approach has its pros and cons.

## How to use it?

For the time being, you can copy the content of `src` into a directory in your project of your choice.

The dependencies of this libraries are:

- `apify`
- `crawlee` (for `got-scraping`)

```bash
npm install apify crawlee
```

## Main features

Most of the following features are opt-in. You can use just the ones that you need.

- Memory management: ask the orchestrator to run as many Actors in parallel as you want. It will enqueue the requests, and start the Runs when the account will have **enough free memory**.

- Delegate the Runs to other accounts, providing their **Apify token**. You can provide a token for each Run you start. If you don't provide any, the Run will happen on the same account as the orchestrator.

- Log all the events that occur (a Run starts, finishes, fails...) in a format **easy to read and debug**.

- Periodically log a **report** listing the Runs and their status.

- Abort all the Runs in progress, triggered by the orchestrator, when the latter is gracefully aborted *(opt-in)*.\
  In this way, you have at your disposal a **kill switch** to stop all the Runs at once, for instance, to keep scraping costs under control.

- Keep the references the triggered Runs upon resurrections, storing the Runs' status in the Key Value Store. This means that, if the orchestrator is aborted and then resurrected (and you did not enable the kill switch), a new Run won't be triggered, and the old one will be reused, instead.

- Split an Actor's input in more parts, and trigger a different Run for each one, to speed up operations or to avoid Apify API's errors.

- **Process the results** produced by each Run using pagination, to avoid Apify API's errors.

## Main concepts and examples

First you should create an ApifyOrchestrator object.
You can define some global options, which will be described in detail later:

```js
const orchestrator = await createOrchestrator({
    enableLogs: true,
    statsIntervalSec: 300,
    persistSupport: 'kvs',
    persistPrefix: 'ORCHESTRATOR-',
    abortAllRunsOnGracefulAbort: true,
});
```

Then, to trigger a new Run, you should create a `RunRequest` object:

```js
const runRequest = {
    runName: 'google-search-run', // used internally, and in the logs, to identify this Run
    actorId: 'apify/google-search-scraper',
    input: {
        queries: ['apify', 'crawlee', 'cheerio'].join('\n'),
    },
    options: {
        timeout: 600,
    },
    apifyToken: '***',
};
```

### Trigger a Run and wait for it to finish

```js
const runRecord = await orchestrator.startAndWaitFinish(runRequest);

// On finish
console.log(runRecord); // { "google-search-run": [object ActorRun] }

// If any API error occurred
console.log(runRecord); // { "google-search-run": null }
```

### Enqueue a Run synchronously and wait for it to finish later

```js
const report = orchestrator.enqueue(runRequest)

// Check if the run request was correctly enqueued
console.log(report) // { "google-search-run": true }

// Do some stuff...

const runRecord = await orchestrator.waitFinish(runRequest.runName);
```

### Wait for a run to start, print its ID, then wait for it to finish

```js
const startedRunRecord = await orchestrator.start(runRequest);

console.log(startedRunRecord[runRequest.runName].runId);

const finishedRunRecord = await orchestrator.waitFinish(runRequest.runName)
```

### Generate several input chunks, and start a Run for each one

TODO: say why

```js
// A very, very long input array
const sourceArray = ['apify', 'crawlee', 'cheerio', ..., 'playwright', 'puppeteer', 'scraping', ...];

// A function which generates some input from a portion of the array
const inputGenerator = (sourceArray) => ({ queries: sourceArray.join('\n') });

// The rules for splitting the input
const rules = { respectApifyPayloadLimit: true };

// Generate the input chunks
const inputChunks = generateInputChunks(sourceArray, inputGenerator, rules);

console.log(inputChunks.length); // 3

// A master RunRequest to start from (there is no input here: it will be filled later)
const masterRunRequest = {
    runName: 'google-search-run',
    actorId: 'apify/google-search-scraper',
    options: {
        timeout: 600,
    },
    apifyToken: '***',
}

// Generate the requests, one for each input chunk
const runRequests = generateRunRequests(masterRunRequest, inputChunks);

console.log(runRequests.length); // 3

// A different input was added to each request
console.log(runRequests[0].input); // { queries: 'apify\ncrawlee\ncheerio...' }
console.log(runRequests[1].input); // { queries: 'playwright\npuppeteer\nscraping...' }
console.log(runRequests[2].input); // { queries: '...' }

// Will wait for all the Runs to complete
const runRecord = await orchestrator.startAndWaitFinish(...runRequests);

console.log(JSON.stringify(runRecord, null, 2));
> {
>   "google-search-run-1/3": [object ActorRun],
>   "google-search-run-2/3": [object ActorRun],
>   "google-search-run-3/3": [object ActorRun],
> }
```

### Iterate over the results (even across different Runs!), using pagination

```js
const runRecord = await orchestrator.startAndWaitFinish(...runRequests);

console.log(Object.keys(runRecord).length) // 3

const pageSize = 100;
const datasetOptions = { fields: ['id', 'name', 'date'] }

const resultsIterator = orchestrator.iteratePaginatedResults(runRecord, pageSize, datasetOptions);

for await (const item of resultsIterator) {
    const { id, name, date } = item;
    // Do some stuff...
}
```

### Use the [Children Run Killer](https://github.com/apify-projects/triangle/tree/master/children-run-killer)

Thanks to the following global option, each Run will have some extra input parameters, which will allow the Children Run Killer to identify the orchestrator and abort the Runs in case the latter crashes.

```js
const orchestrator = createOrchestrator({
    extraInputParamsBuilder: () => ({
        __watchedRun: {
            parentRunId: Actor.getEnv().actorRunId,
            apifyUserId: Actor.getEnv().userId,
        },
    }),
});
```

## API reference

TODO: API

## Orchestrator options

TODO: options

## Limitations and future improvements

- Set a custom memory limit
- Set a limit for the number of concurrent Runs
- Implement other split input options
- Improve the report
- Add the number of items currently in the dataset in the report
