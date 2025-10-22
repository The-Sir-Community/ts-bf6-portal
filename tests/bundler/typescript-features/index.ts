import { MyClass, MyEnum, myType } from "./types";

const instance = new MyClass();
console.log(instance.value);
console.log(MyEnum.A);

const value: myType = "test";
console.log(value);
