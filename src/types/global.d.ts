export {};

declare global {
  interface Body {
    json<T = any>(): Promise<T>;
  }
}

declare module 'google-one-tap' {
  const googleOneTap: any;
  export default googleOneTap;
}
