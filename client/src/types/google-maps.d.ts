// TypeScript declarations for Google Maps global object
declare global {
  interface Window {
    google?: typeof google;
  }
}

export {};
