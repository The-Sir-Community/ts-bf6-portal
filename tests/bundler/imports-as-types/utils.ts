export default class Logger {
    log(message: string): void {
        console.log(message);
    }
}

export class Helper {
    static format(value: number): string {
        return value.toString();
    }
}
