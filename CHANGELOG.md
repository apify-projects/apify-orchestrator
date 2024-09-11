# Changelog

## 0.2.0 - 2024-09-09

### Breaking change

- `iterateDataset` has been removed from the main `orchestrator` object, because it needs to access its client's tracker now.
- `statsIntervalSec` has been removed from the Orchestrator's options.

### Changed

- Improved periodical stats, which are now table-formatted and include the start timestamp and the default dataset's items count.

### Added

- Active Actor jobs are considered along available memory before starting a new Run.
- `greedyIterate` is a new method of `IterableDatasetClient` which allows reading items before the run has completed.
- `greedyIterateOutput` is a new method of `ScheduledApifyClient` which uses greedy iteration to read items from the default dataset of one or more Runs.
- `updateCallback` is a new option which allows to receive the updated orchestrator's status every time it changes.

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
