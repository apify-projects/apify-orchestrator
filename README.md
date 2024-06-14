# Apify Orchestrator

A library built around the `apify` package to run several Actors in one session.

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

## Features

- Memory management: ask the orchestrator to run as many Actors in parallel as you want, and it will start them when the account will have **enough free memory**.\
  The way this library is shaped will give you the freedom to choose how to perform you Runs: in which order, in parallel, in sequence, etc.

- Delegate the Actor runs to other accounts, providing their **Apify token**.\
  You can provide a token for each Actor. If you don't provide one, the Actor will be run on the same account as the orchestrator.

- Log all the events that occur (a Run starts, finishes, fails...) in a format **easy to read and debug** (opt-in). Some examples:

```
INFO  [google-maps] Started Run {"url":"https://console.apify.com/actors/runs/1234567890"}

INFO  [google-maps] Waiting for Run to finish {"url":"https://console.apify.com/actors/runs/1234567890"}

INFO  [google-maps] Run finished {"status":"SUCCEEDED","url":"https://console.apify.com/actors/runs/1234567890"}

WARN  [google-maps] Run failed {"status":"ABORTED","url":"https://console.apify.com/actors/runs/1234567890"}
```

- Periodically log a **report** listing the Runs and their status (opt-in). An example:

```
INFO  Orchestrator report:
    SUCCEEDED: google-maps google-search
    READY: facebook-pages tripadvisor-urls
    ABORTED: yelp-urls
```

- Store the Runs status on the Key Value Store to handle **resurrections** (opt-in).\
  Upon resurrection, if a Run was already started in the same session, another one will not be started, but the same Run will be awaited.

- Abort all the Runs in progress when the orchestrator is gracefully aborted (opt-in).\
  In this way, you have at your disposal a **kill switch** to stop all the Runs at once, for instance, to keep scraping costs under control.

- Use some utilities provided along the orchestrator to **process the results** produced by each Actor.

## Basic usage

TODO

## Process the results with the provided utilities

TODO

## Some examples

TODO

## Limitations and future improvements

- Set a custom memory limit
- Set a limit for the number of concurrent Runs
