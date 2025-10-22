export interface MyInterface {
    value: string;
}

export type myType = string | number;

export class MyClass implements MyInterface {
    value = "Hello";
}

export enum MyEnum {
    A = 1,
    B = 2,
    C = 3
}
