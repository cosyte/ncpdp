// Types for bench/shapes.mjs, so the scaling gate in test/perf can import the bench's own inputs.

import type { NewRxInput, TelecomRequestInput } from "../src/index.js";

export declare const KIB: number;
export declare function newRx(i: number): string;
export declare function noteNewRx(i: number, bytes: number): string;
export declare function newRxInput(i: number, note?: string): NewRxInput;
export declare function noteNewRxInput(i: number, bytes: number): NewRxInput;
export declare function medicationHistory(i: number, entries: number): string;
export declare function b1Claim(i: number): string;
export declare function b1Batch(claims: number, seed?: number): string[];
export declare function b1Wide(i: number, claims: number): string;
export declare function b1Request(i: number, k?: number): TelecomRequestInput;
export declare function b1Requests(claims: number, seed?: number): TelecomRequestInput[];
