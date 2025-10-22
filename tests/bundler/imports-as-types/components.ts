export class SbxArbitraryText {
    constructor(private config: { position: number[]; size: number[]; text: string }) {}

    setText(text: string): void {
        this.config.text = text;
    }

    getText(): string {
        return this.config.text;
    }
}

export class Widget {
    constructor(public name: string) {}
}

export interface ComponentConfig {
    enabled: boolean;
}
