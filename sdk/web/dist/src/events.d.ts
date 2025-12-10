import type { SdkEvent } from './types';
type Handler = (payload?: any) => void;
declare class Emitter {
    private handlers;
    on(event: SdkEvent, handler: Handler): () => void;
    off(event: SdkEvent, handler: Handler): void;
    emit(event: SdkEvent, payload?: any): void;
}
export declare const emitter: Emitter;
export {};
