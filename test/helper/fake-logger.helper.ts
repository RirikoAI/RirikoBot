export const fakeLogger = (...log) => {
    // Filter nest logs from the Jest logs
    const containsNestLog = log.some(arg => {
            return typeof arg === 'string' && arg.includes("Nest")
        }
    );

    // We would only want non nest logs
    if (!containsNestLog) {
        console.log(...log)
    }

}