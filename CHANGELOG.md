# Changelog

## 0.6.0

### Fixed

- `fixedInput` now works as expected.

## 0.5.4

### Fixed

- Fix `greedyIterate` function.

## 0.5.3

### Fixed

- Fix tests.
- Update dependencies, fix `vitest` vulnerability.

## 0.5.2

### Added

- Added the last changed run name to `updateCallback`.

## 0.5.1

### Fixed

- Fix build.

## 0.5.0

### Breaking changes

- Removed the tracking of dataset items.

### Added

- Added the last changed run to `updateCallback`.

## 0.4.2

### Fixed

- Fix README.

## 0.4.1

### Fixed

- Fix build.

## 0.4.0

### Breaking changes

- Some public interfaces have been renamed:
    - `ScheduledClientOptions` → `ExtendedClientOptions`
    - `ScheduledApifyClient` → `ExtendedApifyClient`
    - `QueuedActorClient` → `ExtendedActorClient`
    - `TrackedRunClient` → `ExtendedRunClient`
    - `IterableDatasetClient` → `ExtendedDatasetClient`
    - `ScheduledClientOptions` → `ExtendedClientOptions`
- `iterateOutput` has been removed from `ExtendedApifyClient`.

### Added

- `mergeDatasets` is a new method of the main Orchestrator object which creates a `DatasetGroup`, that can be used to iterate multiple datasets (it replaces `iterateOutput`).

## 0.3.0 - 2024-09-27

### Breaking changes

- The method `greedyIterateOutput` has been removed from the Apify client because it does not guarantee consistency across resurrection and needs reworking.

### Fixes

- Fixed types.

## 0.2.0 - 2024-09-09

### Breaking changes

- The method `iterateDataset` has been removed from the main `orchestrator` object, because it needs to access its client's tracker now.
- The option `statsIntervalSec` has been removed from the Orchestrator's options, in favor of the new callback option, to allow the user making custom statistics.

### Added

- Active Actor jobs are considered along available memory before starting a new Run.
- `greedyIterate` is a new method of `IterableDatasetClient` which allows reading items before the run has completed.
- `greedyIterateOutput` is a new method of `ScheduledApifyClient` which uses greedy iteration to read items from the default dataset of one or more Runs.
- `onUpdate` is a new option which allows receiving the updated orchestrator's status every time it changes.

---

## 0.1.1 - 2024-07-29

### Changed

- Use `fetch` instead of `gotScraping` for getting user memory.
- Fix input split bug.

---

## 0.1.0 - 2024-07-08

### Changed

- Use semantic versioning instead of dates

### Added

- Ability to hide sensible information from logs with the option `hideSensibleInformation`

---

## 0.0.0 - 2024-06-28

_Initial release_
