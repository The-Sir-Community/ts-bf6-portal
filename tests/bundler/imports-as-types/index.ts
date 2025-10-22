// This test specifically validates that imported classes can be used as types
// This was the exact issue reported: "SbxArbitraryText refers to a value, but is being used as a type here"

import { SbxArbitraryText, Widget, ComponentConfig } from "./components";
import Logger from "./utils";
import { Helper } from "./utils";

// Test 1: Named import used as type in property declaration (the original bug)
class DebugWidget {
    private lines: string[] = [];
    private lineComponents: SbxArbitraryText[] = [];  // This should work now!
    private widgets: Widget[] = [];

    constructor(private numLines = 10) {}

    init = () => {
        for (let i = 0; i < this.numLines; i++) {
            this.lineComponents.push(
                new SbxArbitraryText({
                    position: [0, 0 + i * 20],
                    size: [1920, 20],
                    text: "",
                }),
            );
        }
    };

    // Test 2: Named import as parameter type
    addComponent(component: SbxArbitraryText): void {
        this.lineComponents.push(component);
    }

    // Test 3: Named import as return type
    getComponent(index: number): SbxArbitraryText | undefined {
        return this.lineComponents[index];
    }

    // Test 4: Named import in generic type
    getAllComponents(): Array<SbxArbitraryText> {
        return this.lineComponents;
    }

    // Test 5: Interface import as parameter type
    configure(config: ComponentConfig): void {
        console.log("Configuring with:", config);
    }
}

// Test 6: Default import used as type in property
class App {
    private logger: Logger = new Logger();

    // Test 7: Default import as parameter type
    setLogger(logger: Logger): void {
        this.logger = logger;
    }

    // Test 8: Default import as return type
    getLogger(): Logger {
        return this.logger;
    }
}

// Test 9: Named import of class used as type
class UtilWrapper {
    private helper: Helper | null = null;

    // Test 10: Named import in parameter
    processHelper(helper: Helper): void {
        this.helper = helper;
    }

    // Test 11: Named import in return type
    getHelper(): Helper | null {
        return this.helper;
    }
}

// Test 12: Mixed types in union
type WidgetOrLogger = Widget | Logger;

function process(item: WidgetOrLogger): void {
    console.log(item);
}

// Test 13: Imported class in type assertion
const widget = new Widget("test");
const typedWidget: Widget = widget;

// Execute tests
const debug = new DebugWidget(5);
debug.init();
debug.addComponent(new SbxArbitraryText({ position: [0, 0], size: [100, 20], text: "Test" }));

const app = new App();
app.setLogger(new Logger());

const wrapper = new UtilWrapper();

console.log("All type annotation tests passed!");
