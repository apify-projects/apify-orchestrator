export function makeNameUnique(name: string, takenNames: Set<string>): string {
    return makeUnique(name, takenNames, (base, count) => `${base}-${count}`);
}

export function makePrefixUnique(prefix: string, takenPrefixes: Set<string>): string {
    // Assuming the prefix ends with a dash for better readability
    return makeUnique(prefix, takenPrefixes, (base, count) => `${base}${count}-`);
}

function makeUnique(text: string, taken: Set<string>, formatter: (base: string, count: number) => string): string {
    let counter = 1;
    let uniqueText = text;
    while (taken.has(uniqueText)) {
        counter++;
        uniqueText = formatter(text, counter);
    }
    return uniqueText;
}
