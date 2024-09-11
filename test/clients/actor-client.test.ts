describe('actor-client methods', () => {
    describe('start', () => {
        it('returns an existing Run, if already available', async () => {
            // TODO: test
        });

        it('enqueues a new request, if an existing Run was found but not available', async () => {
            // TODO: test
        });

        it('enqueues a new request, if an existing Run was not found', async () => {
            // TODO: test
        });
    });

    describe('call', () => {
        it('waits for an existing Run, if already available', () => {
            // TODO: test
        });

        it('starts a new Run and waits for it, if an existing Run was found but not available', () => {
            // TODO: test
        });

        it('starts a new Run and waits for it, if an existing Run was not found', () => {
            // TODO: test
        });
    });

    describe('lastRun', () => {
        it('returns a TrackedRunClient if the Run ID is found in the tracker', () => {
            // TODO: test
        });

        it('returns a regular RunClient if the Run was not tracked', () => {
            // TODO: test
        });
    });

    describe('enqueue', () => {
        it('enqueues a single Run request', () => {
            // TODO: test
        });

        it('enqueues multiple Run requests', () => {
            // TODO: test
        });
    });

    describe('enqueueBatch', () => {
        it('splits the input according to the rules', () => {
            // TODO: test
        });
    });

    describe('startRuns', () => {
        it('starts multiple Runs', () => {
            // TODO: test
        });
    });

    describe('startBatch', () => {
        it('splits the input and starts multiple Runs', () => {
            // TODO: test
        });
    });

    describe('callRuns', () => {
        it('starts multiple Runs and waits for them to finish', () => {
            // TODO: test
        });
    });

    describe('callBatch', () => {
        it('splits the input, starts multiple Runs and waits for them to finish', () => {
            // TODO: test
        });
    });
});
