declare module 'google-one-tap' {
  type GoogleOneTapOptions = Record<string, unknown>;
  type GoogleOneTapCallback = (response: any) => void;
  const googleOneTap: (options: GoogleOneTapOptions, callback: GoogleOneTapCallback) => void;
  export default googleOneTap;
}
