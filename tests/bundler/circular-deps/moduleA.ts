import { b } from "./moduleB";

export const a = "A uses B: " + (b || "undefined");
