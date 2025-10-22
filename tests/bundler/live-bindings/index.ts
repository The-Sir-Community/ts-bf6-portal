import { counter, increment } from "./counter";

console.log(counter); // Should be 0
increment();
console.log(counter); // Should be 1 (live binding)
