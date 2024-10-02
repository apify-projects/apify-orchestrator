export function makeNameUnique(name: string, takenNames: Set<string>) {
    let counter = 1;
    let uniqueName = name;
    while (takenNames.has(uniqueName)) {
        counter++;
        uniqueName = `${name}-${counter}`;
    }
    return uniqueName;
}
